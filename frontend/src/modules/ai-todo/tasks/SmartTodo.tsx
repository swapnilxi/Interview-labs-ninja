'use client';

import { useState, useEffect, useRef } from 'react';
import TaskTree from './TaskTree';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import WeeklyPlan from './WeeklyPlan';
import { todoService, withPeriod, getRelativeDueDate, Task } from '@/lib/services/todoService';
import { paretoService } from '@/lib/services/paretoService';
import TaskNode from './TaskNode';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/ui/toast';
import { confirmParetoRun } from '../shared/confirmPareto';

export type SmartSubView = 'tree' | 'matrix' | 'weekly';

interface SmartTodoProps {
  model: 'ollama' | 'gemini';
}

const SUB_VIEWS: { id: SmartSubView; label: string; short: string; icon: string }[] = [
  { id: 'tree', label: 'Task Tree', short: 'Tasks', icon: 'QueueListIcon' },
  { id: 'matrix', label: 'Eisenhower Matrix', short: 'Matrix', icon: 'Squares2X2Icon' },
  { id: 'weekly', label: 'Weekly Plan', short: 'Weekly', icon: 'CalendarDaysIcon' },
];

/**
 * The matrix places a card by one of its own quadrant ids. Earlier "Auto-Sort" runs stored the 80/20 sweep's names
 * (q1_do…q4_eliminate) instead, and a card with a quadrant the matrix doesn't know used to vanish from every quadrant
 * and from the unassigned pool. Known aliases are mapped; anything else goes to the unassigned pool.
 */
const QUADRANT_IDS = new Set(['do_now', 'schedule', 'delegate', 'eliminate']);
const QUADRANT_ALIASES: Record<string, string> = { q1_do: 'do_now', q2_schedule: 'schedule', q3_delegate: 'delegate', q4_eliminate: 'eliminate' };
function matrixQuadrant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = QUADRANT_ALIASES[raw] ?? raw;
  return QUADRANT_IDS.has(id) ? id : null;
}

