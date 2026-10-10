'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import TaskNode from './TaskNode';
import FilterBar, { type TaskFilters } from './FilterBar';
import AddTaskModal from './AddTaskModal';
import {
  type Task,
  type TodoStats,
  DEPTH_COLORS,
  DEPTH_LABELS,
  flattenTree,
  getRelativeDueDate,
  todoService,
  withPeriod,
} from '@/lib/services/todoService';
import { aiQueryString } from '@/lib/services/settingsService';
import { apiFetch, parseApiError } from '@/lib/http/apiClient';

interface TaskTreeProps {
  model: 'ollama' | 'gemini';
  /** Bumped by the parent after it adds or re-scores tasks; reloads in place so search & filters survive. */
  refreshSignal?: number;
}

const DEFAULT_FILTERS: TaskFilters = {
  status: 'all',
  priority: 'all',
  time: 'all',
  genType: 'all',
  search: '',
  view: 'tree',
  top20: false,
};

const DAILY_TARGET = 3;

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export default function TaskTree({ model, refreshSignal = 0 }: TaskTreeProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTitle, setAddModalTitle] = useState('');
  const [showBrainDumpModal, setShowBrainDumpModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const quickAddSubmittingRef = useRef(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [undoInfo, setUndoInfo] = useState<{ parentId: number; previousChildren: Task[] } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [resumeTask, setResumeTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<TodoStats | null>(null);

  const loadStats = useCallback(async () => {
    const data = await todoService.getStats();
    // On failure keep whatever real numbers we had (or none) — never show made-up zeros.
    if (data) {
      setStats(data);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const [activePlan, setActivePlan] = useState<any | null>(null);
  const [showStartDayModal, setShowStartDayModal] = useState(false);
  const [showEndDayModal, setShowEndDayModal] = useState(false);

  const loadDailyPlan = useCallback(async () => {
    const res = await todoService.getDailyPlan();
    if (res && res.status === 'active') {
      setActivePlan(res.plan);
    } else {
      setActivePlan(null);
    }
  }, []);

  useEffect(() => {
    loadDailyPlan();
  }, [loadDailyPlan]);

  // ── Load tasks ──────────────────────────────────────────────────────────

  const loadTasks = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      setTasks(await todoService.fetchTaskTreeStrict());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load your tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Parent-triggered refresh (AI Fast Capture, 80/20 analysis). The mount load is handled above.
  const lastRefreshSignalRef = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === lastRefreshSignalRef.current) return;
    lastRefreshSignalRef.current = refreshSignal;
    loadTasks({ silent: true });
    loadStats();
  }, [refreshSignal, loadTasks, loadStats]);

  // ── Task tree mutation helpers ──────────────────────────────────────────

  const updateTaskInTree = useCallback((taskId: number, updates: Partial<Task>) => {
    if ('status' in updates) {
      loadStats();
      setTimeout(() => {
        loadDailyPlan();
      }, 300);
    }
    setTasks(prev => {
      function walk(nodes: Task[]): Task[] {
        return nodes.map(n => {
          if (n.id === taskId) return { ...n, ...updates };
          if (n.children?.length) return { ...n, children: walk(n.children) };
          return n;
        });
      }
      return walk(prev);
    });
  }, [loadStats, loadDailyPlan]);

  const deleteTaskFromTree = useCallback((taskId: number) => {
    setTasks(prev => {
      function walk(nodes: Task[]): Task[] {
        return nodes
          .filter(n => n.id !== taskId)
          .map(n => n.children?.length ? { ...n, children: walk(n.children) } : n);
      }
      return walk(prev);
    });
  }, []);

  const addChildrenToTask = useCallback((parentId: number, newChildren: Task[]) => {
    setTasks(prev => {
      function walk(nodes: Task[]): Task[] {
        return nodes.map(n => {
          if (n.id === parentId) {
            return { ...n, children: [...(n.children || []), ...newChildren] };
          }
          if (n.children?.length) return { ...n, children: walk(n.children) };
          return n;
        });
      }
      return walk(prev);
    });
  }, []);

  const replaceChildrenOfTask = useCallback((parentId: number, newChildren: Task[]) => {
    setTasks(prev => {
      function walk(nodes: Task[]): Task[] {
        return nodes.map(n => {
          if (n.id === parentId) return { ...n, children: newChildren };
          if (n.children?.length) return { ...n, children: walk(n.children) };
          return n;
        });
      }
      return walk(prev);
    });
  }, []);

  // ── Undo handler (feedback #1) ──────────────────────────────────────────

  const handleUndoAvailable = useCallback((parentId: number, previousChildren: Task[]) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoInfo({ parentId, previousChildren });
    undoTimerRef.current = setTimeout(() => setUndoInfo(null), 10000);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoInfo) return;
    // Delete newly generated children from backend
    const currentTask = flattenTree(tasks).find(t => t.id === undoInfo.parentId);
    if (currentTask?.children) {
      for (const child of currentTask.children) {
        if (!undoInfo.previousChildren.find(pc => pc.id === child.id)) {
          await todoService.deleteTask(child.id);
        }
      }
    }
    replaceChildrenOfTask(undoInfo.parentId, undoInfo.previousChildren);
    setUndoInfo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [undoInfo, tasks, replaceChildrenOfTask]);

  // ── Event handlers from TaskNode ────────────────────────────────────────

  const handleChildrenGenerated = useCallback((parentId: number, children: Task[], _genType: string) => {
    // For regenerate, replace; for new generation, append
    const parent = flattenTree(tasks).find(t => t.id === parentId);
    if (parent && parent.children?.length && children[0]) {
      // Check if these are regenerated (no overlap with existing)
      const existingIds = new Set(parent.children.map(c => c.id));
      const isRegenerate = !children.some(c => existingIds.has(c.id));
      if (isRegenerate && parent.children.length > 0) {
        replaceChildrenOfTask(parentId, children);
        return;
      }
    }
    addChildrenToTask(parentId, children);
  }, [tasks, addChildrenToTask, replaceChildrenOfTask]);

  // ── Task creation ───────────────────────────────────────────────────────

  const openQuickAdd = useCallback(() => {
    setShowQuickAdd(true);
    setTimeout(() => quickAddInputRef.current?.focus(), 60);
  }, []);

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setQuickAddTitle('');
    setQuickAddError(null);
  }, []);

  const openAddModal = useCallback((title = '') => {
    setAddModalTitle(title);
    setShowAddModal(true);
  }, []);

  const handleTaskCreated = useCallback((task: Task) => {
    setTasks(prev => [...prev, { ...task, children: [] }]);
    setShowAddModal(false);
    // Came from the quick-add row's "More details" — that draft is now saved.
    if (addModalTitle) setQuickAddTitle('');
    setAddModalTitle('');
    loadStats();
  }, [addModalTitle, loadStats]);

  const handleQuickAdd = useCallback(async () => {
    const title = quickAddTitle.trim();
    // The ref (not just quickAddLoading) blocks a second Enter landing before the re-render.
    if (!title || quickAddSubmittingRef.current) return;
    quickAddSubmittingRef.current = true;
    setQuickAddLoading(true);
    setQuickAddError(null);
    try {
      const task = await todoService.createTaskStrict({ title, parent_id: null });
      setTasks(prev => [...prev, { ...task, children: [] }]);
      setQuickAddTitle('');
      loadStats();
    } catch (err) {
      // Keep the typed title so the user can retry without retyping.
      setQuickAddError(err instanceof Error ? err.message : "Couldn't add the task.");
    } finally {
      quickAddSubmittingRef.current = false;
      setQuickAddLoading(false);
    }
  }, [quickAddTitle, loadStats]);

  // ── Filtering ───────────────────────────────────────────────────────────

  const filterTasks = useCallback((nodes: Task[]): Task[] => {
    const { status, priority, time, genType, search, top20 } = filters;

    function matches(task: Task): boolean {
      if (status !== 'all' && task.status !== status) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (genType !== 'all' && task.generation_type !== genType) return false;
      if (top20 && !task.is_top_20) return false;
      if (search && !task.title.toLowerCase().includes(search.toLowerCase()) &&
          !(task.context || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (time !== 'all') {
        const est = task.time_estimate?.toLowerCase() || '';
        const mins = parseTimeMinutes(est);
        if (time === 'quick' && (mins === null || mins > 30)) return false;
        if (time === 'medium' && (mins === null || mins <= 30 || mins > 120)) return false;
        if (time === 'deep' && (mins === null || mins <= 120)) return false;
      }
      return true;
    }

    function walkFilter(nodes: Task[]): Task[] {
      return nodes
        .map(n => {
          const filteredChildren = n.children?.length ? walkFilter(n.children) : [];
          const selfMatches = matches(n);
          const childrenMatch = filteredChildren.length > 0;

          if (selfMatches || childrenMatch) {
            return { ...n, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean) as Task[];
    }

    if (filters.view === 'focus') {
      const flat = flattenTree(nodes);
      return flat.filter(t =>
        (t.status === 'in_progress' || (getRelativeDueDate(t.due_date)?.isOverdue)) &&
        (!top20 || t.is_top_20)
      );
    }

    const hasAnyFilter = status !== 'all' || priority !== 'all' || time !== 'all' || genType !== 'all' || search || top20;
    if (!hasAnyFilter) return nodes;

    return walkFilter(nodes);
  }, [filters]);

  function parseTimeMinutes(est: string): number | null {
    const hMatch = est.match(/(\d+)\s*h/);
    const mMatch = est.match(/(\d+)\s*m/);
    let total = 0;
    if (hMatch) total += parseInt(hMatch[1]) * 60;
    if (mMatch) total += parseInt(mMatch[1]);
    return total > 0 ? total : null;
  }

  const filteredTasks = filterTasks(tasks);
  const allTasks = flattenTree(tasks);
  const openCount = allTasks.filter(t => t.status !== 'done').length;
  const hasNarrowingFilter =
    filters.status !== 'all' || filters.priority !== 'all' || filters.time !== 'all' ||
    filters.genType !== 'all' || filters.top20;

  // ── Today section (feedback #6) ─────────────────────────────────────────

  const todayTasks = allTasks.filter(t => {
    if (t.status === 'done') return false;
    const due = getRelativeDueDate(t.due_date);
    return due?.isOverdue || due?.isDueToday;
  });

  const planDone = activePlan?.tasks ? activePlan.tasks.filter((t: any) => t.status === 'done').length : 0;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* Progress overview — only real numbers; hidden if stats couldn't load */}
      {stats && <StatsRow stats={stats} />}

      <section aria-labelledby="todo-tasks-heading" className="flex flex-col gap-3">
        {/* Section header + primary actions */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-baseline gap-2">
            <h2 id="todo-tasks-heading" className="font-heading text-base font-semibold leading-tight text-foreground">
              Tasks
            </h2>
            {!loading && !loadError && allTasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {openCount} open · {allTasks.length} total
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrainDumpModal(true)}
              title="Paste a text dump and let AI turn it into structured tasks"
              className="todo-btn todo-btn-secondary"
            >
              <Icon name="LightBulbIcon" size={14} />
              Brain Dump
            </button>
            {!activePlan ? (
              <button
                type="button"
                onClick={() => setShowStartDayModal(true)}
                title="Let AI pick today's focus tasks for the hours you have"
                className="todo-btn todo-btn-secondary"
              >
                <Icon name="SunIcon" size={14} />
                Start Day
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowEndDayModal(true)}
                title="Reschedule what's left and reflect on today"
                className="todo-btn todo-btn-secondary"
              >
                <Icon name="MoonIcon" size={14} />
                End Day
              </button>
            )}
            <button
              type="button"
              onClick={openQuickAdd}
              aria-expanded={showQuickAdd}
              aria-controls="todo-quick-add"
              title="Add a task without opening a form"
              className="todo-btn todo-btn-primary"
            >
              <Icon name="PlusIcon" size={14} variant="solid" />
              New Todo
            </button>
          </div>
        </div>

        {/* Inline quick-add row */}
        {showQuickAdd && (
          <div id="todo-quick-add" className="animate-fade-in">
            <form
              onSubmit={e => { e.preventDefault(); handleQuickAdd(); }}
              className="todo-capture"
              aria-label="Quick add task"
            >
              <label htmlFor="todo-quick-add-input" className="sr-only">New task title</label>
              <Icon name="PlusIcon" size={16} className="ml-2 shrink-0 text-muted-foreground" />
              <input
                id="todo-quick-add-input"
                ref={quickAddInputRef}
                autoFocus
                type="text"
                value={quickAddTitle}
                onChange={e => { setQuickAddTitle(e.target.value); if (quickAddError) setQuickAddError(null); }}
                onKeyDown={e => { if (e.key === 'Escape') closeQuickAdd(); }}
                placeholder="Task title — press Enter to add"
                readOnly={quickAddLoading}
                aria-busy={quickAddLoading}
                aria-invalid={quickAddError ? true : undefined}
                aria-describedby={quickAddError ? 'todo-quick-add-error' : undefined}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={() => openAddModal(quickAddTitle.trim())}
                className="todo-btn todo-btn-ghost hidden sm:inline-flex"
                title="Open the full form: priority, due date, context, recurrence"
              >
                More details
              </button>
              <button
                type="submit"
                disabled={!quickAddTitle.trim() || quickAddLoading}
                className="todo-btn todo-btn-primary"
              >
                {quickAddLoading ? <Spinner /> : <Icon name="CheckIcon" size={14} variant="solid" />}
                <span className="hidden sm:inline">Add</span>
                <span className="sr-only sm:hidden">Add task</span>
              </button>
              <button
                type="button"
                onClick={closeQuickAdd}
                className="todo-btn todo-btn-ghost px-2"
                aria-label="Close quick add (Esc)"
                title="Close (Esc)"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            </form>
            {quickAddError && (
              <p id="todo-quick-add-error" role="alert" className="mt-1.5 flex items-start gap-1.5 px-1 text-[11px] leading-snug text-error">
                <Icon name="ExclamationCircleIcon" size={14} className="mt-px shrink-0" />
                <span>{withPeriod(quickAddError)} Your title is kept, so you can try again.</span>
              </p>
            )}
          </div>
        )}

        {/* Pinned Today's Focus Plan (Feature 1) */}
        {activePlan && activePlan.tasks && activePlan.tasks.length > 0 && (
          <div className="todo-glass p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="todo-icon-chip h-7 w-7">
                  <Icon name="FlagIcon" size={14} variant="solid" />
                </span>
                <h3 className="font-heading text-sm font-semibold leading-tight text-foreground">Today&apos;s Focus</h3>
                <span className="text-xs text-muted-foreground">{activePlan.plan_date}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">
                {planDone} / {activePlan.tasks.length} done
              </span>
            </div>
            <div
              className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Today's focus progress"
              aria-valuemin={0}
              aria-valuemax={activePlan.tasks.length}
              aria-valuenow={planDone}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(planDone / activePlan.tasks.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {activePlan.tasks.map((task: any) => (
                <li
                  key={task.id}
                  className="todo-task-card flex items-center justify-between gap-3 px-3 py-2"
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={task.status === 'done'}
                      onChange={async () => {
                        const newStatus = task.status === 'done' ? 'in_progress' : 'done';
                        const updated = await todoService.updateTask(task.id, { status: newStatus });
                        if (updated) {
                          updateTaskInTree(task.id, { status: newStatus });
                          loadDailyPlan();
                        }
                      }}
                      className="todo-focus h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--color-primary)]"
                    />
                    <span className={`truncate text-xs font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </span>
                    {activePlan.reasoning[task.id] && (
                      <span className="hidden truncate text-[11px] italic text-muted-foreground md:inline">
                        · {activePlan.reasoning[task.id]}
                      </span>
                    )}
                  </label>
                  <span className="todo-chip bg-muted text-muted-foreground">
                    {task.time_estimate || 'no est'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Search, filters & layout */}
        <FilterBar filters={filters} onChange={setFilters} />

        {/* Undo toast (feedback #1) */}
        {undoInfo && (
          <div role="status" className="todo-alert todo-alert-info items-center animate-fade-in">
            <Icon name="ArrowUturnLeftIcon" size={14} className="shrink-0 text-primary" />
            <span className="flex-1">AI subtasks generated.</span>
            <button
              type="button"
              onClick={handleUndo}
              className="todo-focus rounded font-semibold text-primary hover:underline"
            >
              Undo
            </button>
            <span className="text-[10px] text-muted-foreground">Expires in 10s</span>
          </div>
        )}

        {/* Today section (feedback #6) */}
        {todayTasks.length > 0 && filters.view !== 'focus' && (
          <div className="todo-alert todo-alert-warning flex-col gap-1.5 py-2.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0" />
              Due today &amp; overdue ({todayTasks.length})
            </div>
            <ul className="w-full space-y-1 pl-5">
              {todayTasks.map(t => {
                const due = getRelativeDueDate(t.due_date);
                return (
                  <li key={t.id} className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 font-semibold ${due?.isOverdue ? 'text-error' : ''}`}>
                      {due?.text}
                    </span>
                    <span className="truncate text-foreground">{t.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Depth legend — only meaningful in the nested tree layout */}
        {!loading && !loadError && filters.view === 'tree' && filteredTasks.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Depth</span>
            {DEPTH_COLORS.map((color, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1"
                title={`Level ${i + 1}${i === 4 ? ' and deeper' : ''} (${DEPTH_LABELS[i]})`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                L{i + 1}{i === 4 ? '+' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading tasks">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-lg bg-muted motion-safe:animate-pulse" />
            ))}
          </div>
        )}

        {/* Load failure — never disguised as an empty list */}
        {!loading && loadError && (
          <div role="alert" className="todo-glass flex flex-col items-center gap-3 px-5 py-10 text-center">
            <span className="todo-alert-error flex h-11 w-11 items-center justify-center rounded-full border">
              <Icon name="ExclamationTriangleIcon" size={22} />
            </span>
            <div>
              <h3 className="font-heading text-sm font-semibold leading-tight text-foreground">Couldn&apos;t load your tasks</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{loadError}</p>
            </div>
            <button type="button" onClick={() => loadTasks()} className="todo-btn todo-btn-secondary">
              <Icon name="ArrowPathIcon" size={14} />
              Try again
            </button>
          </div>
        )}

        {/* Task list */}
        {!loading && !loadError && filteredTasks.length > 0 && (
          <div>
            {/* List flattens the tree; Focus is already a flat list; Tree renders nested. */}
            {(filters.view === 'list' ? flattenTree(filteredTasks) : filteredTasks).map(task => (
              <TaskNode
                key={task.id}
                task={task}
                depth={1}
                model={model}
                onUpdate={updateTaskInTree}
                onDelete={deleteTaskFromTree}
                onChildrenGenerated={handleChildrenGenerated}
                onUndoAvailable={handleUndoAvailable}
                searchQuery={filters.search}
                onResumeTask={setResumeTask}
                flat={filters.view !== 'tree'}
              />
            ))}
          </div>
        )}

        {/* First-run empty state */}
        {!loading && !loadError && tasks.length === 0 && (
          <div className="todo-glass flex flex-col items-center gap-4 px-5 py-10 text-center sm:py-[3rem]">
            <span className="todo-icon-chip h-[3rem] w-[3rem] rounded-xl">
              <Icon name="ClipboardDocumentCheckIcon" size={24} />
            </span>
            <div>
              <h3 className="font-heading text-base font-semibold leading-tight text-foreground">
                Your next accomplishment starts here
              </h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                Add a task, capture your ideas, or let AI help break down a bigger goal.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => openAddModal()} className="todo-btn todo-btn-primary px-4 py-2 text-sm">
                <Icon name="PlusIcon" size={16} variant="solid" />
                Add First Task
              </button>
              <button type="button" onClick={() => setShowBrainDumpModal(true)} className="todo-btn todo-btn-secondary px-4 py-2 text-sm">
                <Icon name="LightBulbIcon" size={16} />
                Brain Dump
              </button>
            </div>
          </div>
        )}

        {/* Nothing matches the current search / filters / layout */}
        {!loading && !loadError && tasks.length > 0 && filteredTasks.length === 0 && (
          <div className="todo-glass flex flex-col items-center gap-3 px-5 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon
                name={filters.view === 'focus' ? 'PlayCircleIcon' : filters.search ? 'MagnifyingGlassIcon' : 'FunnelIcon'}
                size={20}
              />
            </span>
            <div>
              <h3 className="font-heading text-sm font-semibold leading-tight text-foreground">
                {filters.search
                  ? 'No matching tasks'
                  : filters.view === 'focus'
                    ? 'Nothing in focus'
                    : filters.top20 && !hasNarrowingFilterBesidesTop20(filters)
                      ? 'No Top 20% tasks yet'
                      : 'No tasks match these filters'}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {filters.search
                  ? `No tasks match "${filters.search}". Try a different search.`
                  : filters.view === 'focus'
                    ? 'No tasks are in progress or overdue. Pick something from your backlog to get started.'
                    : filters.top20 && !hasNarrowingFilterBesidesTop20(filters)
                      ? 'Run 80/20 Analyze above to score your tasks and surface the high-leverage ones.'
                      : 'Try adjusting your filters to see more tasks.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {filters.search && (
                <button type="button" onClick={() => setFilters({ ...filters, search: '' })} className="todo-btn todo-btn-secondary">
                  Clear search
                </button>
              )}
              {hasNarrowingFilter && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, status: 'all', priority: 'all', time: 'all', genType: 'all', top20: false })}
                  className="todo-btn todo-btn-secondary"
                >
                  Clear filters
                </button>
              )}
              {filters.view === 'focus' && (
                <button type="button" onClick={() => setFilters({ ...filters, view: 'tree' })} className="todo-btn todo-btn-secondary">
                  Show all tasks
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Add Task FAB — always-reachable shortcut to the full form while scrolling a long list */}
      <button
        type="button"
        onClick={() => openAddModal()}
        className="todo-fab todo-fab-right bg-primary text-primary-foreground"
        aria-label="Add task with details"
        title="Add task with details"
      >
        <Icon name="PlusIcon" size={24} variant="solid" />
      </button>

      {/* Add Task Modal */}
      {showAddModal && (
        <AddTaskModal
          initialTitle={addModalTitle}
          onClose={() => { setShowAddModal(false); setAddModalTitle(''); }}
          onCreated={handleTaskCreated}
        />
      )}

      {/* Brain Dump Modal — paste free text, AI parses it into a task tree */}
      {showBrainDumpModal && (
        <BrainDumpModal
          model={model}
          onClose={() => setShowBrainDumpModal(false)}
          onTasksSaved={() => {
            setShowBrainDumpModal(false);
            loadTasks({ silent: true });
            loadStats();
          }}
        />
      )}

      {/* Resume Briefing Slide-in Panel (Feature 2) */}
      {resumeTask && (
        <ResumePanel
          task={resumeTask}
          model={model}
          onClose={() => setResumeTask(null)}
          onStartWorking={async () => {
            const updated = await todoService.updateTask(resumeTask.id, { status: 'in_progress' });
            if (updated) {
              updateTaskInTree(resumeTask.id, { status: 'in_progress' });
            }
            setResumeTask(null);
          }}
        />
      )}

      {/* Start Day Modal (Feature 1) */}
      {showStartDayModal && (
        <StartDayModal
          model={model}
          onClose={() => setShowStartDayModal(false)}
          onPlanAccepted={(plan) => {
            setActivePlan(plan);
            setShowStartDayModal(false);
            loadTasks({ silent: true });
          }}
        />
      )}

      {/* End Day Modal (Feature 1) */}
      {showEndDayModal && (
        <EndDayModal
          plan={activePlan}
          model={model}
          onClose={() => setShowEndDayModal(false)}
          onDayEnded={() => {
            setActivePlan(null);
            setShowEndDayModal(false);
            loadTasks({ silent: true });
          }}
        />
      )}
    </div>
  );
}

function hasNarrowingFilterBesidesTop20(f: TaskFilters): boolean {
  return f.status !== 'all' || f.priority !== 'all' || f.time !== 'all' || f.genType !== 'all';
}

// ────────────────────────────────────────────────────────────────────────────
// Progress overview (Feature 8) — real stats only
// ────────────────────────────────────────────────────────────────────────────

function StatCard({ icon, iconClassName = 'text-muted-foreground', label, shortLabel, children }: {
  icon: string;
  iconClassName?: string;
  label: string;
  /** Phones show three compact tiles side by side, so the label must fit ~100px. */
  shortLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="todo-glass flex min-w-0 flex-col p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:text-xs">
        <Icon name={icon} size={14} variant="solid" className={`shrink-0 ${iconClassName}`} />
        <span className="truncate sm:hidden" aria-hidden="true">{shortLabel}</span>
        <span className="sr-only sm:not-sr-only sm:truncate sm:whitespace-nowrap">{label}</span>
      </div>
      <div className="mt-2 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function StatsRow({ stats }: { stats: TodoStats }) {
  const completed = stats.completed_today;
  const targetHit = completed >= DAILY_TARGET;
  const week = stats.last_7_days || [];
  const weekTotal = week.reduce((sum, n) => sum + n, 0);

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-fade-in">
      <StatCard
        icon="CheckCircleIcon"
        iconClassName={targetHit ? 'text-success' : 'text-muted-foreground'}
        label="Today's completions"
        shortLabel="Today"
      >
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-heading text-3xl font-semibold leading-none text-foreground">{completed}</span>
          <span className="text-xs text-muted-foreground">/ {DAILY_TARGET} target</span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Daily target progress"
          aria-valuemin={0}
          aria-valuemax={DAILY_TARGET}
          aria-valuenow={Math.min(completed, DAILY_TARGET)}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${targetHit ? 'bg-success' : 'bg-primary'}`}
            style={{ width: `${Math.min(100, (completed / DAILY_TARGET) * 100)}%` }}
          />
        </div>
        <p className="mt-2 hidden text-[11px] text-muted-foreground sm:block">
          {targetHit ? 'Daily target reached — nice work.' : `${DAILY_TARGET - completed} more to hit your daily goal`}
        </p>
      </StatCard>

      <StatCard
        icon="FireIcon"
        iconClassName={stats.streak > 0 ? 'text-amber-500' : 'text-muted-foreground'}
        label="Active streak"
        shortLabel="Streak"
      >
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-heading text-3xl font-semibold leading-none text-foreground">{stats.streak}</span>
          <span className="text-xs text-muted-foreground">{stats.streak === 1 ? 'day' : 'days'}</span>
        </div>
        <p className="mt-auto hidden pt-3 text-[11px] text-muted-foreground sm:block">
          {stats.streak === 0
            ? 'Complete a task today to start a streak.'
            : completed > 0
              ? "You're on track today — keep it going."
              : 'Complete a task today to keep your streak alive.'}
        </p>
      </StatCard>

      <StatCard icon="ChartBarIcon" label="Last 7 days" shortLabel="7 days">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-heading text-3xl font-semibold leading-none text-foreground">{weekTotal}</span>
          <span className="text-xs text-muted-foreground">completed</span>
        </div>
        <div className="hidden sm:block">
          <WeekBars counts={week} labels={stats.last_7_dates || []} />
        </div>
      </StatCard>
    </div>
  );
}

/** Seven daily-completion bars; today (the last entry) in the accent, earlier days recessive. */
function WeekBars({ counts, labels }: { counts: number[]; labels: string[] }) {
  const max = Math.max(...counts, 1);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const summary = counts.map((n, i) => `${labels[i] || `Day ${i + 1}`}: ${n}`).join(', ');

  return (
    <div className="mt-3">
      <div className="relative" role="img" aria-label={`Tasks completed per day, oldest to today. ${summary}`}>
        <div className="flex h-10 items-end gap-[2px] border-b border-border">
          {counts.map((count, i) => {
            const isToday = i === counts.length - 1;
            return (
              <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
                {count > 0 && (
                  <div
                    className="w-full max-w-[22px] rounded-t-[4px] transition-colors"
                    style={{
                      height: `${Math.max(12, (count / max) * 100)}%`,
                      background: isToday
                        ? 'var(--color-primary)'
                        : 'color-mix(in srgb, var(--color-muted-foreground) 45%, transparent)',
                    }}
                  />
                )}
                <div className="todo-popover pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium group-hover:block">
                  {labels[i] || `Day ${i + 1}`}: {count} done
                </div>
              </div>
            );
          })}
        </div>
        {total === 0 && (
          <p className="absolute inset-x-0 top-2 text-center text-[11px] text-muted-foreground">
            No completions in the last 7 days yet
          </p>
        )}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden="true">
        {counts.map((_, i) => (
          <span
            key={i}
            className={`flex-1 text-center text-[10px] ${i === counts.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
          >
            {i === counts.length - 1 ? 'Today' : (labels[i] || '').slice(0, 2)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Daily plan sub-components (Feature 1)
// ────────────────────────────────────────────────────────────────────────────

interface StartDayModalProps {
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onPlanAccepted: (plan: any) => void;
}

function StartDayModal({ model, onClose, onPlanAccepted }: StartDayModalProps) {
  const [hours, setHours] = useState(4.0);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCuratePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await todoService.kickstartDaily(hours, model);
      if (!data.suggestions?.length && !data.alternatives?.length) {
        setError('No open tasks to plan from yet. Add a few tasks first.');
        return;
      }
      setSuggestions(data.suggestions);
      setAlternatives(data.alternatives);

      const initialSelected: Record<number, boolean> = {};
      const initialReasons: Record<number, string> = {};
      data.suggestions.forEach((s: any) => {
        initialSelected[s.task.id] = true;
        initialReasons[s.task.id] = s.reason;
      });
      setSelectedIds(initialSelected);
      setReasons(initialReasons);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't curate a plan.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptPlan = async () => {
    if (saving) return;
    const acceptedIds = Object.keys(selectedIds)
      .map(Number)
      .filter(id => selectedIds[id]);

    if (acceptedIds.length === 0) {
      setError('Select at least one task for today.');
      return;
    }

    const reasoningMap: Record<number, string> = {};
    acceptedIds.forEach(id => {
      reasoningMap[id] = reasons[id] || 'Selected for today\'s focus';
    });

    setSaving(true);
    setError(null);
    const plan = await todoService.saveDailyPlan(hours, acceptedIds, reasoningMap);
    setSaving(false);
    if (plan) {
      onPlanAccepted(plan);
    } else {
      setError("Couldn't save today's plan. Please try again.");
    }
  };

  const handleToggleTask = (taskId: number, reason: string = 'Manually added') => {
    setSelectedIds(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
    if (!reasons[taskId]) {
      setReasons(prev => ({
        ...prev,
        [taskId]: reason
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="todo-icon-chip h-8 w-8"><Icon name="SunIcon" size={16} /></span>
            <span className="font-heading text-base font-bold text-foreground">Daily Kickstart: Plan Your Day</span>
          </div>
          <button onClick={onClose} className="todo-btn todo-btn-ghost p-1" aria-label="Close">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div role="alert" className="todo-alert todo-alert-error">
              <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
              <p className="flex-1 leading-relaxed">{error}</p>
            </div>
          )}
          {suggestions.length === 0 && !loading ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-normal">
                How many hours of focused productivity do you have available today? AI will curate the optimal plan.
              </p>
              <div>
                <label htmlFor="todo-kickstart-hours" className="block text-xs font-semibold text-muted-foreground mb-1.5">Available Hours</label>
                <input
                  id="todo-kickstart-hours"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={hours}
                  onChange={e => setHours(parseFloat(e.target.value) || 4.0)}
                  className="todo-input px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleCuratePlan}
                className="todo-btn todo-btn-primary w-full py-2.5"
              >
                <Icon name="SparklesIcon" size={14} variant="solid" />
                AI Curate Plan
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse">Productivity Coach is crafting your plan...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Suggested tasks */}
              <div>
                <h4 className="text-xs font-bold text-primary mb-2 flex items-center gap-1">
                  <Icon name="SparklesIcon" size={14} variant="solid" />
                  <span>AI Suggested Tasks</span>
                  <span className="text-[10px] text-muted-foreground normal-case font-normal">(Curated for {hours} hrs)</span>
                </h4>
                <div className="space-y-2">
                  {suggestions.map(s => (
                    <div
                      key={s.task.id}
                      onClick={() => handleToggleTask(s.task.id, s.reason)}
                      className={`p-3 rounded-lg border cursor-pointer transition-smooth flex items-start gap-3 ${
                        selectedIds[s.task.id] ? 'bg-primary/5 border-primary/45' : 'bg-card border-border/70 hover:border-border'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedIds[s.task.id]}
                        readOnly
                        className="h-4 w-4 mt-0.5 rounded border-border text-primary cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate text-foreground">{s.task.title}</p>
                        <p className="text-[10px] text-muted-foreground/80 italic mt-0.5">Coach: &ldquo;{s.reason}&rdquo;</p>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground self-start">
                        {s.task.time_estimate || 'no est'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alternative tasks */}
              {alternatives.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1"><Icon name="InboxArrowDownIcon" size={14} /> Add Alternatives from Backlog</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-clean pr-1">
                    {alternatives.map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTask(t.id, 'Manually selected alternative')}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-smooth flex items-start gap-3 ${
                          selectedIds[t.id] ? 'bg-primary/5 border-primary/45' : 'bg-card border-border/70 hover:border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!selectedIds[t.id]}
                          readOnly
                          className="h-4 w-4 mt-0.5 rounded border-border text-primary cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate text-foreground">{t.title}</p>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {t.time_estimate || 'no est'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions.length > 0 && (
          <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
            <button
              onClick={handleAcceptPlan}
              disabled={saving}
              className="todo-btn todo-btn-primary flex-1 py-2"
            >
              {saving && <Spinner />}
              Accept Daily Plan & Lock In
            </button>
            <button
              onClick={() => { setSuggestions([]); setAlternatives([]); }}
              className="py-2 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-smooth font-semibold"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface EndDayModalProps {
  plan: any;
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onDayEnded: () => void;
}

function EndDayModal({ plan, model, onClose, onDayEnded }: EndDayModalProps) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [top20Warning, setTop20Warning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incompleteReschedule, setIncompleteReschedule] = useState<Record<number, 'tomorrow' | 'next_week' | 'remove'>>({});

  const completedTasks = plan.tasks.filter((t: any) => t.status === 'done');
  const incompleteTasks = plan.tasks.filter((t: any) => t.status !== 'done');

  useEffect(() => {
    const initial: Record<number, 'tomorrow' | 'next_week' | 'remove'> = {};
    incompleteTasks.forEach((t: any) => {
      initial[t.id] = 'tomorrow';
    });
    setIncompleteReschedule(initial);
  }, [plan]);

  const handleEndDay = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const completedIds = completedTasks.map((t: any) => t.id);
      const res = await todoService.endDaily(completedIds, incompleteReschedule, model);
      if (res) {
        setSummary(res.summary);
        setTop20Warning(res.top20_warning || null);
      } else {
        setError("Couldn't end the day. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't end the day.");
    } finally {
      setLoading(false);
    }
  };

  const handleActionChange = (taskId: number, action: 'tomorrow' | 'next_week' | 'remove') => {
    setIncompleteReschedule(prev => ({
      ...prev,
      [taskId]: action
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="todo-icon-chip h-8 w-8"><Icon name="MoonIcon" size={16} /></span>
            <span className="font-heading text-base font-bold text-foreground">End Day: Reschedule & Reflect</span>
          </div>
          {!summary && (
            <button onClick={onClose} className="todo-btn todo-btn-ghost p-1" aria-label="Close">
              <Icon name="XMarkIcon" size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div role="alert" className="todo-alert todo-alert-error">
              <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
              <p className="flex-1 leading-relaxed">{error}</p>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse">Productivity Coach is summarizing your day...</p>
            </div>
          ) : summary ? (
            <div className="text-center py-6 space-y-4">
              <span className="todo-icon-chip mx-auto h-14 w-14 rounded-2xl"><Icon name="TrophyIcon" size={28} variant="solid" /></span>
              <h3 className="font-heading text-lg font-bold text-foreground">Day Completed!</h3>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-sm italic text-foreground leading-relaxed">
                &ldquo;{summary}&rdquo;
              </div>
              {top20Warning && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-600 dark:text-amber-400 text-left">
                  {top20Warning}
                </div>
              )}
              <button
                onClick={onDayEnded}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-around text-center">
                <div>
                  <span className="block text-xl font-bold text-primary">{completedTasks.length}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Completed</span>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <span className="block text-xl font-bold text-amber-500">{incompleteTasks.length}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Incomplete</span>
                </div>
              </div>

              {/* Completed List */}
              {completedTasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-success mb-2 flex items-center gap-1"><Icon name="CheckCircleIcon" size={14} variant="solid" /> Knocked Out Today:</h4>
                  <ul className="list-disc pl-4 text-xs space-y-1 text-muted-foreground">
                    {completedTasks.map((t: any) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Incomplete / Rescheduling */}
              {incompleteTasks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-warning flex items-center gap-1"><Icon name="CalendarDaysIcon" size={14} /> Reschedule Remaining Tasks:</h4>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-clean pr-1">
                    {incompleteTasks.map((t: any) => (
                      <div key={t.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
                        <p className="text-xs font-semibold truncate text-foreground">{t.title}</p>
                        <div className="flex gap-2">
                          {(['tomorrow', 'next_week', 'remove'] as const).map(act => (
                            <button
                              key={act}
                              type="button"
                              onClick={() => handleActionChange(t.id, act)}
                              className={`flex-1 py-1 rounded text-[10px] font-semibold transition-smooth border ${
                                incompleteReschedule[t.id] === act
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted'
                              }`}
                            >
                              <Icon name={act === 'tomorrow' ? 'SunIcon' : act === 'next_week' ? 'CalendarDaysIcon' : 'TrashIcon'} size={11} className="inline -mt-px mr-1" />
                              {act === 'tomorrow' ? 'Tomorrow' : act === 'next_week' ? 'Next Week' : 'Remove'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!summary && !loading && (
          <div className="p-4 border-t border-border bg-muted/20">
            <button
              onClick={handleEndDay}
              className="todo-btn todo-btn-primary w-full py-2"
            >
              <Icon name="MoonIcon" size={14} />
              Complete Day & Reflect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ResumePanelProps {
  task: Task;
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onStartWorking: () => void;
}

function ResumePanel({ task, model, onClose, onStartWorking }: ResumePanelProps) {
  const [briefing, setBriefing] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setBriefing('');
    setLoading(true);

    async function streamBriefing() {
      try {
        // apiFetch, not fetch(): /todo/* requires the Bearer token (a bare fetch 401s).
        const response = await apiFetch(`/todo/tasks/${task.id}/resume?${aiQueryString(model)}`);
        if (!response.ok) throw new Error(await parseApiError(response));
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        if (!reader) return;

        setLoading(false);
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (active) {
            setBriefing(prev => prev + chunk);
          }
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setBriefing(`Couldn't load the briefing. ${err instanceof Error ? err.message : ''}`.trim());
          setLoading(false);
        }
      }
    }

    streamBriefing();
    return () => {
      active = false;
    };
  }, [task.id, model]);

  return (
    <div className="fixed top-[60px] right-0 bottom-0 w-full sm:w-[450px] bg-card border-l border-border shadow-2xl z-50 flex flex-col transition-all duration-300 animate-slide-in">
      {/* Panel Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon name="BoltIcon" size={18} className="text-amber-500" variant="solid" />
          <span className="font-heading text-sm font-semibold text-foreground">Task Briefing: Resume Context</span>
        </div>
        <button onClick={onClose} className="todo-btn todo-btn-ghost p-1" aria-label="Close briefing">
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {/* Briefing Text */}
      <div className="flex-1 p-5 overflow-y-auto scrollbar-clean space-y-4">
        <h3 className="font-heading text-base font-bold text-foreground">{task.title}</h3>
        
        {task.intention && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs">
            <span className="font-bold text-primary mb-1 flex items-center gap-1"><Icon name="FlagIcon" size={12} variant="solid" /> Why this matters:</span>
            <p className="text-muted-foreground leading-normal">{task.intention}</p>
          </div>
        )}

        {task.definition_of_done && (
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs">
            <span className="font-bold text-success mb-1 flex items-center gap-1"><Icon name="CheckCircleIcon" size={12} variant="solid" /> Done when:</span>
            <p className="text-muted-foreground leading-normal">{task.definition_of_done}</p>
          </div>
        )}

        <div className="border-t border-border pt-4">
          {loading ? (
            <div className="space-y-2.5">
              <p className="text-xs text-muted-foreground animate-pulse">Streaming briefing from Coach...</p>
              <div className="h-3 rounded bg-muted animate-pulse w-full" />
              <div className="h-3 rounded bg-muted animate-pulse w-5/6" />
              <div className="h-3 rounded bg-muted animate-pulse w-4/5" />
            </div>
          ) : (
            <div className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
              {briefing.split('\n').map((line, idx) => {
                if (line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
                  return <p key={idx} className="font-bold text-primary mt-3 mb-1">{line}</p>;
                }
                return <p key={idx} className={idx > 0 ? 'mt-1' : ''}>{line}</p>;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
        <button
          onClick={onStartWorking}
          className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth flex items-center justify-center gap-1.5"
        >
          <Icon name="PlayIcon" size={14} variant="solid" />
          Start Working
        </button>
        <button
          onClick={onClose}
          className="py-2 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-smooth font-medium"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}


interface BrainDumpModalProps {
  model: 'ollama' | 'gemini';
  onClose: () => void;
  onTasksSaved: () => void;
}

function BrainDumpModal({ model, onClose, onTasksSaved }: BrainDumpModalProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await todoService.brainDump(text, model);
      if (data?.tasks?.length) {
        setParsedTasks(data.tasks);
      } else {
        setError("AI didn't find any tasks in that text. Try listing them more explicitly.");
      }
    } catch (err) {
      // The dump stays in the textarea, so nothing is lost on failure.
      setError(err instanceof Error ? err.message : "Couldn't analyze your brain dump.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (parsedTasks.some(t => !String(t.title || '').trim())) {
      setError('Every task needs a title — fill in or remove the empty ones.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = parsedTasks.map(t => ({
      temp_id: t.temp_id,
      parent_temp_id: t.parent_temp_id,
      title: String(t.title).trim(),
      priority: t.priority || 'p3',
      time_estimate: t.time_estimate || null,
      context: t.context || null
    }));

    try {
      const res = await todoService.bulkSaveTasksStrict(payload);
      if (res && res.status === 'success') {
        onTasksSaved();
      } else {
        setError("The tasks weren't saved. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the tasks.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditField = (index: number, field: string, value: any) => {
    setParsedTasks(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleDeleteTask = (index: number) => {
    setParsedTasks(prev => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="todo-icon-chip h-8 w-8"><Icon name="LightBulbIcon" size={16} /></span>
            <span className="font-heading text-base font-bold text-foreground">Brain Dump Mode</span>
          </div>
          <button onClick={onClose} className="todo-btn todo-btn-ghost p-1" aria-label="Close">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div role="alert" className="todo-alert todo-alert-error">
              <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
              <p className="flex-1 leading-relaxed">{error}</p>
            </div>
          )}
          {parsedTasks.length === 0 && !loading ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-normal">
                Paste a messy text dump or list of things on your mind. AI will parse them into structured, prioritized tasks.
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                aria-label="Brain dump text"
                placeholder="e.g. Need to build migration scripts for db by Friday, also call Sarah to schedule meeting on Mon (about 30 mins) and buy groceries. Also design the landing page prototype first."
                rows={8}
                className="todo-input px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={handleAnalyze}
                disabled={!text.trim()}
                className="todo-btn todo-btn-primary w-full py-2.5"
              >
                <Icon name="SparklesIcon" size={14} variant="solid" />
                Analyze Dump & Generate Tasks
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse font-medium">AI is parsing your thoughts into structured tasks...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1"><Icon name="ClipboardDocumentListIcon" size={14} /> Review Parsed Tasks ({parsedTasks.length})</h4>
                <button
                  onClick={() => { setParsedTasks([]); setError(null); }}
                  className="todo-focus rounded text-xs text-primary hover:underline font-semibold"
                  title="Go back and edit your text (it's kept)"
                >
                  Edit Text
                </button>
              </div>

              <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1 scrollbar-clean">
                {parsedTasks.map((t, idx) => (
                  <div key={idx} className="p-3 border border-border rounded-lg bg-muted/20 space-y-2 relative group">
                    <button
                      onClick={() => handleDeleteTask(idx)}
                      className="todo-focus absolute top-2 right-2 rounded text-muted-foreground hover:text-error opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-smooth"
                      aria-label={`Remove "${t.title || 'untitled task'}"`}
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                    <input
                      type="text"
                      value={t.title}
                      onChange={e => handleEditField(idx, 'title', e.target.value)}
                      className="w-full text-xs font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none text-foreground py-0.5"
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={t.priority || 'p3'}
                        onChange={e => handleEditField(idx, 'priority', e.target.value)}
                        className="bg-input border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus-ring font-semibold"
                      >
                        <option value="p1">P1 (High)</option>
                        <option value="p2">P2</option>
                        <option value="p3">P3</option>
                        <option value="p4">P4 (Low)</option>
                      </select>
                      <input
                        type="text"
                        value={t.time_estimate || ''}
                        placeholder="Estimate (e.g. 1h)"
                        onChange={e => handleEditField(idx, 'time_estimate', e.target.value)}
                        className="bg-input border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus-ring w-24 placeholder:text-muted-foreground/60"
                      />
                      {t.parent_temp_id && (
                        <span className="text-[9px] text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded font-medium">
                          Subtask of #{t.parent_temp_id}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={t.context || ''}
                      placeholder="Add context notes..."
                      onChange={e => handleEditField(idx, 'context', e.target.value)}
                      className="w-full text-[10px] text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 placeholder:text-muted-foreground/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsedTasks.length > 0 && (
          <div className="p-4 border-t border-border bg-muted/20 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="todo-btn todo-btn-primary flex-1 py-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Icon name="CheckIcon" size={14} variant="solid" />
              )}
              Save Tasks ({parsedTasks.length})
            </button>
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-smooth font-semibold"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

