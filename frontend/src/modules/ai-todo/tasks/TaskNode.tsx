'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import ParetoModal from '@/components/ui/ParetoModal';
import TaskDetailModal from './TaskDetailModal';
import { projectService, type Project } from '@/lib/services/projectService';
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Note,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  getDepthColor,
  getRelativeDueDate,
  computeProgress,
  todoService,
  triggerConfetti,
} from '@/lib/services/todoService';

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

interface TaskNodeProps {
  task: Task;
  depth?: number;
  chunkIndex?: number;
  model: 'ollama' | 'gemini';
  onUpdate: (taskId: number, updates: Partial<Task>) => void;
  onDelete: (taskId: number) => void;
  onChildrenGenerated: (parentId: number, children: Task[], generationType: string) => void;
  onUndoAvailable: (parentId: number, previousChildren: Task[]) => void;
  searchQuery?: string;
  onResumeTask?: (task: Task) => void;
  revealDelays?: Record<number, number>;
}

export default function TaskNode({
  task,
  depth = 1,
  chunkIndex,
  model,
  onUpdate,
  onDelete,
  onChildrenGenerated,
  onUndoAvailable,
  searchQuery = '',
  onResumeTask,
}: TaskNodeProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(depth <= 2);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [loading, setLoading] = useState<'dive' | 'chunk' | 'regen' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showDepthWarning, setShowDepthWarning] = useState<'dive' | 'chunk' | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [newNoteText, setNewNoteText] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [aiActionLoading, setAiActionLoading] = useState<'explain' | 'summarize' | string | null>(null);
  
  // 80/20 State
  const [showParetoModal, setShowParetoModal] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  // Move-to-project picker state
  const [movePlanOpen, setMovePlanOpen] = useState(false);
  const [moveProjects, setMoveProjects] = useState<Project[] | null>(null);
  const [moveProjectsLoading, setMoveProjectsLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  // Fetch notes count on mount or when the task updates
  useEffect(() => {
    async function getNotesCount() {
      const taskNotes = await todoService.fetchNotes(task.id);
      setNotes(taskNotes);
      setNotesCount(taskNotes.length);
    }
    getNotesCount();
  }, [task.id, task.updated_at]);

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteText.trim()) return;
    const added = await todoService.createNote(task.id, newNoteText.trim());
    if (added) {
      setNotes(prev => [added, ...prev]);
      setNotesCount(prev => prev + 1);
      setNewNoteText('');
    }
  };

  const handleExplainTask = async () => {
    setAiActionLoading('explain');
    const added = await todoService.explainTask(task.id, model);
    if (added) {
      setNotes(prev => [added, ...prev]);
      setNotesCount(prev => prev + 1);
    }
    setAiActionLoading(null);
  };

  const handleSummarizeNotes = async () => {
    setAiActionLoading('summarize');
    const sum = await todoService.summarizeNotes(task.id, model);
    setSummary(sum);
    setAiActionLoading(null);
  };

  const handleExpandNote = async (noteId: number) => {
    setAiActionLoading(`expand-${noteId}`);
    const added = await todoService.expandNote(task.id, noteId, model);
    if (added) {
      setNotes(prev => [added, ...prev]);
      setNotesCount(prev => prev + 1);
    }
    setAiActionLoading(null);
  };

  const depthColor = getDepthColor(depth);
  const progress = computeProgress(task);
  const dueInfo = getRelativeDueDate(task.due_date);
  const hasChildren = task.children && task.children.length > 0;
  const isAiGenerated = task.generation_type !== 'manual';

  // Calculate inactivity (Feature 2)
  const lastAct = task.last_activity_at || task.created_at;
  const isInactive = lastAct && (new Date().getTime() - new Date(lastAct).getTime() > 2 * 24 * 60 * 60 * 1000);

  // Search highlight
  const matchesSearch = searchQuery && task.title.toLowerCase().includes(searchQuery.toLowerCase());

  // ── Inline edit handlers ─────────────────────────────────────────────────

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = async (field: string) => {
    if (editValue.trim() || field !== 'title') {
      const updated = await todoService.updateTask(task.id, { [field]: editValue.trim() || null });
      if (updated) onUpdate(task.id, { [field]: editValue.trim() || null });
    }
    setEditingField(null);
  };

  // ── Status / Priority handlers ───────────────────────────────────────────

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setShowStatusMenu(false);
    const updated = await todoService.updateTask(task.id, { status: newStatus });
    if (updated) onUpdate(task.id, { status: newStatus });
  };

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    setShowPriorityMenu(false);
    const updated = await todoService.updateTask(task.id, { priority: newPriority });
    if (updated) onUpdate(task.id, { priority: newPriority });
  };

  const handleCheckbox = async (e: React.MouseEvent) => {
    const newStatus = task.status === 'done' ? 'backlog' : 'done';
    if (newStatus === 'done') {
      triggerConfetti(e.clientX, e.clientY);
    }
    const updated = await todoService.updateTask(task.id, { status: newStatus as TaskStatus });
    if (updated) onUpdate(task.id, { status: newStatus as TaskStatus });
  };

  // ── AI breakdown handlers ────────────────────────────────────────────────

  const handleAIAction = async (type: 'dive' | 'chunk') => {
    // Depth warning at L4+ (feedback #11)
    if (depth >= 4 && !showDepthWarning) {
      setShowDepthWarning(type);
      return;
    }
    setShowDepthWarning(null);
    setLoading(type);
    setChildrenExpanded(true);

    try {
      const previousChildren = [...(task.children || [])];
      const subtasks = type === 'dive'
        ? await todoService.diveDeeper(task.id, model)
        : await todoService.chunkIt(task.id, model);

      if (subtasks.length > 0) {
        onChildrenGenerated(task.id, subtasks, type === 'dive' ? 'dive_deeper' : 'chunk');
        onUndoAvailable(task.id, previousChildren);
      }
    } catch (err) {
      console.error('AI action failed:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleRegenerate = async () => {
    setLoading('regen');
    try {
      const subtasks = await todoService.regenerate(task.id, model);
      if (subtasks.length > 0) {
        onChildrenGenerated(task.id, subtasks, task.generation_type);
      }
    } catch (err) {
      console.error('Regeneration failed:', err);
    } finally {
      setLoading(null);
    }
  };

  // ── Delete handler ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    const deleted = await todoService.deleteTask(task.id);
    if (deleted) onDelete(task.id);
    setShowDeleteConfirm(false);
  };

  // ── Move handlers ────────────────────────────────────────────────────────

  const handleOpenMovePlan = async () => {
    setMovePlanOpen(true);
    if (moveProjects === null) {
      setMoveProjectsLoading(true);
      const fetched = await projectService.fetchProjects();
      setMoveProjects(fetched);
      setMoveProjectsLoading(false);
    }
  };

  const handleMoveToProject = async (projectId?: number | null) => {
    setMoving(true);
    const res = await todoService.moveToPlan(task.id, projectId ?? null);
    setMoving(false);
    if (res) {
      setShowMoveMenu(false);
      setMovePlanOpen(false);
      onDelete(task.id); // Moved for good — remove from Smart To-Do view
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.backlog;
  const priorityConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.p3;

  // 80/20 styling
  let paretoClasses = '';
  if (task.is_top_20) {
    paretoClasses = 'ring-1 ring-amber-400/50 shadow-sm';
  } else if (task.pareto_score !== undefined && task.pareto_score !== null) {
    if (task.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (task.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  return (
    <div
      className={`task-node relative ${matchesSearch ? 'ring-2 ring-primary/40 rounded-lg' : ''}`}
      style={{ paddingLeft: depth > 1 ? '24px' : '0' }}
    >
      {/* Vertical connector line */}
      {depth > 1 && (
        <div
          className="absolute left-[11px] top-0 bottom-0 w-[2px] rounded-full opacity-30"
          style={{ backgroundColor: depthColor }}
        />
      )}

      {/* Main task card */}
      <div className={`relative lab-card-muted p-3 mb-2 transition-smooth hover:shadow-sm ${paretoClasses}`}
           style={{ borderLeftWidth: '3px', borderLeftColor: depthColor }}>

        {/* Row 1: checkbox + title + status + priority + details toggle — the compact, always-visible row */}
        <div className="flex items-center gap-1.5">
          {/* Children chevron (separate from the details toggle) */}
          {hasChildren ? (
            <button
              onClick={() => setChildrenExpanded(!childrenExpanded)}
              className="text-muted-foreground hover:text-foreground transition-smooth shrink-0"
              title={childrenExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
            >
              <Icon
                name="ChevronRightIcon"
                size={12}
                className={`transition-transform duration-200 ${childrenExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}

          {/* Checkbox */}
          <button onClick={handleCheckbox} className="flex-shrink-0 transition-smooth hover:scale-110">
            <div className={`w-[16px] h-[16px] rounded-[4px] border-2 flex items-center justify-center transition-smooth ${
              task.status === 'done'
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-muted-foreground/40 hover:border-primary'
            }`}>
              {task.status === 'done' && (
                <Icon name="CheckIcon" size={11} className="text-white" variant="solid" />
              )}
            </div>
          </button>

          {/* Step number for chunk subtasks */}
          {task.generation_type === 'chunk' && chunkIndex !== undefined && (
            <span className="flex-shrink-0 text-[10px] font-bold text-emerald-500 w-4 text-center">
              {chunkIndex + 1}.
            </span>
          )}

          {/* Title (click to open details, double-click to rename) */}
          {editingField === 'title' ? (
            <input
              ref={titleRef}
              className="flex-1 min-w-0 text-sm font-medium bg-input border border-border rounded px-2 py-0.5 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('title')}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit('title'); if (e.key === 'Escape') setEditingField(null); }}
              autoFocus
            />
          ) : (
            <button
              className={`flex-1 min-w-0 text-left text-sm font-medium transition-smooth hover:text-primary truncate ${
                task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
              onClick={() => setShowDetailModal(true)}
              onDoubleClick={() => startEdit('title', task.title)}
              title="Click to open task page for details & context · double-click to rename"
            >
              {task.title}
            </button>
          )}

          {/* Top 20% badge */}
          {task.is_top_20 && (
            <span
              className="flex-shrink-0 text-[10px] px-1 py-0.5 rounded border border-amber-400/50 bg-amber-400/10"
              title="Top 20% high-leverage task"
            >
              ⭐
            </span>
          )}

          {/* Resume nudge (Feature 2) */}
          {task.status !== 'done' && isInactive && onResumeTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResumeTask(task);
              }}
              className="flex-shrink-0 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-smooth animate-pulse"
              title="Task has been inactive for 2+ days. Rebuild context now."
            >
              ⚡ Resume
            </button>
          )}

          {/* Status badge (inline dropdown) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false); }}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-smooth hover:opacity-80 ${statusConf.bgClass}`}
            >
              {statusConf.label}
            </button>
            {showStatusMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[130px]">
                {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof statusConf][]).map(([key, conf]) => (
                  <button
                    key={key}
                    onClick={() => handleStatusChange(key)}
                    className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted flex items-center gap-2 ${
                      task.status === key ? 'font-semibold' : ''
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: conf.color }} />
                    {conf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority dot (inline dropdown) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false); }}
              className="transition-smooth hover:scale-125"
              title={priorityConf.label}
            >
              <span className={`block w-2.5 h-2.5 rounded-full ${priorityConf.dotClass}`} />
            </button>
            {showPriorityMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof priorityConf][]).map(([key, conf]) => (
                  <button
                    key={key}
                    onClick={() => handlePriorityChange(key)}
                    className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted flex items-center gap-2 ${
                      task.priority === key ? 'font-semibold' : ''
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dotClass}`} />
                    {conf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & actions toggle — reveals everything below without cluttering the default view */}
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className={`flex-shrink-0 p-1 rounded-md transition-smooth ${
              detailsExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={detailsExpanded ? 'Hide details & actions' : 'Show details & actions'}
          >
            <Icon name="EllipsisHorizontalIcon" size={14} />
          </button>
        </div>

        {/* Row 2: compact meta strip — badges & chips only, always visible but tiny */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap pl-[22px]">
          {/* Depth badge */}
          <span
            className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${depthColor}20`, color: depthColor }}
          >
            L{depth}
          </span>

          {/* Generation type badge */}
          {task.generation_type === 'dive_deeper' && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
              🔍 Deep
            </span>
          )}
          {task.generation_type === 'chunk' && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
              ⚡ Chunk
            </span>
          )}

          {/* Recurrence badge (Feature 4) */}
          {task.is_recurring ? (
            <span
              className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center gap-0.5"
              title={`Recurring: ${task.recurrence_interval}${task.recurrence_interval === 'custom_days' ? ` (${task.recurrence_custom_days})` : ''}`}
            >
              🔁 {task.recurrence_interval === 'custom_days' ? task.recurrence_custom_days : task.recurrence_interval}
            </span>
          ) : null}

          {/* Time estimate (click to edit) */}
          {editingField === 'time_estimate' ? (
            <input
              className="text-[10px] bg-input border border-border rounded px-2 py-0.5 w-20 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('time_estimate')}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit('time_estimate'); if (e.key === 'Escape') setEditingField(null); }}
              placeholder="e.g. 30 mins"
              autoFocus
            />
          ) : (
            <button
              onClick={() => startEdit('time_estimate', task.time_estimate || '')}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1"
            >
              <Icon name="ClockIcon" size={10} />
              {task.time_estimate || 'Add time'}
            </button>
          )}

          {/* Due date */}
          {editingField === 'due_date' ? (
            <input
              type="date"
              className="text-[10px] bg-input border border-border rounded px-2 py-0.5 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('due_date')}
              autoFocus
            />
          ) : (
            <button
              onClick={() => startEdit('due_date', task.due_date || '')}
              className={`text-[10px] flex items-center gap-1 transition-smooth ${
                dueInfo?.isOverdue ? 'text-red-500 font-semibold' :
                dueInfo?.isDueToday ? 'text-amber-500 font-semibold' :
                'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="CalendarIcon" size={10} />
              {dueInfo?.text || 'Add date'}
            </button>
          )}

          {/* Progress bar (if has children) */}
          {hasChildren && (
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : depthColor }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-medium">{progress}%</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Context chip */}
          {task.context && (
            <button
              onClick={() => { setDetailsExpanded(true); setShowContext(true); }}
              className="text-muted-foreground hover:text-foreground transition-smooth"
              title="View context"
            >
              <Icon name="PaperClipIcon" size={11} />
            </button>
          )}

          {/* Notes count chip */}
          <button
            onClick={() => { setDetailsExpanded(true); setShowNotes(true); }}
            className={`text-[10px] flex items-center gap-1 transition-smooth px-1 py-0.5 rounded ${
              notesCount > 0 ? 'text-foreground' : 'text-muted-foreground/50'
            } hover:text-foreground`}
            title="View Notes & Journal"
          >
            <Icon name="DocumentTextIcon" size={11} />
            {notesCount > 0 ? notesCount : ''}
          </button>
        </div>

        {/* Intention / Definition of Done — short (~10 word) preview, always visible.
            Full text on hover; clicking opens the full task page. */}
        {(task.intention || task.definition_of_done) && (
          <div className="flex flex-col gap-0.5 mt-1 pl-[22px]">
            {task.intention && (
              <div className="relative group">
                <button
                  onClick={() => setShowDetailModal(true)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-smooth text-left flex items-start gap-1 min-w-0 w-full"
                >
                  <span className="shrink-0">🎯</span>
                  <span className="truncate italic">{truncateWords(task.intention, 10)}</span>
                </button>
                <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block bg-gray-900 dark:bg-gray-800 text-white text-[10px] rounded p-2 whitespace-normal min-w-[220px] max-w-[320px] z-50 shadow-lg leading-normal">
                  <p className="font-semibold text-primary mb-1">🎯 Intention</p>
                  <p>{task.intention}</p>
                </div>
              </div>
            )}
            {task.definition_of_done && (
              <div className="relative group">
                <button
                  onClick={() => setShowDetailModal(true)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-smooth text-left flex items-start gap-1 min-w-0 w-full"
                >
                  <span className="shrink-0">✅</span>
                  <span className="truncate italic">{truncateWords(task.definition_of_done, 10)}</span>
                </button>
                <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block bg-gray-900 dark:bg-gray-800 text-white text-[10px] rounded p-2 whitespace-normal min-w-[220px] max-w-[320px] z-50 shadow-lg leading-normal">
                  <p className="font-semibold text-emerald-400 mb-1">✅ Definition of Done</p>
                  <p>{task.definition_of_done}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dive Deeper / Chunk It — always visible per feedback, not gated behind the details toggle */}
        <div className="flex items-center gap-1.5 mt-1.5 pl-[22px]">
          <button
            onClick={() => handleAIAction('dive')}
            disabled={loading !== null}
            className="text-[10px] px-2 py-1 rounded-md border border-purple-500/30 text-purple-500 hover:bg-purple-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1 font-medium"
            title="Break into strategic subtasks"
          >
            {loading === 'dive' ? (
              <span className="w-3 h-3 border border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            ) : '🔍'}
            <span>Dive Deeper</span>
          </button>
          <button
            onClick={() => handleAIAction('chunk')}
            disabled={loading !== null}
            className="text-[10px] px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1 font-medium"
            title="Break into actionable steps"
          >
            {loading === 'chunk' ? (
              <span className="w-3 h-3 border border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            ) : '⚡'}
            <span>Chunk It</span>
          </button>
        </div>

        {/* Depth warning (feedback #11) — always visible since Dive/Chunk that trigger it are always visible */}
        {showDepthWarning && (
          <div className="mt-2 ml-[22px] p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <span className="text-xs">⚠️</span>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex-1">
              You're at L{depth} depth — AI subtasks may become too granular. Continue?
            </p>
            <button
              onClick={() => handleAIAction(showDepthWarning)}
              className="text-[10px] px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition-smooth"
            >
              Yes, continue
            </button>
            <button
              onClick={() => setShowDepthWarning(null)}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted transition-smooth"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Task Detail & Pareto modals — rendered unconditionally so opening them (e.g. via the
            title click) doesn't require the collapsed details panel to be expanded first */}
        <TaskDetailModal
          taskId={task.id}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onUpdate={(updates) => onUpdate(task.id, updates || {})}
          model={model}
        />
        <ParetoModal
          isOpen={showParetoModal}
          onClose={() => setShowParetoModal(false)}
          title={task.title}
          table="tasks"
              itemId={task.id}
              paretoScore={task.pareto_score}
              isTop20={task.is_top_20}
              model={model}
              onUpdate={async (updates) => {
                const updated = await todoService.updateTask(task.id, updates as any);
                if (updated) onUpdate(task.id, updates);
              }}
            />

        {/* Detail panel — actions, context, recurrence & notes. Hidden until the "···" toggle is used. */}
        {detailsExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-2.5 pl-[22px]">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Open Task Page / Details Modal */}
            <button
              onClick={() => setShowDetailModal(true)}
              className="text-[10px] px-2 py-1 rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-smooth flex items-center gap-1 font-semibold"
              title="Open full task page for context, notes, due date & details"
            >
              <span>📄</span>
              <span>Details</span>
            </button>

            {/* Pareto 80/20 Action */}
            <button
              onClick={() => setShowParetoModal(true)}
              className={`text-[10px] px-1.5 py-1 rounded-md transition-smooth flex items-center gap-1 ${
                task.is_top_20 ? 'bg-amber-400/10 text-amber-500 font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
              title="80/20 Pareto Analysis"
            >
              ⭐
            </button>

            {/* Generate DoD & Subtasks */}
            <button
              onClick={async () => {
                setLoading('dod' as any);
                try {
                  const res = await todoService.generateTaskDoD(task.id, model);
                  if (res && res.created_subtasks && res.created_subtasks.length > 0) {
                    onChildrenGenerated(task.id, res.created_subtasks, 'chunk');
                  }
                  if (res && res.definition_of_done) {
                    onUpdate(task.id, { definition_of_done: res.definition_of_done });
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(null);
                }
              }}
              disabled={loading !== null}
              className="text-[10px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1 font-medium"
              title="Generate Definition of Done & Subtasks with AI"
            >
              {loading === ('dod' as any) ? (
                <span className="w-3 h-3 border border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              ) : '✨'}
              <span>DoD</span>
            </button>

            {/* Regenerate (AI-generated nodes only) */}
            {isAiGenerated && hasChildren && (
              <button
                onClick={handleRegenerate}
                disabled={loading !== null}
                className="text-[10px] px-1.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth disabled:opacity-40"
                title="Regenerate subtasks"
              >
                {loading === 'regen' ? (
                  <span className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" />
                ) : '🔄'}
              </button>
            )}

            {/* Move Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  const next = !showMoveMenu;
                  setShowMoveMenu(next);
                  if (!next) setMovePlanOpen(false);
                  setShowDeleteConfirm(false);
                  setShowParetoModal(false);
                }}
                className="text-[10px] p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-smooth flex items-center gap-0.5"
                title="Move Task"
              >
                <Icon name="ArrowRightIcon" size={11} />
              </button>
              {showMoveMenu && !movePlanOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[170px]">
                  <button
                    onClick={async () => {
                      setShowMoveMenu(false);
                      const res = await todoService.moveToQuick(task.id);
                      if (res) onDelete(task.id); // Moved for good — remove from Smart To-Do view
                    }}
                    className="w-full text-left text-[10px] px-2.5 py-2 rounded-md hover:bg-muted transition-smooth flex items-center gap-2"
                  >
                    <span className="text-xs">⚡</span> Move to Quick Daily
                  </button>
                  <button
                    onClick={handleOpenMovePlan}
                    className="w-full text-left text-[10px] px-2.5 py-2 rounded-md hover:bg-muted transition-smooth flex items-center gap-2"
                  >
                    <span className="text-xs">🗺️</span> Move to Plan & Project
                  </button>
                </div>
              )}
              {showMoveMenu && movePlanOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 min-w-[210px] max-h-[260px] overflow-y-auto scrollbar-clean">
                  <div className="flex items-center gap-1.5 px-1.5 pb-1.5 mb-1 border-b border-border/60">
                    <button
                      onClick={() => setMovePlanOpen(false)}
                      className="text-muted-foreground hover:text-foreground transition-smooth"
                      title="Back"
                    >
                      <Icon name="ArrowLeftIcon" size={10} />
                    </button>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Move into a project
                    </span>
                  </div>

                  {moveProjectsLoading ? (
                    <div className="px-2.5 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
                      <span className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" />
                      Loading projects...
                    </div>
                  ) : (
                    <>
                      {(moveProjects || []).map((p) => (
                        <button
                          key={p.id}
                          disabled={moving}
                          onClick={() => handleMoveToProject(p.id)}
                          className="w-full text-left text-[10px] px-2.5 py-1.5 rounded-md hover:bg-muted transition-smooth flex items-center gap-2 disabled:opacity-50"
                        >
                          <span className="text-xs">{p.icon || '📁'}</span>
                          <span className="truncate flex-1">{p.title}</span>
                        </button>
                      ))}
                      {(moveProjects || []).length === 0 && (
                        <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground/80 italic">
                          No existing projects yet.
                        </p>
                      )}
                      <div className="mt-1 pt-1 border-t border-border/60">
                        <button
                          disabled={moving}
                          onClick={() => handleMoveToProject(null)}
                          className="w-full text-left text-[10px] px-2.5 py-1.5 rounded-md hover:bg-primary/10 text-primary font-semibold transition-smooth flex items-center gap-2 disabled:opacity-50"
                        >
                          <Icon name="PlusIcon" size={10} /> New Project from this Task
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="relative">
              <button
                onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setShowMoveMenu(false); setShowParetoModal(false); }}
                className="text-[10px] px-1.5 py-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-smooth"
                title="Delete task"
              >
                <Icon name="TrashIcon" size={12} />
              </button>
              {showDeleteConfirm && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-xs text-foreground font-medium mb-2">Delete this task{hasChildren ? ' and all subtasks' : ''}?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="text-[11px] px-3 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-smooth font-medium"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-[11px] px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-smooth"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        {/* Context display */}
        {showContext && task.context && (
          <div className="mt-2 p-2.5 rounded-md bg-muted/50 border border-border">
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {task.context}
            </p>
          </div>
        )}

        {/* Recurrence — compact inline control (intention/DoD editing lives in the Details modal) */}
        <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={!!task.is_recurring}
                  onChange={async (e) => {
                    const active = e.target.checked;
                    const updated = await todoService.updateTask(task.id, {
                      is_recurring: active ? 1 : 0,
                      recurrence_interval: active ? (task.recurrence_interval || 'daily') : null,
                    });
                    if (updated) {
                      onUpdate(task.id, {
                        is_recurring: active,
                        recurrence_interval: active ? (task.recurrence_interval || 'daily') : null,
                      });
                    }
                  }}
                  className="h-3 w-3 rounded border-border text-primary cursor-pointer"
                />
                🔁 Recurring
              </label>

              {task.is_recurring ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={task.recurrence_interval || 'daily'}
                    onChange={async (e) => {
                      const val = e.target.value;
                      const updated = await todoService.updateTask(task.id, { recurrence_interval: val });
                      if (updated) {
                        onUpdate(task.id, { recurrence_interval: val });
                      }
                    }}
                    className="bg-input border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus-ring font-semibold"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom_days">Custom Days</option>
                  </select>
                  {task.recurrence_interval === 'custom_days' && (
                    <input
                      type="text"
                      value={task.recurrence_custom_days || ''}
                      placeholder="e.g. mon,wed,fri"
                      onBlur={async (e) => {
                        const val = e.target.value.trim() || null;
                        const updated = await todoService.updateTask(task.id, { recurrence_custom_days: val });
                        if (updated) {
                          onUpdate(task.id, { recurrence_custom_days: val });
                        }
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim() || null;
                          const updated = await todoService.updateTask(task.id, { recurrence_custom_days: val });
                          if (updated) {
                            onUpdate(task.id, { recurrence_custom_days: val });
                          }
                          e.currentTarget.blur();
                        }
                      }}
                      className="bg-input border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground focus-ring w-24 placeholder:text-muted-foreground/60"
                    />
                  )}
                </div>
              ) : null}
        </div>

        {/* Notes display */}
        {showNotes && (
          <div className="mt-3 p-3 rounded-lg bg-card border border-border/80 shadow-inner space-y-3">
            {/* AI Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap border-b border-border pb-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">AI Journal:</span>
              <button
                type="button"
                onClick={handleExplainTask}
                disabled={aiActionLoading !== null}
                className="text-[10px] px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 font-medium transition-smooth flex items-center gap-1 disabled:opacity-50"
              >
                {aiActionLoading === 'explain' ? '⏳' : '✨'} Explain Task
              </button>
              <button
                type="button"
                onClick={handleSummarizeNotes}
                disabled={aiActionLoading !== null || notes.length === 0}
                className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium transition-smooth flex items-center gap-1 disabled:opacity-50"
              >
                {aiActionLoading === 'summarize' ? '⏳' : '📋'} Summarize Journal
              </button>
            </div>

            {/* AI Summary display (dismissable) */}
            {summary && (
              <div className="p-2.5 rounded bg-emerald-500/5 border border-emerald-500/20 text-xs text-foreground relative">
                <button
                  type="button"
                  onClick={() => setSummary(null)}
                  className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Icon name="XMarkIcon" size={12} />
                </button>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Journal Summary:</p>
                <p className="leading-relaxed whitespace-pre-wrap">{summary}</p>
              </div>
            )}

            {/* Add manual note input */}
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                type="text"
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="Type a thought, decision, or update..."
                className="flex-1 bg-input border border-border rounded px-2.5 py-1.5 text-xs focus-ring placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/95 transition-smooth"
              >
                Add Note
              </button>
            </form>

            {/* Notes list (timeline) */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-clean pr-1">
              {notes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-2">No notes logged yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="p-2 rounded bg-muted/40 border border-border/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span className="capitalize px-1 py-0.5 rounded bg-muted font-semibold text-foreground">
                        {note.note_type.replace('ai_', 'AI ').replace('manual', 'Manual')}
                      </span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    
                    {/* Expand button for manual notes */}
                    {note.note_type === 'manual' && (
                      <button
                        type="button"
                        onClick={() => handleExpandNote(note.id)}
                        disabled={aiActionLoading !== null}
                        className="text-[9px] text-primary hover:underline font-semibold mt-1 self-start flex items-center gap-0.5 disabled:opacity-50"
                      >
                        {aiActionLoading === `expand-${note.id}` ? 'Expanding...' : '⚡ Expand decision'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
          </div>
        )}
      </div>

      {/* Children (recursive) */}
      {childrenExpanded && hasChildren && (
        <div className="relative">
          {task.children.map((child, index) => (
            <TaskNode
              key={child.id}
              task={child}
              depth={depth + 1}
              chunkIndex={child.generation_type === 'chunk' ? index : undefined}
              model={model}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onChildrenGenerated={onChildrenGenerated}
              onUndoAvailable={onUndoAvailable}
              searchQuery={searchQuery}
              onResumeTask={onResumeTask}
            />
          ))}
        </div>
      )}

      {/* Loading skeleton for AI generation */}
      {loading && loading !== 'regen' && (
        <div className="ml-6 space-y-2 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}
    </div>
  );
}
