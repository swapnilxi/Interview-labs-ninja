'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import TaskNode from './TaskNode';
import FilterBar from './FilterBar';
import AddTaskModal from './AddTaskModal';
import {
  type Task,
  type TaskStatus,
  type ViewMode,
  DEPTH_COLORS,
  DEPTH_LABELS,
  flattenTree,
  getRelativeDueDate,
  todoService,
} from '@/lib/services/todoService';
import { paretoService } from '@/lib/services/paretoService';
import { aiQueryString } from '@/lib/services/settingsService';

interface TaskTreeProps {
  model: 'ollama' | 'gemini';
}

// ── Filter state shape ────────────────────────────────────────────────────────

interface Filters {
  status: TaskStatus | 'all';
  priority: string;
  time: string;
  genType: string;
  search: string;
  view: ViewMode;
  top20: boolean;
}

const DEFAULT_FILTERS: Filters = {
  status: 'all',
  priority: 'all',
  time: 'all',
  genType: 'all',
  search: '',
  view: 'tree',
  top20: false,
};

export default function TaskTree({ model }: TaskTreeProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBrainDumpModal, setShowBrainDumpModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [undoInfo, setUndoInfo] = useState<{ parentId: number; previousChildren: Task[] } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [resumeTask, setResumeTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  const loadStats = useCallback(async () => {
    const data = await todoService.getStats();
    if (data) {
      setStats(data);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── 80/20 Analyze ────────────────────────────────────────────────────────
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [revealDelays, setRevealDelays] = useState<Record<number, number>>({});
  const [analyzeToast, setAnalyzeToast] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (paretoService.hasAnalyzedToday('smart')) {
      if (!confirm('You already ran analysis today. Results may be similar. Continue?')) return;
    }
    if (!confirm('AI will analyze all your tasks and identify the top 20% that will drive 80% of your results. This takes a few seconds.')) return;

    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('smart', model);
      paretoService.markAnalyzedToday('smart');
      await loadTasks();

      const newTop20Ids = result.results.filter(r => r.table === 'tasks' && r.is_top_20).map(r => r.id);
      const delays: Record<number, number> = {};
      newTop20Ids.forEach((id, i) => { delays[id] = i * 100; });
      setRevealDelays(delays);
      setTimeout(() => setRevealDelays({}), newTop20Ids.length * 100 + 600);

      setAnalyzeToast(`⭐ Found ${result.top20_count ?? 0} high-leverage task${(result.top20_count ?? 0) === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total`);
      setTimeout(() => setAnalyzeToast(null), 4000);
    } catch (err) {
      setAnalyzeToast(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ Analysis failed.');
      setTimeout(() => setAnalyzeToast(null), 4000);
    } finally {
      setAnalyzeLoading(false);
    }
  }, [model]);

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

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const tree = await todoService.fetchTaskTree();
    setTasks(tree);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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

  const handleTaskCreated = useCallback((task: Task) => {
    setTasks(prev => [...prev, { ...task, children: [] }]);
    setShowAddModal(false);
    loadStats();
  }, [loadStats]);

  const handleQuickAdd = useCallback(async () => {
    const title = quickAddTitle.trim();
    if (!title) return;
    setQuickAddLoading(true);
    const task = await todoService.createTask({ title, parent_id: null });
    if (task) {
      setTasks(prev => [...prev, { ...task, children: [] }]);
      loadStats();
    }
    setQuickAddTitle('');
    setQuickAddLoading(false);
    // keep the input open so user can add more
    quickAddInputRef.current?.focus();
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

  // ── Today section (feedback #6) ─────────────────────────────────────────

  const todayTasks = flattenTree(tasks).filter(t => {
    if (t.status === 'done') return false;
    const due = getRelativeDueDate(t.due_date);
    return due?.isOverdue || due?.isDueToday;
  });

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Stats Bar & 7-day chart (Feature 8) */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 animate-fade-in">
          {/* Daily Completions */}
          <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Today's completions</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-heading font-bold text-foreground">{stats.completed_today}</span>
                <span className="text-xs text-muted-foreground">/ 3 target</span>
              </div>
            </div>
            {stats.completed_today >= 3 ? (
              <span className="text-[10px] text-emerald-500 font-semibold mt-2 flex items-center gap-1">
                🎉 Daily target achieved!
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground mt-2">
                {3 - stats.completed_today} more to hit daily goal
              </span>
            )}
          </div>

          {/* Active Streak */}
          <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Active Streak</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-heading font-bold text-amber-500 flex items-center gap-1">
                  🔥 {stats.streak}
                </span>
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground mt-2">
              Keep checking off tasks daily!
            </span>
          </div>

          {/* Last 7 Days completion chart */}
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Last 7 Days</span>
            <div className="flex items-end justify-between h-14 px-1 gap-1">
              {stats.last_7_days.map((count: number, idx: number) => {
                const maxVal = Math.max(...stats.last_7_days, 1);
                const heightPct = Math.round((count / maxVal) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-[9px] rounded py-0.5 px-1.5 z-10 whitespace-nowrap shadow">
                      {count} tasks
                    </div>
                    <div
                      className="w-full bg-primary/20 group-hover:bg-primary rounded-t transition-all duration-300"
                      style={{ height: `${Math.max(5, heightPct)}%` }}
                    />
                    <span className="text-[8px] text-muted-foreground font-semibold">
                      {stats.last_7_dates[idx] || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* Daily Kickstart header section (Feature 1) */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tasks</h2>
        <div className="flex items-center gap-2">
          {/* Quick-add toggle button */}
          <button
            onClick={() => {
              setShowQuickAdd(v => !v);
              if (!showQuickAdd) setTimeout(() => quickAddInputRef.current?.focus(), 60);
            }}
            title="Add task without opening modal"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs hover:shadow-md hover:scale-[1.02] transition-smooth active:scale-95 border ${
              showQuickAdd
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/60 text-foreground border-border hover:bg-muted'
            }`}
          >
            <span className="text-sm leading-none">+</span> New Todo
          </button>

          <button
            onClick={() => setShowBrainDumpModal(true)}
            title="Paste a text dump and let AI turn it into structured tasks"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 text-foreground border border-border font-semibold text-xs hover:bg-muted hover:shadow-md hover:scale-[1.02] transition-smooth active:scale-95"
          >
            🧠 Brain Dump
          </button>

          {!activePlan ? (
            <button
              onClick={() => setShowStartDayModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-primary text-white font-semibold text-xs hover:shadow-md hover:scale-[1.02] transition-smooth active:scale-95"
            >
              🌅 Start Day
            </button>
          ) : (
            <button
              onClick={() => setShowEndDayModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs hover:shadow-md hover:scale-[1.02] transition-smooth active:scale-95"
            >
              🌇 End Day
            </button>
          )}
        </div>
      </div>

      {/* Inline quick-add row */}
      {showQuickAdd && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-primary/40 bg-primary/5 animate-fade-in">
          <input
            ref={quickAddInputRef}
            type="text"
            value={quickAddTitle}
            onChange={e => setQuickAddTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleQuickAdd();
              if (e.key === 'Escape') { setShowQuickAdd(false); setQuickAddTitle(''); }
            }}
            placeholder="Task title… press Enter to add"
            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
            disabled={quickAddLoading}
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickAddTitle.trim() || quickAddLoading}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-smooth"
            title="Add task (Enter)"
          >
            {quickAddLoading
              ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Icon name="PlusIcon" size={14} variant="solid" />}
          </button>
          <button
            onClick={() => { setShowQuickAdd(false); setQuickAddTitle(''); }}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center hover:bg-muted transition-smooth"
            title="Cancel (Esc)"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

      {/* Pinned Today's Focus Plan (Feature 1) */}
      {activePlan && activePlan.tasks && activePlan.tasks.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-primary/10 border border-primary/20 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h2 className="font-heading text-sm font-bold text-foreground">Today's Focus</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                {activePlan.plan_date}
              </span>
            </div>
            <span className="text-xs font-semibold text-primary">
              {activePlan.tasks.filter((t: any) => t.status === 'done').length} / {activePlan.tasks.length} Done
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-muted dark:bg-muted/40 h-1.5 rounded-full overflow-hidden mb-3">
            <div
              className="bg-primary h-full transition-all duration-500"
              style={{
                width: `${
                  (activePlan.tasks.filter((t: any) => t.status === 'done').length /
                    activePlan.tasks.length) *
                  100
                }%`,
              }}
            />
          </div>
          <div className="space-y-2">
            {activePlan.tasks.map((task: any) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/60 hover:border-primary/30 transition-smooth"
              >
                <div className="flex items-center gap-2.5 min-w-0">
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
                    className="h-4 w-4 rounded border-border text-primary focus-ring cursor-pointer"
                  />
                  <span className={`text-xs font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title}
                  </span>
                  {activePlan.reasoning[task.id] && (
                    <span className="text-[10px] text-muted-foreground/80 italic truncate hidden md:inline">
                      • {activePlan.reasoning[task.id]}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    {task.time_estimate || 'no est'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Depth color legend */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Depth</span>
        {DEPTH_COLORS.map((color, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `${color}25`, border: `2px solid ${color}` }} />
            <span className="text-[10px] text-muted-foreground capitalize">L{i + 1}{i === 4 ? '+' : ''} {DEPTH_LABELS[i]}</span>
          </div>
        ))}
      </div>

      {/* 80/20 Analyze toast */}
      {analyzeToast && (
        <div className="fixed top-20 right-6 z-[200] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold bg-amber-500 text-white animate-slide-up">
          {analyzeToast}
        </div>
      )}

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} onAnalyze={handleAnalyze} analyzeLoading={analyzeLoading} />

      {/* Undo toast (feedback #1) */}
      {undoInfo && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 animate-fade-in">
          <Icon name="ArrowUturnLeftIcon" size={14} className="text-primary" />
          <span className="text-xs text-foreground flex-1">AI subtasks generated.</span>
          <button
            onClick={handleUndo}
            className="text-xs font-semibold text-primary hover:text-primary/80 transition-smooth"
          >
            Undo
          </button>
          <span className="text-[10px] text-muted-foreground">Expires in 10s</span>
        </div>
      )}

      {/* Today section (feedback #6) */}
      {todayTasks.length > 0 && filters.view !== 'focus' && (
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="ExclamationTriangleIcon" size={14} className="text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Due Today & Overdue ({todayTasks.length})
            </span>
          </div>
          <div className="space-y-1">
            {todayTasks.map(t => {
              const due = getRelativeDueDate(t.due_date);
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${due?.isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
                    {due?.text}
                  </span>
                  <span className="text-foreground truncate">{t.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Task list */}
      {!loading && filteredTasks.length > 0 && (
        <div className="space-y-1">
          {filters.view === 'list' || filters.view === 'focus' ? (
            // Flat list view
            (filters.view === 'focus' ? filteredTasks : flattenTree(filteredTasks)).map(task => (
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
                revealDelays={revealDelays}
              />
            ))
          ) : (
            // Tree view (default)
            filteredTasks.map(task => (
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
                revealDelays={revealDelays}
              />
            ))
          )}
        </div>
      )}

      {/* Empty states (feedback #4) */}
      {!loading && filteredTasks.length === 0 && (
        <div className="lab-card flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon
              name={filters.view === 'focus' ? 'RocketLaunchIcon' : filters.search ? 'MagnifyingGlassIcon' : 'ClipboardDocumentCheckIcon'}
              size={28}
              variant="outline"
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {filters.search
                ? 'No matching tasks'
                : filters.view === 'focus'
                  ? 'Nothing in focus'
                  : tasks.length === 0
                    ? 'No tasks yet'
                    : 'No tasks match these filters'
              }
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {filters.search
                ? `No tasks match "${filters.search}". Try a different search.`
                : filters.view === 'focus'
                  ? 'No tasks are in progress or overdue. Pick something from Backlog to get started!'
                  : tasks.length === 0
                    ? 'Create your first task to start breaking it down with AI.'
                    : 'Try adjusting your filters to see more tasks.'}
            </p>
          </div>
          {tasks.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-smooth flex items-center gap-2"
            >
              <Icon name="PlusIcon" size={16} variant="solid" />
              Add First Task
            </button>
          )}
        </div>
      )}

      {/* Add Task FAB — opens full modal for detailed task creation */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-smooth flex items-center justify-center"
        title="Add task with details (opens modal)"
      >
        <Icon name="PlusIcon" size={24} variant="solid" />
      </button>

      {/* Add Task Modal */}
      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
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
            loadTasks();
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
            loadTasks();
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
            loadTasks();
          }}
        />
      )}
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

  const handleCuratePlan = async () => {
    setLoading(true);
    const data = await todoService.kickstartDaily(hours, model);
    if (data) {
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
    }
    setLoading(false);
  };

  const handleAcceptPlan = async () => {
    const acceptedIds = Object.keys(selectedIds)
      .map(Number)
      .filter(id => selectedIds[id]);
      
    if (acceptedIds.length === 0) {
      alert('Please select at least one task for today.');
      return;
    }

    const reasoningMap: Record<number, string> = {};
    acceptedIds.forEach(id => {
      reasoningMap[id] = reasons[id] || 'Selected for today\'s focus';
    });

    const plan = await todoService.saveDailyPlan(hours, acceptedIds, reasoningMap);
    if (plan) {
      onPlanAccepted(plan);
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
            <span className="text-xl">🌅</span>
            <span className="font-heading text-base font-bold text-foreground">Daily Kickstart: Plan Your Day</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {suggestions.length === 0 && !loading ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-normal">
                How many hours of focused productivity do you have available today? AI will curate the optimal plan.
              </p>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Available Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={hours}
                  onChange={e => setHours(parseFloat(e.target.value) || 4.0)}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus-ring"
                />
              </div>
              <button
                onClick={handleCuratePlan}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth flex items-center justify-center gap-1.5"
              >
                <Icon name="SparklesIcon" size={14} variant="solid" />
                ✨ AI Curate Plan
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
                  <span>✨ AI Suggested Tasks</span>
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
                        <p className="text-[10px] text-muted-foreground/80 italic mt-0.5">Coach: "{s.reason}"</p>
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
                  <h4 className="text-xs font-bold text-muted-foreground mb-2">📥 Add Alternatives from Backlog</h4>
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
              className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth"
            >
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
    setLoading(true);
    const completedIds = completedTasks.map((t: any) => t.id);
    const res = await todoService.endDaily(completedIds, incompleteReschedule, model);
    if (res) {
      setSummary(res.summary);
      setTop20Warning(res.top20_warning || null);
    }
    setLoading(false);
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
            <span className="text-xl">🌇</span>
            <span className="font-heading text-base font-bold text-foreground">End Day: Reschedule & Reflect</span>
          </div>
          {!summary && (
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <Icon name="XMarkIcon" size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground animate-pulse">Productivity Coach is summarizing your day...</p>
            </div>
          ) : summary ? (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl animate-bounce">🎉</div>
              <h3 className="font-heading text-lg font-bold text-foreground">Day Completed!</h3>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-sm italic text-foreground leading-relaxed">
                "{summary}"
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
                  <h4 className="text-xs font-bold text-emerald-500 mb-2">✅ Knocked Out Today:</h4>
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
                  <h4 className="text-xs font-bold text-amber-500">📅 Reschedule Remaining Tasks:</h4>
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
                              {act === 'tomorrow' ? '🌅 Tomorrow' : act === 'next_week' ? '📅 Next Week' : '🗑️ Remove'}
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
              className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth"
            >
              🌇 Complete Day & Reflect
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
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'}/todo/tasks/${task.id}/resume?${aiQueryString(model)}`
        );
        if (!response.ok) throw new Error('Failed to fetch resume stream');
        
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
          setBriefing('Failed to load briefing. Please verify backend is running.');
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
        <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth font-medium">
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {/* Briefing Text */}
      <div className="flex-1 p-5 overflow-y-auto scrollbar-clean space-y-4">
        <h3 className="font-heading text-base font-bold text-foreground">{task.title}</h3>
        
        {task.intention && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs">
            <span className="font-bold text-primary block mb-1">🎯 Why this matters:</span>
            <p className="text-muted-foreground leading-normal">{task.intention}</p>
          </div>
        )}

        {task.definition_of_done && (
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1">✅ Done when:</span>
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

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    const data = await todoService.brainDump(text, model);
    if (data && data.tasks) {
      setParsedTasks(data.tasks);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = parsedTasks.map(t => ({
      temp_id: t.temp_id,
      parent_temp_id: t.parent_temp_id,
      title: t.title,
      priority: t.priority || 'p3',
      time_estimate: t.time_estimate || null,
      context: t.context || null
    }));

    const res = await todoService.bulkSaveTasks(payload);
    setSaving(false);
    if (res && res.status === 'success') {
      onTasksSaved();
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
            <span className="text-xl">🧠</span>
            <span className="font-heading text-base font-bold text-foreground">Brain Dump Mode</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {parsedTasks.length === 0 && !loading ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-normal">
                Paste a messy text dump or list of things on your mind. AI will parse them into structured, prioritized tasks.
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. Need to build migration scripts for db by Friday, also call Sarah to schedule meeting on Mon (about 30 mins) and buy groceries. Also design the landing page prototype first."
                rows={8}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground resize-none"
              />
              <button
                onClick={handleAnalyze}
                disabled={!text.trim()}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                <h4 className="text-xs font-bold text-foreground">📝 Review Parsed Tasks ({parsedTasks.length})</h4>
                <button
                  onClick={() => { setParsedTasks([]); setText(''); }}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Start Over
                </button>
              </div>

              <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1 scrollbar-clean">
                {parsedTasks.map((t, idx) => (
                  <div key={idx} className="p-3 border border-border rounded-lg bg-muted/20 space-y-2 relative group">
                    <button
                      onClick={() => handleDeleteTask(idx)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-smooth"
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
                          ↳ Subtask of #{t.parent_temp_id}
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
              className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth flex items-center justify-center gap-1.5 disabled:opacity-50"
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

