'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import TaskNode from './TaskNode';
import FilterBar from './FilterBar';
import AddTaskModal from './AddTaskModal';
import Breadcrumb from './Breadcrumb';
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
}

const DEFAULT_FILTERS: Filters = {
  status: 'all',
  priority: 'all',
  time: 'all',
  genType: 'all',
  search: '',
  view: 'tree',
};

export default function TaskTree({ model }: TaskTreeProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ parentId: number; previousChildren: Task[] } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

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
  }, []);

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
  }, []);

  // ── Filtering ───────────────────────────────────────────────────────────

  const filterTasks = useCallback((nodes: Task[]): Task[] => {
    const { status, priority, time, genType, search } = filters;

    function matches(task: Task): boolean {
      if (status !== 'all' && task.status !== status) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (genType !== 'all' && task.generation_type !== genType) return false;
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
      return flat.filter(t => t.status === 'in_progress' || (getRelativeDueDate(t.due_date)?.isOverdue));
    }

    const hasAnyFilter = status !== 'all' || priority !== 'all' || time !== 'all' || genType !== 'all' || search;
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

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

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

      {/* Breadcrumb (shown when a task at L3+ is focused) */}
      {focusedTaskId && (
        <Breadcrumb taskId={focusedTaskId} allTasks={tasks} onNavigate={setFocusedTaskId} />
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

      {/* Add Task FAB */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-smooth flex items-center justify-center"
        title="Add new task"
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
    </div>
  );
}
