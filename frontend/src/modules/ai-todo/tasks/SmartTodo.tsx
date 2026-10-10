'use client';

import { useState, useEffect, useRef } from 'react';
import TaskTree from './TaskTree';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import WeeklyPlan from './WeeklyPlan';
import { todoService, withPeriod, Task } from '@/lib/services/todoService';
import { paretoService } from '@/lib/services/paretoService';
import TaskNode from './TaskNode';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

export type SmartSubView = 'tree' | 'matrix' | 'weekly';

interface SmartTodoProps {
  model: 'ollama' | 'gemini';
}

const SUB_VIEWS: { id: SmartSubView; label: string; short: string; icon: string }[] = [
  { id: 'tree', label: 'Task Tree', short: 'Tasks', icon: 'QueueListIcon' },
  { id: 'matrix', label: 'Eisenhower Matrix', short: 'Matrix', icon: 'Squares2X2Icon' },
  { id: 'weekly', label: 'Weekly Plan', short: 'Weekly', icon: 'CalendarDaysIcon' },
];

type Toast = { tone: 'success' | 'error'; text: string };

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
  const [nlpError, setNlpError] = useState<string | null>(null);
  const [nlpAdded, setNlpAdded] = useState<string | null>(null);
  const nlpSubmittingRef = useRef(false);
  const nlpAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [treeRefreshSignal, setTreeRefreshSignal] = useState(0);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

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

  const handleNlpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = nlpInput.trim();
    // The ref (not just nlpLoading) blocks a second Enter landing before the re-render.
    if (!raw || nlpSubmittingRef.current) return;
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
      setNlpAdded(created.title);
      if (nlpAddedTimerRef.current) clearTimeout(nlpAddedTimerRef.current);
      nlpAddedTimerRef.current = setTimeout(() => setNlpAdded(null), 4000);
      setTreeRefreshSignal(prev => prev + 1);
      if (activeSubView === 'matrix') loadMatrixTasks();
    } catch (err) {
      // Input is left untouched so nothing the user typed is lost.
      setNlpError(err instanceof Error ? err.message : "Couldn't add the task.");
    } finally {
      nlpSubmittingRef.current = false;
      setNlpLoading(false);
    }
  };

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, eisenhower_quadrant: newQuadrant } : t));
    await todoService.updateTask(id, { eisenhower_quadrant: newQuadrant });
  };

  const handleAnalyze = async () => {
    if (paretoService.hasAnalyzedToday('smart')) {
      if (!confirm('You already ran analysis today. Results may be similar. Continue?')) return;
    }
    if (!confirm('AI will analyze all your tasks and identify the top 20% that will drive 80% of your results. This takes a few seconds.')) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('smart', model);
      paretoService.markAnalyzedToday('smart');
      setTreeRefreshSignal(prev => prev + 1);
      if (activeSubView === 'matrix') await loadMatrixTasks();
      const top = result.top20_count ?? 0;
      setToast({ tone: 'success', text: `Found ${top} high-leverage task${top === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total` });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Analysis failed.' });
    } finally {
      setAnalyzeLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    setAiError(null);
    try {
      await todoService.prioritizeAllWithAI(model);
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
    quadrant: t.eisenhower_quadrant || null,
  })) as unknown as (MatrixItem & Task)[];

  return (
    <div className="flex flex-col h-full gap-[1.75rem]">
      {/* 80/20 Analyze result toast */}
      {toast && (
        <div
          role="status"
          className="todo-popover fixed top-20 right-4 sm:right-[1.5rem] z-[200] flex max-w-[calc(100vw-2rem)] items-center gap-2 px-3.5 py-2.5 text-sm font-medium animate-fade-in"
        >
          <Icon
            name={toast.tone === 'success' ? 'StarIcon' : 'ExclamationTriangleIcon'}
            size={16}
            variant="solid"
            className={toast.tone === 'success' ? 'text-amber-500 shrink-0' : 'text-error shrink-0'}
          />
          <span>{toast.text}</span>
        </div>
      )}

      {/* AI Fast Capture — natural language in, structured task out */}
      <form onSubmit={handleNlpSubmit} aria-label="Add a task with AI" className="w-full">
        <div className="todo-capture todo-lit">
          <label
            htmlFor="todo-fast-capture"
            className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary"
          >
            <Icon name="SparklesIcon" size={16} variant="solid" />
            <span className="hidden sm:inline">AI Fast Capture</span>
            <span className="sr-only sm:hidden">AI Fast Capture</span>
          </label>
          <input
            id="todo-fast-capture"
            type="text"
            value={nlpInput}
            onChange={(e) => { setNlpInput(e.target.value); if (nlpError) setNlpError(null); }}
            placeholder={isGuest ? 'Try "Draft system design notes #p1"' : 'Try "Draft system design notes tomorrow #p1"'}
            aria-describedby="todo-fast-capture-hint"
            aria-invalid={nlpError ? true : undefined}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={nlpLoading || !nlpInput.trim()}
            className="todo-btn todo-btn-primary shrink-0 px-3 sm:px-4 py-2.5"
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
        <div id="todo-fast-capture-hint" aria-live="polite" className="mt-2 min-h-[18px] px-4 text-[11px] leading-snug">
          {nlpError ? (
            <p className="flex items-start gap-1.5 text-error">
              <Icon name="ExclamationCircleIcon" size={14} className="mt-px shrink-0" />
              <span>{withPeriod(nlpError)} Your text is still in the box, so you can try again.</span>
            </p>
          ) : nlpAdded ? (
            <p className="flex items-center gap-1.5 text-success">
              <Icon name="CheckCircleIcon" size={14} variant="solid" className="shrink-0" />
              <span className="truncate">Added “{nlpAdded}”</span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              {isGuest
                ? 'Press Enter to add. Priority tags #p1–#p4 work offline; log in for AI due-date and estimate parsing.'
                : 'Press Enter to add. AI picks up due dates, time estimates and priority tags (#p1–#p4).'}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="todo-segmented w-full sm:w-auto" role="group" aria-label="Planning view">
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
          className="todo-btn todo-btn-secondary"
          title="Run AI 80/20 analysis on all tasks"
        >
          {analyzeLoading ? (
            <span className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" aria-hidden="true" />
          ) : (
            <Icon name="StarIcon" size={14} variant="solid" className="text-amber-500" />
          )}
          {analyzeLoading ? 'Analyzing…' : '80/20 Analyze'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeSubView === 'tree' && <TaskTree model={model} refreshSignal={treeRefreshSignal} />}

        {activeSubView === 'matrix' && (
          <EisenhowerMatrix
            items={matrixItems}
            onQuadrantChange={handleQuadrantChange}
            showAutoSort={true}
            onAutoSort={handleAutoSort}
            autoSortLoading={autoSortLoading}
            itemRenderer={(item) => (
              <div className="pointer-events-none">
                <TaskNode
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