/** What the capture box checks before anything is sent: it needs a title, and a priority tag alone is not a task. */
function validateCapture(raw: string): string | null {
  const text = raw.trim();
  if (!text) return 'Type a task to add.';
  if (!text.replace(/#p[1-4]\b/gi, '').trim()) return 'Add a title too: a priority tag on its own is not a task.';
  return null;
}

/** The parts of a new task worth confirming at a glance ("P1", "Due tomorrow", "30m"). P3 is the default, so it stays quiet. */
function describeCreated(task: Task): string[] {
  const details: string[] = [];
  if (task.priority && task.priority !== 'p3') details.push(task.priority.toUpperCase());
  const due = getRelativeDueDate(task.due_date);
  if (due) details.push(/^due|overdue/i.test(due.text) ? due.text : `Due ${due.text}`);
  if (task.time_estimate) details.push(task.time_estimate);
  return details;
}

export default function SmartTodo({ model }: SmartTodoProps) {
  const { isGuest } = useAuth();
  const [activeSubView, setActiveSubView] = useState<SmartSubView>('tree');

  // Matrix specific state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // NLP Capture state
  const [nlpInput, setNlpInput] = useState('');
  const [nlpLoading, setNlpLoading] = useState(false);
  // `validation` = nothing was sent (empty box, a tag with no title); `request` = the parse or the save failed.
  const [nlpError, setNlpError] = useState<{ kind: 'validation' | 'request'; message: string } | null>(null);
  const [nlpAdded, setNlpAdded] = useState<{ title: string; details: string[] } | null>(null);
  const nlpInputRef = useRef<HTMLInputElement>(null);
  const nlpSubmittingRef = useRef(false);
  // On a phone the box is too narrow for an example sentence; the hint line under it carries the details there.
  const [compactPlaceholder, setCompactPlaceholder] = useState(false);
  const nlpAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [treeRefreshSignal, setTreeRefreshSignal] = useState(0);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const loadMatrixTasks = async () => {
    setLoading(true);
    const flatTasks = await todoService.fetchTasks();
    setTasks(flatTasks.filter(t => t.status !== 'done'));
    setLoading(false);
  };

  useEffect(() => {
    if (activeSubView === 'matrix') {
      loadMatrixTasks();
    }
  }, [activeSubView]);

  useEffect(() => () => {
    if (nlpAddedTimerRef.current) clearTimeout(nlpAddedTimerRef.current);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const sync = () => setCompactPlaceholder(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const handleNlpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The ref (not just nlpLoading) blocks a second Enter landing before the re-render.
    if (nlpSubmittingRef.current) return;
    const raw = nlpInput.trim();
    const invalid = validateCapture(raw);
    if (invalid) {
      // Said inline, next to the box, and the box keeps focus: no toast, no silent no-op.
      setNlpAdded(null);
      setNlpError({ kind: 'validation', message: invalid });
      nlpInputRef.current?.focus();
      return;
    }
    nlpSubmittingRef.current = true;
    setNlpLoading(true);
    setNlpError(null);
    setNlpAdded(null);
    try {
      let created: Task;
      if (isGuest) {
        // AI parsing requires login — do a light manual parse instead (mirrors
        // the backend's own regex fallback for when AI parsing fails) so
        // guests can still add tasks from this box.
        const pMatch = raw.match(/#p([1-4])/i);
        const priority = pMatch ? (`p${pMatch[1]}` as Task['priority']) : 'p3';
        const title = raw.replace(/#p[1-4]/i, '').trim() || raw;
        created = await todoService.createTaskStrict({ title, priority, status: 'backlog' });
      } else {
        const parsed = await todoService.parseTaskWithAI(raw, model);
        if (parsed && parsed.title) {
          created = await todoService.createTaskStrict({
            title: parsed.title,
            priority: parsed.priority || 'p3',
            due_date: parsed.due_date,
            time_estimate: parsed.time_estimate,
            intention: parsed.intention,
            context: parsed.context,
            status: 'backlog',
          });
        } else {
          created = await todoService.createTaskStrict({ title: raw, priority: 'p3', status: 'backlog' });
        }
      }
      setNlpInput('');
      setNlpAdded({ title: created.title, details: describeCreated(created) });
      if (nlpAddedTimerRef.current) clearTimeout(nlpAddedTimerRef.current);
      nlpAddedTimerRef.current = setTimeout(() => setNlpAdded(null), 4000);
      setTreeRefreshSignal(prev => prev + 1);
      if (activeSubView === 'matrix') loadMatrixTasks();
    } catch (err) {
      // Input is left untouched so nothing the user typed is lost.
      setNlpError({ kind: 'request', message: err instanceof Error ? err.message : "Couldn't add the task." });
    } finally {
      nlpSubmittingRef.current = false;
      setNlpLoading(false);
      // Straight back into the box: add the next one, or fix and retry this one.
      nlpInputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    const previous = tasks.find(t => t.id === id)?.eisenhower_quadrant ?? null;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, eisenhower_quadrant: newQuadrant } : t));
    const updated = await todoService.updateTask(id, { eisenhower_quadrant: newQuadrant });
    // Not saved (the service already toasted why): move the card back instead of leaving it where it isn't.
    if (!updated) setTasks(prev => prev.map(t => t.id === id ? { ...t, eisenhower_quadrant: previous } : t));
  };

  const handleAnalyze = async () => {
    if (!(await confirmParetoRun('smart', 'all your tasks'))) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('smart', model);
      paretoService.markAnalyzedToday('smart');
      setTreeRefreshSignal(prev => prev + 1);
      if (activeSubView === 'matrix') await loadMatrixTasks();
      const top = result.top20_count ?? 0;
      toast.success(`Found ${top} high-leverage task${top === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total.`);
    } catch (err) {
      toast.error(err instanceof Error ? withPeriod(err.message) : 'Analysis failed.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    setAiError(null);
    try {
      await todoService.eisenhowerAuto(model);
      await loadMatrixTasks();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Auto-sort failed.');
    } finally {
      setAutoSortLoading(false);
    }
  };

  const matrixItems = tasks.map(t => ({
    ...t,
    id: t.id.toString(),
    quadrant: matrixQuadrant(t.eisenhower_quadrant),
  })) as unknown as (MatrixItem & Task)[];

  return (
    <div className="flex flex-col h-full gap-[1.5rem] sm:gap-[2rem]">
      {/* Capture + views: the two things you reach for first, kept together */}
      <div className="flex flex-col gap-[1.25rem]">
        {/* AI Fast Capture — natural language in, structured task out */}
        <form onSubmit={handleNlpSubmit} aria-label="Add a task with AI" aria-busy={nlpLoading} noValidate className="w-full">
          <div className="todo-capture" data-invalid={nlpError ? 'true' : undefined}>
            <Icon name="SparklesIcon" size={18} variant="solid" className="shrink-0 text-primary" aria-hidden="true" />
            <label htmlFor="todo-fast-capture" className="sr-only">AI Fast Capture</label>
            <input
              ref={nlpInputRef}
              id="todo-fast-capture"
              type="text"
              value={nlpInput}
              onChange={(e) => { setNlpInput(e.target.value); if (nlpError) setNlpError(null); }}
              // A held-down Enter repeats keydown; without this it would submit again and again.
              onKeyDown={(e) => { if (e.key === 'Enter' && e.repeat) e.preventDefault(); }}
              // Read-only (not disabled) while adding: the text can't change under the request and focus stays put.
              readOnly={nlpLoading}
              placeholder={compactPlaceholder ? 'Add a task…' : isGuest ? 'Add a task, e.g. "Review PR #p1"' : 'Add a task, e.g. "Review PR tomorrow 30m #p1"'}
              aria-describedby="todo-fast-capture-hint"
              aria-invalid={nlpError ? true : undefined}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 truncate bg-transparent px-1 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-sm"
            />
            {/* Soft until there is something to add, then the one filled button on the row. Never disabled just for
                being empty: clicking it then says what is missing instead of doing nothing. */}
            <button
              type="submit"
              disabled={nlpLoading}
              className={`todo-btn shrink-0 px-3 py-2 sm:px-4 ${nlpInput.trim() || nlpLoading ? 'todo-btn-primary' : 'todo-btn-quiet'}`}
            >
              {nlpLoading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <Icon name="PlusIcon" size={14} variant="solid" />
              )}
              <span className="hidden sm:inline">{nlpLoading ? 'Adding…' : 'Parse & Add'}</span>
              <span className="sr-only sm:hidden">{nlpLoading ? 'Adding' : 'Parse and add task'}</span>
            </button>
          </div>
          <div id="todo-fast-capture-hint" aria-live="polite" className="mt-2 min-h-[1.125rem] px-1 text-xs leading-snug">
            {nlpError ? (
              <p className="flex items-start gap-1.5 text-error">
                <Icon name="ExclamationCircleIcon" size={14} className="mt-px shrink-0" />
                <span>
                  {withPeriod(nlpError.message)}
                  {nlpError.kind === 'request' && ' Your text is still in the box, so you can try again.'}
                </span>
              </p>
            ) : nlpAdded ? (
              <p className="flex items-center gap-1.5 text-success">
                <Icon name="CheckCircleIcon" size={14} variant="solid" className="shrink-0" />
                <span className="truncate">
                  Added “{nlpAdded.title}”
                  {nlpAdded.details.length > 0 && (
                    <span className="text-muted-foreground"> · {nlpAdded.details.join(' · ')}</span>
                  )}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                <span className="sm:hidden">Press Enter to add. Tags #p1–#p4 set priority.</span>
                <span className="hidden sm:inline">
                  {isGuest
                    ? 'Press Enter to add. Priority tags #p1–#p4 work offline; log in for AI due-date and estimate parsing.'
                    : 'Press Enter to add. AI picks up due dates, time estimates and priority tags (#p1–#p4).'}
                </span>
              </p>
            )}
          </div>
        </form>

        {/* AI action error */}
        {aiError && (
          <div role="alert" className="todo-alert todo-alert-error">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">{aiError}</p>
            <button onClick={() => setAiError(null)} className="todo-focus shrink-0 rounded opacity-70 hover:opacity-100" aria-label="Dismiss error">
              <Icon name="XMarkIcon" size={12} />
            </button>
          </div>
        )}

        {/* Task intelligence: planning views + 80/20 analysis (applies to every view) */}
        <div className="flex items-center justify-between gap-x-3 gap-y-2">
          <div className="todo-segmented todo-segmented-quiet todo-segmented-accent min-w-0 flex-1 sm:flex-none" role="group" aria-label="Planning view">
            {SUB_VIEWS.map(view => (
              <button
                key={view.id}
                type="button"
                aria-pressed={activeSubView === view.id}
                onClick={() => setActiveSubView(view.id)}
                className="todo-segment flex-1 justify-center sm:flex-none"
              >
                <Icon name={view.icon} size={15} />
                <span className="sm:hidden" aria-hidden="true">{view.short}</span>
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{view.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzeLoading}
            className="todo-btn todo-btn-ghost shrink-0"
            title="Run AI 80/20 analysis on all tasks"
          >
            {analyzeLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="StarIcon" size={14} />
            )}
            <span className="hidden sm:inline">{analyzeLoading ? 'Analyzing…' : '80/20 Analyze'}</span>
            <span className="sr-only sm:hidden">{analyzeLoading ? 'Analyzing' : '80/20 Analyze'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeSubView === 'tree' && <TaskTree model={model} refreshSignal={treeRefreshSignal} />}

        {activeSubView === 'matrix' && (
          <EisenhowerMatrix
            tone="calm"
            items={matrixItems}
            onQuadrantChange={handleQuadrantChange}
            showAutoSort={true}
            onAutoSort={handleAutoSort}
            autoSortLoading={autoSortLoading}
            itemRenderer={(item) => (
              <div className="pointer-events-none">
                <TaskNode
                  variant="card"
                  task={item}
                  depth={1}
                  model={model}
                  onUpdate={() => {}}
                  onDelete={() => {}}
                  onChildrenGenerated={() => {}}
                  onUndoAvailable={() => {}}
                />
              </div>
            )}
          />
        )}

        {activeSubView === 'weekly' && <WeeklyPlan model={model} />}
      </div>
    </div>
  );
}
