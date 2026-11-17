'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import EisenhowerMatrix, { QuadrantType, MatrixItem, type DragHandleProps } from '@/components/ui/EisenhowerMatrix';
import QuickTaskCard from './QuickTaskCard';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { useDistractionShortcutLabel } from '../shared/useDistractionShortcutLabel';
import { QuickTask, ParsedBrainDumpTask, quickTaskService } from '@/lib/services/quickTaskService';
import { withPeriod } from '@/lib/services/todoService';
import { routineService, type RoutineGroup } from '@/lib/services/routineService';
import { reportFailure } from '@/lib/services/mutationFeedback';
import { paretoService } from '@/lib/services/paretoService';
import { confirmParetoRun } from '../shared/confirmPareto';
import { toMatrixQuadrant, UNSORTED, type QuickQuadrant } from '@/lib/services/quickQuadrants';
import { QUADRANT_META } from './quadrantMeta';

interface QuickDailyProps {
  model: 'ollama' | 'gemini';
}

/** Colours and labels for the quadrant a Brain Dump task was parsed into (the review step below). */
const QUADRANT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  do_now:    { label: 'Do Now',    color: 'text-red-500',    bg: 'bg-red-500/10 border-red-400/30' },
  schedule:  { label: 'Schedule',  color: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-400/30' },
  delegate:  { label: 'Delegate',  color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-400/30' },
  eliminate: { label: 'Eliminate', color: 'text-muted-foreground', bg: 'mix-bg-muted/30 border-border' },
};

/** Where the list/matrix choice is remembered. */
const VIEW_KEY = 'labninja.quick.view.v1';

/** The "Add to" choices in the capture bar: unsorted first, because that is the default. */
const ADD_TO_ORDER: QuickQuadrant[] = [UNSORTED, 'do_now', 'schedule', 'delegate', 'eliminate'];

export default function QuickDaily({ model }: QuickDailyProps) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [top20Only, setTop20Only] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  // The list is the default — check things off, reorder, sort. The matrix is the optional "Prioritise" view.
  const [view, setView] = useState<'list' | 'matrix'>('list');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'matrix') setView(saved);
    } catch { /* storage unavailable: stay on the list */ }
  }, []);
  const chooseView = (next: 'list' | 'matrix') => {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* just not remembered */ }
  };

  // Set after mount: a date rendered on the server can differ from the browser's (time zone, locale).
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  // ── Brain Dump state ──────────────────────────────────────────────────────
  const [showBrainDump, setShowBrainDump] = useState(false);
  // step: 'upload' | 'processing' | 'preview' | 'saving'
  const [brainDumpStep, setBrainDumpStep] = useState<'upload' | 'processing' | 'preview' | 'saving'>('upload');
  const [brainDumpError, setBrainDumpError] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parsedTasks, setParsedTasks] = useState<ParsedBrainDumpTask[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [uploadPreview, setUploadPreview] = useState<string | null>(null); // data URL for image preview
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI Day Plan state ──────────────────────────────────────────────────────
  const [showDayPlan, setShowDayPlan] = useState(false);
  const [dayPlanStep, setDayPlanStep] = useState<'hours' | 'loading' | 'result'>('hours');
  // Raw text, so the field can be cleared and retyped (a number state snapped to 0 / back to a default).
  const [dayPlanHoursInput, setDayPlanHoursInput] = useState('4');
  const dayPlanHours = parseFloat(dayPlanHoursInput);
  const dayPlanHoursValid = Number.isFinite(dayPlanHours) && dayPlanHours >= 0.5 && dayPlanHours <= 24;
  const [dayPlanData, setDayPlanData] = useState<any>(null);

  // ── End My Day state ─────────────────────────────────────────────────────
  const [showEndDay, setShowEndDay] = useState(false);

  // One shared toast (components/ui/ToastHost, mounted by the page) instead of a local one-off.
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') toast.error(msg);
    else toast.success(msg);
  }, []);
  const shortcutLabel = useDistractionShortcutLabel();

  // `silent` refreshes in place. A non-silent load swaps "Today's List" for a spinner, which unmounts
  // the cards in it — and the details dialog each card owns — so a refresh finishing while someone is
  // typing in one of those dialogs used to make it vanish. Only the first load shows the spinner.
  const loadTasks = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    const fetched = await quickTaskService.fetchTodayTasks();
    setTasks(fetched);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const [addDueDate, setAddDueDate] = useState<string>('');
  const [addTimeEstimate, setAddTimeEstimate] = useState<string>('');
  // New tasks land "unsorted" unless you pick a quadrant here; it resets after each add.
  const [addQuadrant, setAddQuadrant] = useState<QuickQuadrant>(UNSORTED);

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    const newTask = await quickTaskService.createTask({
      title: inputValue.trim(),
      quadrant: addQuadrant,
      source: 'manual',
      due_date: addDueDate || null,
      time_estimate: addTimeEstimate || null,
    });
    if (newTask) {
      setTasks(prev => [...prev, newTask]);
      setInputValue('');
      setAddDueDate('');
      setAddTimeEstimate('');
      setAddQuadrant(UNSORTED);
    }
  };

  // Cards in the Eisenhower matrix are fed `matrixItems`, whose ids are stringified
  // for the drag-and-drop bookkeeping. Normalize before comparing against the numeric
  // ids held in state — `24 === '24'` is false, which would silently no-op the update
  // (edit/delete/complete appearing to do nothing until a reload).
  const handleUpdateTask = useCallback((id: number | string, updates: Partial<QuickTask>) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    setTasks(prev => prev.map(t => t.id === numId ? { ...t, ...updates } : t));
  }, []);

  const handleDeleteTask = useCallback((id: number | string) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    setTasks(prev => prev.filter(t => t.id !== numId));
  }, []);

  const handleMoveToSmart = useCallback(async (id: number) => {
    const res = await quickTaskService.moveToSmart(id);
    if (res) {
      // Mark as exported (keep in list but dim it)
      handleUpdateTask(id, { is_exported: true });
      showToast('Task moved to Smart To-Do.');
    }
  }, [handleUpdateTask, showToast]);

  const handleMoveToPlan = useCallback(async (id: number) => {
    const res = await quickTaskService.moveToPlan(id);
    if (res) {
      handleUpdateTask(id, { is_exported: true });
      showToast('Task moved to Plan & Project.');
    }
  }, [handleUpdateTask, showToast]);

  // A real move: the quick task is deleted and becomes an item of the routine group.
  const handleMoveToRoutine = useCallback(async (id: number, group: RoutineGroup) => {
    try {
      await routineService.moveQuickTaskIn(id, group.id);
      setTasks(prev => prev.filter(t => t.id !== id));
      showToast(`Moved to ${group.name}.`);
    } catch (err) {
      reportFailure('move the task', err);
    }
  }, [showToast]);

  // `null` is a card dropped back into the unsorted section.
  const handleQuadrantChange = async (itemId: string | number, newQuadrant: QuadrantType | null, newIndex?: number) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    const quadrant: QuickQuadrant = newQuadrant ?? UNSORTED;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, quadrant } : t));
    const updated = await quickTaskService.updateTask(id, { quadrant, order_index: newIndex });
    if (!updated) loadTasks({ silent: true });
  };

  // The quadrant chip on a card: the way to sort without dragging.
  const handleCardQuadrantChange = (taskId: number, quadrant: QuickQuadrant) =>
    handleQuadrantChange(taskId, quadrant === UNSORTED ? null : quadrant);

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    try {
      const result = await quickTaskService.autoSort(model);
      if (result?.assignments?.length > 0) {
        await loadTasks({ silent: true });
        showToast(`AI sorted ${result.assignments.length} tasks into quadrants.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Auto-sort failed.', 'error');
    } finally {
      setAutoSortLoading(false);
    }
  };

  const handleGenerateDayPlan = async () => {
    if (!dayPlanHoursValid) return;
    setDayPlanStep('loading');
    try {
      const result = await quickTaskService.aiDayPlan(dayPlanHours, model);
      setDayPlanData(result);
      setDayPlanStep('result');
    } catch (err) {
      setDayPlanStep('hours');
      showToast(err instanceof Error ? err.message : 'Failed to generate day plan.', 'error');
    }
  };

  const handleAnalyze = async () => {
    if (!(await confirmParetoRun('quick', "today's tasks"))) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('quick', model);
      paretoService.markAnalyzedToday('quick');
      await loadTasks({ silent: true });
      showToast(`Found ${result.top20_count ?? 0} high-leverage task${(result.top20_count ?? 0) === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Analysis failed.', 'error');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  // ── Brain Dump Handlers ───────────────────────────────────────────────────

  const openBrainDump = () => {
    setShowBrainDump(true);
    setBrainDumpStep('upload');
    setBrainDumpError(null);
    setExtractedText('');
    setParsedTasks([]);
    setSelectedTasks(new Set());
    setUploadPreview(null);
  };

  const closeBrainDump = () => {
    setShowBrainDump(false);
    setBrainDumpStep('upload');
    setBrainDumpError(null);
    setExtractedText('');
    setParsedTasks([]);
    setUploadPreview(null);
  };

  const handleFileSelect = async (file: File) => {
    setBrainDumpError(null);
    // Show image preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setUploadPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview(null);
    }
    await processBrainDump(file);
  };

  const processBrainDump = async (file: File) => {
    setBrainDumpStep('processing');
    setBrainDumpError(null);
    try {
      const result = await quickTaskService.brainDumpUpload(file, model);
      setExtractedText(result.extracted_text);
      setParsedTasks(result.parsed_tasks);
      // Auto-select all by default
      setSelectedTasks(new Set(result.parsed_tasks.map((_, i) => i)));
      if (result.warning) setBrainDumpError(result.warning);
      setBrainDumpStep('preview');
    } catch (err: any) {
      setBrainDumpError(err.message || 'Failed to process image. Please try a clearer photo.');
      setBrainDumpStep('upload');
    }
  };

  const handleConfirmBrainDump = async () => {
    const tasksToSave = parsedTasks.filter((_, i) => selectedTasks.has(i));
    if (tasksToSave.length === 0) { closeBrainDump(); return; }
    setBrainDumpStep('saving');
    const result = await quickTaskService.bulkCreate(tasksToSave);
    if (result) {
      setTasks(prev => [...prev, ...result.created]);
      showToast(`${result.count} task${result.count === 1 ? '' : 's'} added from brain dump.`);
      closeBrainDump();
    } else {
      // The service already toasted why. Stay on the review step so the parsed tasks aren't lost.
      setBrainDumpStep('preview');
    }
  };

  const toggleTaskSelection = (i: number) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const updateParsedTask = (i: number, field: keyof ParsedBrainDumpTask, value: string) => {
    setParsedTasks(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  // ── Matrix items ──────────────────────────────────────────────────────────
  const activeTasks = tasks.filter(t => !t.is_exported && (!top20Only || t.is_top_20));
  // The matrix wants string ids and `null` for "unassigned"; cards get the real task back (numeric id, `unsorted`).
  const matrixItems = activeTasks.map(t => ({ ...t, id: t.id.toString(), quadrant: toMatrixQuadrant(t.quadrant) })) as unknown as (MatrixItem & QuickTask)[];
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const doneRatio = activeTasks.length ? Math.round((activeTasks.filter(t => t.done).length / activeTasks.length) * 100) : 0;

  const completedCount = activeTasks.filter(t => t.done).length;
  const totalCount = activeTasks.length;

  const cardFor = (item: MatrixItem & QuickTask, extra: { dragHandle?: DragHandleProps; chip: boolean; hideDragHandle?: boolean }) => {
    const task = taskById.get(Number(item.id));
    if (!task) return null;
    return (
      <QuickTaskCard
        task={task}
        model={model}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        onMoveToSmart={handleMoveToSmart}
        onMoveToPlan={handleMoveToPlan}
        onMoveToRoutine={handleMoveToRoutine}
        onQuadrantChange={handleCardQuadrantChange}
        showQuadrantChip={extra.chip}
        dragHandle={extra.dragHandle}
        hideDragHandle={extra.hideDragHandle}
      />
    );
  };

  const spinner = (cls: string) => <span className={`${cls} animate-spin rounded-full border-2 border-current border-t-transparent`} />;

  return (
    <div className="flex flex-col gap-[1.25rem] sm:gap-[1.75rem]">
      {/* Capture bar */}
      <div className="todo-glass flex flex-col gap-3 p-3 sm:p-[1.25rem]">
        <form onSubmit={handleCreateTask} className="flex flex-col gap-3">
          <div className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Add a task for today…"
              aria-label="New task"
              enterKeyHint="done"
              className="todo-input todo-input-quiet h-[3rem] rounded-full pl-4 pr-[8.25rem] text-base sm:text-sm"
            />
            <div className="absolute right-1.5 flex items-center gap-0.5">
              {/* Brain Dump (Handwriting) Button */}
              <button
                type="button"
                onClick={openBrainDump}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-smooth hover:bg-muted"
                title="Brain dump — upload a handwriting photo"
                aria-label="Brain dump — upload a handwriting photo"
              >
                <FlatIcon name="brain" size={20} quiet className="text-muted-foreground" />
              </button>
              {/* AI Day Plan — top-20 aware */}
              <button
                type="button"
                onClick={() => {
                  setDayPlanStep('hours');
                  setDayPlanData(null);
                  setShowDayPlan(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-smooth hover:bg-muted"
                title="Day plan"
                aria-label="Day plan"
              >
                <FlatIcon name="dayPlan" size={20} quiet className="text-muted-foreground" />
              </button>
              <button
                type="submit"
                disabled={!inputValue.trim()}
                aria-label="Add task"
                className="vc-add ml-0.5 h-9 w-9"
              >
                <Icon name="ArrowUpIcon" size={18} variant="solid" />
              </button>
            </div>
          </div>

          {/* Optional details: new tasks land "unsorted" unless you say otherwise */}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <div className="quick-option">
              <span className={`h-2.5 w-2.5 rounded-full ${QUADRANT_META[addQuadrant].dot}`} aria-hidden="true" />
              <label htmlFor="quick-add-quadrant" className="font-medium">Add to</label>
              <select
                id="quick-add-quadrant"
                value={addQuadrant}
                onChange={e => setAddQuadrant(e.target.value as QuickQuadrant)}
                className="bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
              >
                {ADD_TO_ORDER.map(q => (
                  <option key={q} value={q}>{QUADRANT_META[q].label}</option>
                ))}
              </select>
            </div>

            <div className="quick-option">
              <Icon name="ClockIcon" size={15} className="text-muted-foreground" />
              <label htmlFor="quick-add-time" className="font-medium">Time</label>
              <select
                id="quick-add-time"
                value={addTimeEstimate}
                onChange={e => setAddTimeEstimate(e.target.value)}
                className="bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
              >
                <option value="">None</option>
                <option value="15m">15 mins</option>
                <option value="30m">30 mins</option>
                <option value="45m">45 mins</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
              </select>
            </div>

            <div className="quick-option">
              <Icon name="CalendarIcon" size={15} className="text-muted-foreground" />
              <label htmlFor="quick-add-due" className="font-medium">Due</label>
              <input
                id="quick-add-due"
                type="date"
                value={addDueDate}
                onChange={e => setAddDueDate(e.target.value)}
                className="bg-transparent font-medium text-foreground focus:outline-none cursor-pointer"
              />
              {addDueDate && (
                <button
                  type="button"
                  onClick={() => setAddDueDate('')}
                  aria-label="Clear due date"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <Icon name="XMarkIcon" size={14} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Toolbar: view · 80/20 · progress */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="todo-segmented w-full sm:w-auto" role="group" aria-label="Quick Daily view">
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => chooseView('list')}
            className="todo-segment flex-1 py-2 text-sm sm:flex-none"
          >
            <Icon name="ListBulletIcon" size={16} /> List
          </button>
          <button
            type="button"
            aria-pressed={view === 'matrix'}
            onClick={() => chooseView('matrix')}
            className="todo-segment flex-1 py-2 text-sm sm:flex-none"
            title="Sort your tasks into the Eisenhower matrix by dragging"
          >
            <Icon name="Squares2X2Icon" size={16} /> Prioritise
          </button>
        </div>

        {/* Phones: one row that swipes sideways (it bleeds to the screen edge) instead of wrapping into a pile. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
          <button
            type="button"
            onClick={() => setTop20Only(!top20Only)}
            aria-pressed={top20Only}
            className={`todo-btn todo-btn-quiet shrink-0 py-2 ${top20Only ? 'todo-btn-active' : ''}`}
            title="Show only Top 20% high-leverage tasks"
          >
            <FlatIcon name="star" size={16} quiet className="text-muted-foreground" /> Top 20%
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzeLoading}
            className="todo-btn todo-btn-quiet shrink-0 py-2"
            title="Run AI 80/20 analysis on today's tasks"
          >
            {analyzeLoading ? spinner('h-3.5 w-3.5') : <FlatIcon name="star" size={16} quiet className="text-muted-foreground" />}
            {analyzeLoading ? 'Finding your top 20%…' : 'Analyze 80/20'}
          </button>
          <button
            type="button"
            onClick={handleAutoSort}
            disabled={autoSortLoading || activeTasks.length === 0}
            className="todo-btn todo-btn-quiet shrink-0 py-2"
            title="AI sorts your unsorted tasks into quadrants"
          >
            {autoSortLoading ? spinner('h-3.5 w-3.5') : <FlatIcon name="ai" size={16} quiet className="text-muted-foreground" />}
            Auto-sort
          </button>
        </div>

        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <div className="min-w-[8.5rem] flex-1 sm:flex-none">
            <p className="text-sm text-foreground">
              <span className="font-medium tabular-nums">{completedCount}</span> of{' '}
              <span className="tabular-nums">{totalCount}</span> done
              {todayLabel && <span className="hidden text-muted-foreground lg:inline"> · {todayLabel}</span>}
            </p>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Today's progress"
              aria-valuemin={0}
              aria-valuemax={totalCount || 1}
              aria-valuenow={completedCount}
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${doneRatio}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEndDay(true)}
            className="todo-btn todo-btn-quiet shrink-0 py-2"
          >
            <FlatIcon name="night" size={16} quiet className="text-muted-foreground" /> End my day
          </button>
        </div>
      </div>

      {/* Main content: one view at a time, so each task is on screen (and in the DOM) once */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 mix-border-primary/30 border-t-primary" />
        </div>
      ) : view === 'list' ? (
        activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <FlatIcon name="ok" size={60} />
            <p className="text-base font-medium">Your day is clear</p>
            <p className="text-sm">Type a task above — it lands in Unsorted, ready to sort.</p>
            <button onClick={openBrainDump} className="text-sm text-primary hover:underline">
              Brain dump to add tasks
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl">
            <EisenhowerMatrix
              tone="calm"
              layout="stack"
              items={matrixItems}
              onQuadrantChange={handleQuadrantChange}
              showHeader={false}
              unassignedFirst
              allowUnassign
              unassignedLabel="Unsorted"
              unassignedHint="New tasks land here — drag one into a quadrant, or tap Sort"
              itemRenderer={(item, _dragging, dragHandle) =>
                cardFor(item as MatrixItem & QuickTask, { dragHandle, chip: true, hideDragHandle: true })
              }
            />
          </div>
        )
      ) : (
        <EisenhowerMatrix
          tone="calm"
          items={matrixItems}
          onQuadrantChange={handleQuadrantChange}
          showHeader={false}
          unassignedFirst
          allowUnassign
          unassignedLabel="Unsorted"
          unassignedHint="— drag a task into a quadrant below"
          itemRenderer={(item) =>
            cardFor(item as MatrixItem & QuickTask, { chip: !item.quadrant, hideDragHandle: false })
          }
        />
      )}

      {/* Exported tasks (dimmed historical) */}
      {tasks.filter(t => t.is_exported).length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 px-1 text-[13px] font-medium text-muted-foreground">Moved out</p>
          {tasks.filter(t => t.is_exported).map(task => (
            <div key={`exp-${task.id}`} className="rounded px-2 py-1.5 text-xs text-muted-foreground line-through">
              {task.title}
              {task.exported_task_id && <span className="ml-1">→ Smart To-Do</span>}
              {task.exported_project_id && <span className="ml-1">→ Plan</span>}
            </div>
          ))}
        </div>
      )}

      {/* ════════ Brain Dump Modal ════════ */}
      <Modal
        isOpen={showBrainDump}
        onClose={closeBrainDump}
        labelledBy="quick-braindump-title"
        closeOnEscape={brainDumpStep !== 'saving'}
        // Don't drop a reviewed list on a stray click outside, or while a request is in flight.
        closeOnBackdrop={brainDumpStep === 'upload'}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[1.5rem] py-4 border-b border-border mix-bg-primary/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl mix-bg-primary/15 flex items-center justify-center"><FlatIcon name="brain" size={22} quiet /></div>
            <div>
              <h2 id="quick-braindump-title" className="font-heading font-semibold text-foreground text-base">Handwriting brain dump</h2>
              <p className="text-xs text-muted-foreground">
                {brainDumpStep === 'upload' && 'Upload a photo of your handwritten notes'}
                {brainDumpStep === 'processing' && 'Reading your handwriting…'}
                {brainDumpStep === 'preview' && `AI found ${parsedTasks.length} tasks — review before adding`}
                {brainDumpStep === 'saving' && 'Adding tasks to your day…'}
              </p>
            </div>
          </div>
          <button onClick={closeBrainDump} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-clean">

          {/* STEP: Upload */}
          {brainDumpStep === 'upload' && (
            <div className="p-[1.5rem] flex flex-col gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.pdf"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
              />

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose a handwriting photo, or drop one here"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                className="border-2 border-dashed mix-border-primary/40 hover:mix-border-primary/80 rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-smooth mix-bg-primary/5 hover:mix-bg-primary/10 group todo-focus"
              >
                <div className="w-16 h-16 rounded-2xl mix-bg-primary/10 group-hover:mix-bg-primary/20 flex items-center justify-center transition-smooth">
                  <FlatIcon name="camera" size={38} quiet />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Drop your handwriting photo here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                  <p className="text-xs mix-text-muted-foreground/60 mt-2">Supports: JPG, PNG, WEBP, HEIC, PDF scan</p>
                </div>
              </div>

              {brainDumpError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 leading-relaxed flex items-start gap-2">
                  <FlatIcon name="warning" size={16} className="mt-px" /> <span>{brainDumpError}</span>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg mix-bg-muted/30 border mix-border-border/50">
                <FlatIcon name="idea" size={22} quiet />
                <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                  <p><strong className="text-foreground">Best results:</strong> Good lighting, flat surface, clear handwriting</p>
                  <p>AI will extract all text, then organize it into prioritized Eisenhower tasks</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP: Processing */}
          {brainDumpStep === 'processing' && (
            <div className="p-10 flex flex-col items-center gap-[1.5rem]">
              {uploadPreview && (
                <div className="w-40 h-40 rounded-xl overflow-hidden border border-border shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadPreview} alt="Your brain dump" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-4 mix-border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-3 rounded-full mix-bg-primary/10 flex items-center justify-center"><FlatIcon name="search" size={20} quiet /></div>
                </div>
                <p className="text-sm font-medium text-foreground animate-pulse">Reading your handwriting…</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Transcribing your notes, then sorting them into tasks
                </p>
              </div>
            </div>
          )}

          {/* STEP: Preview */}
          {brainDumpStep === 'preview' && (
            <div className="flex flex-col gap-0 h-full">
              {/* Extracted text accordion */}
              {extractedText && (
                <details className="border-b border-border">
                  <summary className="px-[1.5rem] py-3 text-[13px] font-medium text-muted-foreground cursor-pointer hover:mix-bg-muted/30 transition-smooth flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5"><FlatIcon name="notes" size={16} quiet /> Extracted text</span>
                    <span className="text-xs normal-case font-normal">(click to expand)</span>
                  </summary>
                  <div className="px-[1.5rem] py-3 mix-bg-muted/20 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">{extractedText}</pre>
                  </div>
                </details>
              )}

              {brainDumpError && (
                <div className="mx-[1.5rem] mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <FlatIcon name="warning" size={16} className="mt-px" /> <span>{brainDumpError}</span>
                </div>
              )}

              {/* Task cards */}
              {parsedTasks.length > 0 ? (
                <div className="px-[1.5rem] py-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-foreground">Review tasks to add ({selectedTasks.size}/{parsedTasks.length} selected)</p>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedTasks(new Set(parsedTasks.map((_, i) => i)))}
                        className="text-xs text-primary hover:underline">Select all</button>
                      <span className="text-muted-foreground">·</span>
                      <button onClick={() => setSelectedTasks(new Set())}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline">None</button>
                    </div>
                  </div>

                  {parsedTasks.map((task, i) => {
                    const isSelected = selectedTasks.has(i);
                    const conf = QUADRANT_CONFIG[task.quadrant] || QUADRANT_CONFIG.do_now;
                    return (
                      <div key={i} className={`relative rounded-xl border transition-smooth ${isSelected ? `${conf.bg} border-l-4` : 'mix-border-border/50 mix-bg-muted/10 opacity-60'}`}>
                        <div className="flex items-start gap-3 p-3">
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleTaskSelection(i)}
                            className="flex-shrink-0 mt-0.5"
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-smooth ${isSelected ? 'bg-primary border-primary' : 'mix-border-muted-foreground/40'}`}>
                              {isSelected && <Icon name="CheckIcon" size={12} className="text-white" variant="solid" />}
                            </div>
                          </button>

                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Title — inline editable */}
                            <input
                              className="w-full text-sm font-medium text-foreground bg-transparent border-0 border-b border-dashed mix-border-border/50 focus:border-primary focus:outline-none pb-0.5"
                              value={task.title}
                              onChange={e => updateParsedTask(i, 'title', e.target.value)}
                            />

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Quadrant selector */}
                              <select
                                value={task.quadrant}
                                onChange={e => updateParsedTask(i, 'quadrant', e.target.value)}
                                className={`text-xs font-medium px-2 py-0.5 rounded-full border bg-transparent focus:outline-none cursor-pointer ${conf.color} ${conf.bg}`}
                              >
                                <option value="do_now">Do Now</option>
                                <option value="schedule">Schedule</option>
                                <option value="delegate">Delegate</option>
                                <option value="eliminate">Eliminate</option>
                              </select>

                              {/* Time estimate */}
                              {task.time_estimate && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Icon name="ClockIcon" size={10} />
                                  {task.time_estimate}
                                </span>
                              )}
                            </div>

                            {/* Context note */}
                            {task.context && (
                              <p className="text-xs text-muted-foreground leading-relaxed">{task.context}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-[1.5rem] py-10 text-center text-muted-foreground">
                  <FlatIcon name="question" size={34} quiet className="mx-auto mb-2" />
                  <p className="text-sm font-medium">No tasks found in the image</p>
                  <p className="text-xs mt-1">Check the extracted text above, or try a clearer photo.</p>
                </div>
              )}
            </div>
          )}

          {/* STEP: Saving */}
          {brainDumpStep === 'saving' && (
            <div className="p-10 flex flex-col items-center gap-4">
              <div className="w-[3rem] h-[3rem] border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-sm font-medium text-foreground">Adding {selectedTasks.size} tasks to your day…</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(brainDumpStep === 'upload' || brainDumpStep === 'preview') && (
          <div className="px-[1.5rem] py-4 border-t border-border flex items-center justify-between mix-bg-muted/10">
            {brainDumpStep === 'upload' ? (
              <>
                <p className="text-xs text-muted-foreground">Tip: {shortcutLabel} opens the distraction inbox</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-smooth hover:mix-bg-primary/90"
                >
                  <FlatIcon name="camera" size={18} quiet /> Choose photo
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setBrainDumpStep('upload'); setUploadPreview(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1">
                  <Icon name="ArrowLeftIcon" size={12} /> Upload different
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={closeBrainDump}
                    className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted transition-smooth">
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBrainDump}
                    disabled={selectedTasks.size === 0}
                    className="px-5 py-2.5 bg-primary hover:mix-bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-smooth disabled:opacity-50 flex items-center gap-2 shadow-lg"
                  >
                    <Icon name="PlusIcon" size={14} variant="solid" />
                    Add {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} to Today
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* AI Day Plan Modal — top-20 aware */}
      <Modal
        isOpen={showDayPlan}
        onClose={() => setShowDayPlan(false)}
        labelledBy="quick-dayplan-title"
        className="bg-card border border-border rounded-xl shadow-2xl max-w-xl w-full p-[1.5rem] space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FlatIcon name="dayPlan" size={26} quiet />
            <h3 id="quick-dayplan-title" className="font-heading text-lg font-semibold text-foreground">Day plan</h3>
          </div>
          <button onClick={() => setShowDayPlan(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {dayPlanStep === 'hours' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">How many hours do you have today?</p>
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              max={24}
              step={0.5}
              value={dayPlanHoursInput}
              onChange={e => setDayPlanHoursInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleGenerateDayPlan(); }}
              aria-label="Hours available today"
              aria-invalid={!dayPlanHoursValid}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring"
            />
            {!dayPlanHoursValid && (
              <p className="text-xs text-red-500">Enter a number of hours between 0.5 and 24.</p>
            )}
            <button
              onClick={handleGenerateDayPlan}
              disabled={!dayPlanHoursValid}
              className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:mix-bg-primary/90 transition-smooth disabled:opacity-50"
            >
              Plan my day
            </button>
          </div>
        )}

        {dayPlanStep === 'loading' && (
          <div className="py-[3rem] flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 mix-border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Planning your day…</p>
          </div>
        )}

        {dayPlanStep === 'result' && dayPlanData && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-clean">
            {(dayPlanData.plan || []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-[1.5rem] text-center">No tasks to plan</p>
            ) : (
              <>
                {(dayPlanData.plan || []).some((t: any) => t.is_top_20) && (
                  <div>
                    <h4 className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground"><FlatIcon name="star" size={14} /> High leverage</h4>
                    <div className="space-y-2">
                      {(dayPlanData.plan || []).filter((t: any) => t.is_top_20).map((task: any, idx: number) => (
                        <PlanSlot key={idx} task={task} />
                      ))}
                    </div>
                  </div>
                )}
                {(dayPlanData.plan || []).some((t: any) => !t.is_top_20) && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-medium text-muted-foreground">Other tasks</h4>
                    <div className="space-y-2">
                      {(dayPlanData.plan || []).filter((t: any) => !t.is_top_20).map((task: any, idx: number) => (
                        <PlanSlot key={idx} task={task} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button onClick={() => setShowDayPlan(false)}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:mix-bg-primary/90 transition-smooth">
            Close
          </button>
        </div>
      </Modal>

      {/* End My Day Modal — lets the user choose what happens to incomplete tasks */}
      {showEndDay && (
        <QuickEndDayModal
          incompleteTasks={activeTasks.filter(t => !t.done)}
          completedCount={completedCount}
          model={model}
          onClose={() => setShowEndDay(false)}
          onDayEnded={(res) => {
            setShowEndDay(false);
            loadTasks({ silent: true });
            showToast(`${res.summary}${res.top20_warning ? ` ${res.top20_warning}` : ''}`);
          }}
        />
      )}
    </div>
  );
}

interface QuickEndDayModalProps {
  incompleteTasks: QuickTask[];
  completedCount: number;
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onDayEnded: (res: any) => void;
}

function QuickEndDayModal({ incompleteTasks, completedCount, model, onClose, onDayEnded }: QuickEndDayModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, 'tomorrow' | 'smart' | 'discard'>>(() => {
    const initial: Record<number, 'tomorrow' | 'smart' | 'discard'> = {};
    incompleteTasks.forEach(t => { initial[t.id] = 'tomorrow'; });
    return initial;
  });

  const handleChoice = (taskId: number, choice: 'tomorrow' | 'smart' | 'discard') => {
    setChoices(prev => ({ ...prev, [taskId]: choice }));
  };

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const move_to_tomorrow: number[] = [];
    const move_to_smart: number[] = [];
    const discard: number[] = [];
    for (const t of incompleteTasks) {
      const choice = choices[t.id] || 'tomorrow';
      if (choice === 'tomorrow') move_to_tomorrow.push(t.id);
      else if (choice === 'smart') move_to_smart.push(t.id);
      else discard.push(t.id);
    }
    try {
      const res = await quickTaskService.endOfDay(model, { move_to_tomorrow, move_to_smart, discard });
      onDayEnded(res);
    } catch (err) {
      // endOfDay throws on failure; without this the spinner never went away (and guests, who
      // can't use it, were stuck on "Wrapping up your day…").
      setError(withPeriod(err instanceof Error ? err.message : "Couldn't end the day"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="quick-endday-title"
      closeOnEscape={!loading}
      closeOnBackdrop={!loading}
      className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlatIcon name="night" size={26} quiet />
          <span id="quick-endday-title" className="font-heading text-base font-semibold text-foreground">End my day</span>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div role="alert" className="todo-alert todo-alert-error">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">{error}</p>
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-[3rem] space-y-3">
            <span className="w-8 h-8 border-4 mix-border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground animate-pulse">Wrapping up your day…</p>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-lg mix-bg-muted/40 border border-border flex items-center justify-around text-center">
              <div>
                <span className="block text-xl font-medium tabular-nums text-foreground">{completedCount}</span>
                <span className="text-[12px] font-medium text-muted-foreground">Completed</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <span className="block text-xl font-medium tabular-nums text-foreground">{incompleteTasks.length}</span>
                <span className="text-[12px] font-medium text-muted-foreground">Incomplete</span>
              </div>
            </div>

            {incompleteTasks.length > 0 ? (
              <div className="space-y-3">
                <h4 className="flex items-center gap-1.5 text-xs font-medium text-foreground"><FlatIcon name="calendar" size={16} quiet /> What should happen to incomplete tasks?</h4>
                <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-clean pr-1">
                  {incompleteTasks.map(t => (
                    <div key={t.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                      <p className="text-xs font-medium truncate text-foreground">{t.title}</p>
                      <div className="flex gap-2">
                        {(['tomorrow', 'smart', 'discard'] as const).map(act => (
                          <button
                            key={act}
                            type="button"
                            onClick={() => handleChoice(t.id, act)}
                            className={`flex flex-1 items-center justify-center gap-1.5 py-1 rounded text-xs font-medium transition-smooth border ${
                              choices[t.id] === act
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'mix-bg-muted/30 text-muted-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <FlatIcon name={act === 'tomorrow' ? 'calendar' : act === 'smart' ? 'brain' : 'trash'} size={16} quiet />
                            {act === 'tomorrow' ? 'Tomorrow' : act === 'smart' ? 'To Smart To-Do' : 'Discard'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Everything’s done</p>
            )}
          </>
        )}
      </div>

      {!loading && (
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:mix-bg-primary/90 transition-smooth"
          >
            End day
          </button>
        </div>
      )}
    </Modal>
  );
}

function PlanSlot({ task }: { task: any }) {
  return (
    <div className={`p-2.5 rounded-lg border bg-card shadow-sm ${task.is_top_20 ? 'border-amber-400/50 ring-1 ring-amber-400/20' : 'border-border'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          {task.is_top_20 && <FlatIcon name="star" size={14} label="Top 20% task" />}
          {task.title}
        </span>
        {task.allocated_time && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {task.allocated_time}
          </span>
        )}
      </div>
      {task.reason && <p className="text-xs text-muted-foreground mt-1 leading-snug">{task.reason}</p>}
    </div>
  );
}
