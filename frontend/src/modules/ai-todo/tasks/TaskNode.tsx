'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import ParetoModal from '@/components/ui/ParetoModal';
import Popover from '@/components/ui/Popover';
import TaskDetailModal from './TaskDetailModal';
import { STATUS_COLOR, STATUS_TEXT, PRIORITY_COLOR, PRIORITY_TEXT } from '../shared/semanticColors';
import { projectService, type Project } from '@/lib/services/projectService';
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Note,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  getDepthColor,
  getDepthName,
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
  /** A subtask was added by hand (e.g. from the details dialog); the owner appends it to the tree. */
  onChildAdded?: (parentId: number, child: Task) => void;
  searchQuery?: string;
  onResumeTask?: (task: Task) => void;
  revealDelays?: Record<number, number>;
  /** List/Focus layouts already show every task flat — don't also nest the subtree under each row. */
  flat?: boolean;
  /** `row` (default): a plain row in the task list. `card`: a small bordered card, for where a task is a draggable object (the matrix). */
  variant?: 'row' | 'card';
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
  onChildAdded,
  searchQuery = '',
  onResumeTask,
  flat = false,
  variant = 'row',
}: TaskNodeProps) {
  const [childrenExpanded, setChildrenExpanded] = useState(depth <= 2);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [loading, setLoading] = useState<'dive' | 'chunk' | 'regen' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showDepthWarning, setShowDepthWarning] = useState<'dive' | 'chunk' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Triggers the menus anchor to (the menus render through a portal; see components/ui/Popover.tsx)
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);

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

  // Runs a journal AI action; a failure surfaces in the card instead of leaving the spinner stuck.
  const runJournalAction = async (key: string, action: () => Promise<void>) => {
    setAiActionLoading(key);
    setAiError(null);
    try {
      await action();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI journal action failed.');
    } finally {
      setAiActionLoading(null);
    }
  };

  const handleExplainTask = () => runJournalAction('explain', async () => {
    const added = await todoService.explainTask(task.id, model);
    if (added) {
      setNotes(prev => [added, ...prev]);
      setNotesCount(prev => prev + 1);
    }
  });

  const handleSummarizeNotes = () => runJournalAction('summarize', async () => {
    setSummary(await todoService.summarizeNotes(task.id, model));
  });

  const handleExpandNote = (noteId: number) => runJournalAction(`expand-${noteId}`, async () => {
    const added = await todoService.expandNote(task.id, noteId, model);
    if (added) {
      setNotes(prev => [added, ...prev]);
      setNotesCount(prev => prev + 1);
    }
  });

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
    const { clientX, clientY } = e;
    const updated = await todoService.updateTask(task.id, { status: newStatus as TaskStatus });
    // Not saved: the service already toasted why, and a failed save gets no celebration.
    if (!updated) return;
    if (newStatus === 'done') triggerConfetti(clientX, clientY);
    onUpdate(task.id, { status: newStatus as TaskStatus });
  };

  // ── AI breakdown handlers ────────────────────────────────────────────────

  const handleAIAction = async (type: 'dive' | 'chunk') => {
    // Depth warning at L4+ (feedback #11)
    if (depth >= 4 && !showDepthWarning) {
      setShowDepthWarning(type);
      return;
    }
    setShowDepthWarning(null);
    setAiError(null);
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
      setAiError(err instanceof Error ? err.message : 'AI breakdown failed.');
    } finally {
      setLoading(null);
    }
  };

  const handleRegenerate = async () => {
    setAiError(null);
    setLoading('regen');
    try {
      const subtasks = await todoService.regenerate(task.id, model);
      if (subtasks.length > 0) {
        onChildrenGenerated(task.id, subtasks, task.generation_type);
      }
    } catch (err) {
      console.error('Regeneration failed:', err);
      setAiError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setLoading(null);
    }
  };

  // ── Delete handler ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (deleting) return; // a double-click must not send two DELETEs
    setDeleting(true);
    const deleted = await todoService.deleteTask(task.id);
    if (deleted) onDelete(task.id);
    setDeleting(false);
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

  // A plain row in the list; a small bordered card where the task is a draggable object (Eisenhower matrix).
  const isCard = variant === 'card';

  // 80/20 reads through the Top-20 star and by dimming low-leverage tasks — no ring, glow or side bar. A finished task is
  // never dimmed this way: it stays readable.
  const dimmed =
    task.status !== 'done' && !task.is_top_20 && task.pareto_score !== undefined && task.pareto_score !== null && task.pareto_score < 0.3;

  // Depth: 1 for a root task, +1 per parent → child link. The caller passes the real level (also in the flat List / Focus
  // layouts, where nothing is nested). It drives the rail colour, the "L2" tag and its tooltip.
  const depthColor = getDepthColor(depth);
  const depthTitle = `Level ${depth} — ${getDepthName(depth)}`;
  // Only the nested tree indents; the flat layouts show the level through the rail and the tag alone.
  const indented = depth > 1 && !flat && !isCard;

  // Small inline controls on the meta line: text only, soft fill on hover.
  const metaBtn =
    'todo-focus inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-smooth hover:mix-bg-foreground/[0.07]';
  const metaMuted = 'text-muted-foreground hover:text-foreground';
  // Empty values ("Add date", "Add time", the first note) stay out of sight until the row is hovered or focused;
  // a phone has no hover, so there they appear once the row is expanded with "···".
  const emptyField = detailsExpanded
    ? ''
    : 'hidden opacity-0 [@media(hover:hover)]:inline-flex group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100';

  // Expand/collapse subtasks. From `sm` up it leads the row (before the checkbox); on a phone it moves into the
  // state group on the right, so every checkbox lines up at the left edge and the title gets the width back.
  const chevronButton = (className: string) => (
    <button
      onClick={() => setChildrenExpanded(!childrenExpanded)}
      className={`todo-focus rounded text-muted-foreground hover:text-foreground transition-smooth shrink-0 ${className}`}
      title={childrenExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
      aria-label={`${childrenExpanded ? 'Collapse' : 'Expand'} ${task.children.length} subtask${task.children.length === 1 ? '' : 's'}`}
      aria-expanded={childrenExpanded}
    >
      <Icon
        name="ChevronRightIcon"
        size={12}
        className={`transition-transform duration-200 ${childrenExpanded ? 'rotate-90' : ''}`}
      />
    </button>
  );
  const showChevron = hasChildren && !flat;

  const dueTone = dueInfo?.isOverdue
    ? 'font-semibold text-error'
    : dueInfo?.isDueToday
      ? 'font-semibold text-warning'
      : metaMuted;

  return (
    <div className={`task-node relative ${indented ? 'pl-[1rem] sm:pl-[1.25rem]' : ''}`} data-depth={depth}>
      {/* The task: separated from the next by spacing and a faint divider, not by a box */}
      <div
        className={`group/row ${isCard ? 'todo-row-card px-3 py-2.5' : 'todo-row pl-3 pr-1 py-3 sm:px-3'} ${dimmed ? 'opacity-60' : ''}`}
        data-match={matchesSearch ? 'true' : undefined}
        data-done={task.status === 'done' ? 'true' : undefined}
      >
        {/* Hierarchy rail: this task's level as a slim bar on its left edge. Not in the matrix, where cards are flat. */}
        {!isCard && (
          <span
            className="todo-rail"
            role="img"
            aria-label={depthTitle}
            title={depthTitle}
            style={{ '--rail': depthColor } as React.CSSProperties}
          />
        )}
        <div className="flex items-start gap-x-2.5">
          {/* Lead: subtask chevron + checkbox */}
          <div className="flex shrink-0 items-start gap-1.5">
            {/* Children chevron (separate from the details toggle) */}
            {showChevron ? chevronButton('mt-[3px] hidden sm:block') : <span className="hidden w-3 shrink-0 sm:block [@media(pointer:coarse)]:w-10" />}

            {/* Checkbox — padded hit area around the 16px box */}
            <button
              onClick={handleCheckbox}
              role="checkbox"
              aria-checked={task.status === 'done'}
              aria-label={`Mark "${task.title}" ${task.status === 'done' ? 'not done' : 'done'}`}
              className="todo-focus group/check -m-1 flex-shrink-0 rounded-md p-1 transition-smooth"
            >
              <div className={`w-[16px] h-[16px] rounded-[4px] border-2 flex items-center justify-center transition-smooth ${
                task.status === 'done'
                  ? 'bg-success border-success'
                  : 'mix-border-muted-foreground/70 group-hover/check:border-primary'
              }`}>
                {task.status === 'done' && (
                  <Icon name="CheckIcon" size={11} className="text-success-foreground" variant="solid" />
                )}
              </div>
            </button>
          </div>

          {/* Content: title and state on the first line, everything else quieter underneath */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              {/* Step number for chunk subtasks */}
              {task.generation_type === 'chunk' && chunkIndex !== undefined && (
                <span className="mt-[2px] w-4 flex-shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {chunkIndex + 1}.
                </span>
              )}

              {/* Title (click to open details, double-click to rename) */}
              {editingField === 'title' ? (
                <input
                  ref={titleRef}
                  className="min-w-[9rem] flex-1 basis-[9rem] text-sm font-medium bg-input border border-border rounded-md px-2 py-0.5 focus-ring"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveEdit('title')}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit('title'); if (e.key === 'Escape') setEditingField(null); }}
                  autoFocus
                />
              ) : (
                <button
                  className={`todo-focus min-w-[9rem] flex-1 basis-[9rem] rounded text-left text-sm font-medium leading-snug transition-smooth line-clamp-2 break-words ${
                    task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}
                  onClick={() => setShowDetailModal(true)}
                  onDoubleClick={() => startEdit('title', task.title)}
                  title="Click to open task page for details & context · double-click to rename"
                >
                  {task.title}
                </button>
              )}

              {/* State: Top-20 star, resume nudge, status, priority and the details toggle in one group, so on a
                  narrow screen they wrap together under the title instead of squeezing it */}
              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-0.5 gap-y-1">
                {/* Top 20% */}
                {task.is_top_20 && (
                  <span className="inline-flex items-center px-1 text-warning" title="Top 20% high-leverage task">
                    <Icon name="StarIcon" size={14} variant="solid" />
                    <span className="sr-only">Top 20% task</span>
                  </span>
                )}

                {/* Resume nudge (Feature 2) */}
                {task.status !== 'done' && isInactive && onResumeTask && !isCard && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResumeTask(task);
                    }}
                    className={`${metaBtn} font-medium text-warning`}
                    title="Task has been inactive for 2+ days. Rebuild context now."
                  >
                    <Icon name="BoltIcon" size={12} variant="solid" />
                    Resume
                  </button>
                )}

                {/* Status (inline dropdown): a coloured dot and plain text, not a filled pill */}
                <div className={`flex-shrink-0 ${detailsExpanded ? '' : 'hidden sm:block'}`}>
                  <button
                    ref={statusBtnRef}
                    onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false); }}
                    className={`${metaBtn} w-[6.25rem] justify-start font-medium ${STATUS_TEXT[task.status]}`}
                    aria-haspopup="menu"
                    aria-expanded={showStatusMenu}
                    aria-label={`Status: ${statusConf.label}. Change status`}
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[task.status] }} aria-hidden="true" />
                    <span className="truncate">{statusConf.label}</span>
                  </button>
                  <Popover
                    open={showStatusMenu}
                    anchorRef={statusBtnRef}
                    onClose={() => setShowStatusMenu(false)}
                    label="Change status"
                    className="todo-popover p-1 min-w-[130px]"
                  >
                    {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof statusConf][]).map(([key, conf]) => (
                      <button
                        key={key}
                        role="menuitem"
                        onClick={() => handleStatusChange(key)}
                        className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted flex items-center gap-2 ${
                          task.status === key ? 'font-semibold' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLOR[key] }} />
                        {conf.label}
                      </button>
                    ))}
                  </Popover>
                </div>

                {/* Priority (inline dropdown) */}
                <div className={`flex-shrink-0 ${detailsExpanded ? '' : 'hidden sm:block'}`}>
                  <button
                    ref={priorityBtnRef}
                    onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false); }}
                    className={`${metaBtn} ${PRIORITY_TEXT[task.priority]} min-w-[3rem] justify-start font-medium`}
                    title={priorityConf.label}
                    aria-haspopup="menu"
                    aria-expanded={showPriorityMenu}
                    aria-label={`Priority: ${priorityConf.label}. Change priority`}
                  >
                    <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[task.priority] }} aria-hidden="true" />
                    {task.priority.toUpperCase()}
                  </button>
                  <Popover
                    open={showPriorityMenu}
                    anchorRef={priorityBtnRef}
                    onClose={() => setShowPriorityMenu(false)}
                    label="Change priority"
                    className="todo-popover p-1 min-w-[120px]"
                  >
                    {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof priorityConf][]).map(([key, conf]) => (
                      <button
                        key={key}
                        role="menuitem"
                        onClick={() => handlePriorityChange(key)}
                        className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted flex items-center gap-2 ${
                          task.priority === key ? 'font-semibold' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLOR[key] }} />
                        {conf.label}
                      </button>
                    ))}
                  </Popover>
                </div>

                {/* Phones: the subtask chevron sits here, next to the details toggle */}
                {showChevron && !isCard && chevronButton('sm:hidden')}

                {/* Details & actions toggle — reveals everything below without cluttering the default view */}
                {!isCard && (
                  <button
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    className={`todo-focus flex-shrink-0 rounded-md p-1 transition-smooth ${
                      detailsExpanded ? 'todo-btn-active' : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.07]'
                    }`}
                    title={detailsExpanded ? 'Hide details & actions' : 'Show details & actions'}
                    aria-label={detailsExpanded ? 'Hide details and actions' : 'Show details and actions'}
                    aria-expanded={detailsExpanded}
                  >
                    <Icon name="EllipsisHorizontalIcon" size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Phones, at rest: the row's state as one line of plain text (status, priority, due, time, progress).
                Text isn't a tap target, so it stays one slim line; the controls behind it appear with "···". */}
            <div className={`mt-1.5 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:hidden ${detailsExpanded || isCard ? 'hidden' : 'flex'}`}>
              <span className={`inline-flex items-center gap-1.5 ${STATUS_TEXT[task.status]}`}>
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[task.status] }} aria-hidden="true" />
                {statusConf.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 ${PRIORITY_TEXT[task.priority]}`}>
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[task.priority] }} aria-hidden="true" />
                {task.priority.toUpperCase()}
              </span>
              {dueInfo && (
                <span className={dueInfo.isOverdue ? 'font-semibold text-error' : dueInfo.isDueToday ? 'font-semibold text-warning' : ''}>
                  {dueInfo.text}
                </span>
              )}
              {task.time_estimate && <span>{task.time_estimate}</span>}
              {hasChildren && <span className="tabular-nums">{progress}%</span>}
              {depth > 1 && <span title={depthTitle}>L{depth}</span>}
            </div>

            {/* Line 2: quiet metadata on the left, the AI actions on the right. Only values that exist are drawn;
                the empty ones appear on hover. On a phone it is the expanded view of the summary above. */}
            <div className={`-ml-1.5 mt-1.5 flex-wrap items-center gap-x-1 gap-y-1 ${detailsExpanded ? 'flex' : 'hidden sm:flex'}`}>
              {/* Depth — plain text, and only below the top level (the indent already shows it) */}
              {depth > 1 && !isCard && (
                <span className="px-1.5 text-xs text-muted-foreground" title={depthTitle}>L{depth}</span>
              )}

              {/* Generation type */}
              {task.generation_type === 'dive_deeper' && (
                <span className="px-1.5 text-xs text-muted-foreground" title="Created by Dive Deeper">Deep</span>
              )}
              {task.generation_type === 'chunk' && (
                <span className="px-1.5 text-xs text-muted-foreground" title="Created by Chunk It">Chunk</span>
              )}

              {/* Recurrence badge (Feature 4) */}
              {task.is_recurring ? (
                <span
                  className="inline-flex items-center gap-1 px-1.5 text-xs text-muted-foreground"
                  title={`Recurring: ${task.recurrence_interval}${task.recurrence_interval === 'custom_days' ? ` (${task.recurrence_custom_days})` : ''}`}
                >
                  <Icon name="ArrowPathIcon" size={12} />
                  {task.recurrence_interval === 'custom_days' ? task.recurrence_custom_days : task.recurrence_interval}
                </span>
              ) : null}

              {/* Due date (click to edit) */}
              {editingField === 'due_date' ? (
                <input
                  type="date"
                  className="text-xs bg-input border border-border rounded-md px-2 py-0.5 focus-ring"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveEdit('due_date')}
                  autoFocus
                />
              ) : (dueInfo || !isCard) && (
                <button
                  onClick={() => startEdit('due_date', task.due_date || '')}
                  className={`${metaBtn} ${dueTone} ${dueInfo ? '' : emptyField}`}
                >
                  <Icon name="CalendarIcon" size={12} />
                  {dueInfo?.text || 'Add date'}
                </button>
              )}

              {/* Time estimate (click to edit) */}
              {editingField === 'time_estimate' ? (
                <input
                  className="text-xs bg-input border border-border rounded-md px-2 py-0.5 w-20 focus-ring"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveEdit('time_estimate')}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit('time_estimate'); if (e.key === 'Escape') setEditingField(null); }}
                  placeholder="e.g. 30 mins"
                  autoFocus
                />
              ) : (task.time_estimate || !isCard) && (
                <button
                  onClick={() => startEdit('time_estimate', task.time_estimate || '')}
                  className={`${metaBtn} ${metaMuted} ${task.time_estimate ? '' : emptyField}`}
                >
                  <Icon name="ClockIcon" size={12} />
                  {task.time_estimate || 'Add time'}
                </button>
              )}

              {/* Progress (if has children) */}
              {hasChildren && (
                <span className="flex items-center gap-1.5 px-1.5" title={`${progress}% of subtasks done`}>
                  <span className="h-1 w-[2.5rem] overflow-hidden rounded-full mix-bg-foreground/10">
                    <span
                      className={`block h-full rounded-full transition-all duration-300 ${progress === 100 ? 'bg-success' : 'mix-bg-progress'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
                </span>
              )}

              {/* Right: context, notes and the AI breakdown actions (not in the matrix, where cards aren't clickable).
                  On a phone every one of these is a 40px-tall tap target, so they live in the "···" panel instead. */}
              {!isCard && (
                <div className="ml-auto hidden flex-wrap items-center gap-x-0.5 gap-y-1 sm:flex">
                  {/* Context chip */}
                  {task.context && (
                    <button
                      onClick={() => { setDetailsExpanded(true); setShowContext(true); }}
                      className={`${metaBtn} ${metaMuted}`}
                      title="View context"
                      aria-label="View context"
                    >
                      <Icon name="PaperClipIcon" size={12} />
                    </button>
                  )}

                  {/* Notes count chip */}
                  <button
                    onClick={() => { setDetailsExpanded(true); setShowNotes(true); }}
                    className={`${metaBtn} ${notesCount > 0 ? 'text-foreground' : `${metaMuted} ${emptyField}`}`}
                    title="View Notes & Journal"
                    aria-label={notesCount > 0 ? `Notes and journal (${notesCount})` : 'Notes and journal'}
                  >
                    <Icon name="DocumentTextIcon" size={12} />
                    {notesCount > 0 ? notesCount : ''}
                  </button>

                  {/* Dive Deeper / Chunk It — always on the row (per feedback, not gated behind the details toggle), just quiet */}
                  <button
                    onClick={() => handleAIAction('dive')}
                    disabled={loading !== null}
                    className={`${metaBtn} font-medium text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Break into strategic subtasks"
                  >
                    {loading === 'dive' ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Icon name="MagnifyingGlassIcon" size={12} />
                    )}
                    <span>Dive Deeper</span>
                  </button>
                  <button
                    onClick={() => handleAIAction('chunk')}
                    disabled={loading !== null}
                    className={`${metaBtn} font-medium text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50`}
                    title="Break into actionable steps"
                  >
                    {loading === 'chunk' ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Icon name="ScissorsIcon" size={12} />
                    )}
                    <span>Chunk It</span>
                  </button>
                </div>
              )}
            </div>

            {/* Intention / Definition of Done — short (~10 word) preview, always visible.
                Full text on hover; clicking opens the full task page. */}
            {(task.intention || task.definition_of_done) && (
              <div className={`-ml-1.5 mt-1.5 flex-col gap-0.5 ${detailsExpanded ? 'flex' : 'hidden sm:flex'}`}>
                {task.intention && (
                  <div className="relative group">
                    <button
                      onClick={() => setShowDetailModal(true)}
                      className="flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 text-left text-xs text-muted-foreground transition-smooth hover:text-foreground"
                    >
                      <Icon name="FlagIcon" size={12} className="mt-px shrink-0" />
                      <span className="truncate italic">{truncateWords(task.intention, 10)}</span>
                    </button>
                    <div className="todo-popover absolute bottom-full left-0 mb-1.5 hidden group-hover:block text-xs p-2 whitespace-normal min-w-[220px] max-w-[320px] z-50 leading-normal">
                      <p className="font-semibold text-primary mb-1">Intention</p>
                      <p>{task.intention}</p>
                    </div>
                  </div>
                )}
                {task.definition_of_done && (
                  <div className="relative group">
                    <button
                      onClick={() => setShowDetailModal(true)}
                      className="flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 text-left text-xs text-muted-foreground transition-smooth hover:text-foreground"
                    >
                      <Icon name="CheckCircleIcon" size={12} className="mt-px shrink-0" />
                      <span className="truncate italic">{truncateWords(task.definition_of_done, 10)}</span>
                    </button>
                    <div className="todo-popover absolute bottom-full left-0 mb-1.5 hidden group-hover:block text-xs p-2 whitespace-normal min-w-[220px] max-w-[320px] z-50 leading-normal">
                      <p className="font-semibold text-success mb-1">Definition of Done</p>
                      <p>{task.definition_of_done}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiError && (
              <div role="alert" className="todo-alert todo-alert-error mt-2 py-1.5">
                <Icon name="ExclamationTriangleIcon" size={13} className="mt-px shrink-0" />
                <p className="flex-1 text-xs leading-relaxed">{aiError}</p>
                <button onClick={() => setAiError(null)} className="todo-focus shrink-0 rounded opacity-70 hover:opacity-100" aria-label="Dismiss error">
                  <Icon name="XMarkIcon" size={12} />
                </button>
              </div>
            )}

            {/* Depth warning (feedback #11) — always visible since Dive/Chunk that trigger it are always visible */}
            {showDepthWarning && (
              <div className="mt-2 p-2.5 rounded-md mix-bg-warning/10 flex flex-wrap items-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0 text-warning" />
                <p className="text-xs text-warning flex-1">
                  You&apos;re at L{depth} depth — AI subtasks may become too granular. Continue?
                </p>
                <button
                  onClick={() => handleAIAction(showDepthWarning)}
                  className="text-xs px-2 py-1 rounded bg-warning text-warning-foreground hover:opacity-90 transition-smooth font-medium"
                >
                  Yes, continue
                </button>
                <button
                  onClick={() => setShowDepthWarning(null)}
                  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted transition-smooth"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Detail panel — actions, context, recurrence & notes. Hidden until the "···" toggle is used. */}
            {detailsExpanded && !isCard && (
              <div className="mt-3 space-y-3 border-t pt-3 mix-border-foreground/10">
                {/* Phones: what the second line shows on a wider screen */}
                <div className="flex flex-wrap items-center gap-1 sm:hidden">
                  <button
                    onClick={() => handleAIAction('dive')}
                    disabled={loading !== null}
                    className="todo-btn todo-btn-quiet px-2 py-1"
                    title="Break into strategic subtasks"
                  >
                    {loading === 'dive' ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Icon name="MagnifyingGlassIcon" size={12} />
                    )}
                    <span>Dive Deeper</span>
                  </button>
                  <button
                    onClick={() => handleAIAction('chunk')}
                    disabled={loading !== null}
                    className="todo-btn todo-btn-quiet px-2 py-1"
                    title="Break into actionable steps"
                  >
                    {loading === 'chunk' ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                      <Icon name="ScissorsIcon" size={12} />
                    )}
                    <span>Chunk It</span>
                  </button>
                  {task.context && (
                    <button
                      onClick={() => setShowContext(!showContext)}
                      className="todo-btn todo-btn-ghost px-2 py-1"
                      aria-pressed={showContext}
                    >
                      <Icon name="PaperClipIcon" size={12} />
                      <span>Context</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotes(!showNotes)}
                    className="todo-btn todo-btn-ghost px-2 py-1"
                    aria-pressed={showNotes}
                  >
                    <Icon name="DocumentTextIcon" size={12} />
                    <span>{notesCount > 0 ? `Notes (${notesCount})` : 'Notes'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {/* Open Task Page / Details Modal */}
                  <button
                    onClick={() => setShowDetailModal(true)}
                    className="todo-btn todo-btn-ghost px-2 py-1"
                    title="Open full task page for context, notes, due date & details"
                  >
                    <Icon name="DocumentTextIcon" size={12} />
                    <span>Details</span>
                  </button>

                  {/* Pareto 80/20 Action */}
                  <button
                    onClick={() => setShowParetoModal(true)}
                    className={`todo-btn px-2 py-1 ${task.is_top_20 ? 'text-warning hover:mix-bg-warning/10' : 'todo-btn-ghost'}`}
                    title="80/20 Pareto Analysis"
                    aria-label="80/20 Pareto analysis"
                  >
                    <Icon name="StarIcon" size={12} variant={task.is_top_20 ? 'solid' : 'outline'} />
                  </button>

                  {/* Generate DoD & Subtasks */}
                  <button
                    onClick={async () => {
                      setLoading('dod' as any);
                      setAiError(null);
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
                        setAiError(e instanceof Error ? e.message : 'Generating the Definition of Done failed.');
                      } finally {
                        setLoading(null);
                      }
                    }}
                    disabled={loading !== null}
                    className="todo-btn todo-btn-ghost px-2 py-1"
                    title="Generate Definition of Done & Subtasks with AI"
                  >
                    {loading === ('dod' as any) ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                    ) : <Icon name="SparklesIcon" size={12} />}
                    <span>DoD</span>
                  </button>

                  {/* Regenerate (AI-generated nodes only) */}
                  {isAiGenerated && hasChildren && (
                    <button
                      onClick={handleRegenerate}
                      disabled={loading !== null}
                      className="todo-btn todo-btn-ghost px-2 py-1"
                      title="Regenerate subtasks"
                      aria-label="Regenerate subtasks"
                    >
                      {loading === 'regen' ? (
                        <span className="block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />
                      ) : <Icon name="ArrowPathIcon" size={12} />}
                    </button>
                  )}

                  {/* Move Menu */}
                  <div>
                    <button
                      ref={moveBtnRef}
                      onClick={() => {
                        const next = !showMoveMenu;
                        setShowMoveMenu(next);
                        if (!next) setMovePlanOpen(false);
                        setShowDeleteConfirm(false);
                        setShowParetoModal(false);
                      }}
                      className="todo-btn todo-btn-ghost px-2 py-1"
                      title="Move Task"
                      aria-label="Move task"
                      aria-haspopup="menu"
                      aria-expanded={showMoveMenu}
                    >
                      <Icon name="ArrowRightIcon" size={12} />
                    </button>
                    <Popover
                      open={showMoveMenu}
                      anchorRef={moveBtnRef}
                      onClose={() => { setShowMoveMenu(false); setMovePlanOpen(false); }}
                      label={movePlanOpen ? 'Move into a project' : 'Move task'}
                      className={`todo-popover ${
                        movePlanOpen ? 'p-1.5 min-w-[210px] max-h-[260px] overflow-y-auto scrollbar-clean' : 'p-1 min-w-[170px]'
                      }`}
                    >
                      {!movePlanOpen ? (
                        <>
                          <button
                            role="menuitem"
                            onClick={async () => {
                              setShowMoveMenu(false);
                              const res = await todoService.moveToQuick(task.id);
                              if (res) onDelete(task.id); // Moved for good — remove from Smart To-Do view
                            }}
                            className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-muted focus:outline-none focus-visible:bg-muted transition-smooth flex items-center gap-2"
                          >
                            <Icon name="BoltIcon" size={12} /> Move to Quick Daily
                          </button>
                          <button
                            role="menuitem"
                            onClick={handleOpenMovePlan}
                            className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-muted focus:outline-none focus-visible:bg-muted transition-smooth flex items-center gap-2"
                          >
                            <Icon name="MapIcon" size={12} /> Move to Plan & Project
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 px-1.5 pb-1.5 mb-1 border-b mix-border-border/60">
                            <button
                              role="menuitem"
                              onClick={() => setMovePlanOpen(false)}
                              className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:text-foreground transition-smooth"
                              title="Back"
                              aria-label="Back"
                            >
                              <Icon name="ArrowLeftIcon" size={10} />
                            </button>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Move into a project
                            </span>
                          </div>

                          {moveProjectsLoading ? (
                            <div className="px-2.5 py-2 text-xs text-muted-foreground flex items-center gap-2">
                              <span className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" />
                              Loading projects...
                            </div>
                          ) : (
                            <>
                              {(moveProjects || []).map((p) => (
                                <button
                                  key={p.id}
                                  role="menuitem"
                                  disabled={moving}
                                  onClick={() => handleMoveToProject(p.id)}
                                  className="w-full text-left text-xs px-2.5 py-1.5 rounded-md hover:bg-muted focus:outline-none focus-visible:bg-muted transition-smooth flex items-center gap-2 disabled:opacity-50"
                                >
                                  {p.icon ? <span className="text-xs">{p.icon}</span> : <Icon name="FolderIcon" size={12} />}
                                  <span className="truncate flex-1">{p.title}</span>
                                </button>
                              ))}
                              {(moveProjects || []).length === 0 && (
                                <p className="px-2.5 py-1.5 text-xs mix-text-muted-foreground/80 italic">
                                  No existing projects yet.
                                </p>
                              )}
                              <div className="mt-1 pt-1 border-t mix-border-border/60">
                                <button
                                  role="menuitem"
                                  disabled={moving}
                                  onClick={() => handleMoveToProject(null)}
                                  className="w-full text-left text-xs px-2.5 py-1.5 rounded-md hover:mix-bg-primary/10 text-primary font-semibold transition-smooth flex items-center gap-2 disabled:opacity-50"
                                >
                                  <Icon name="PlusIcon" size={10} /> New Project from this Task
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </Popover>
                  </div>

                  {/* Delete */}
                  <div>
                    <button
                      ref={deleteBtnRef}
                      onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setShowMoveMenu(false); setShowParetoModal(false); }}
                      className="todo-btn todo-btn-ghost px-2 py-1 hover:text-error"
                      title="Delete task"
                      aria-label="Delete task"
                      aria-haspopup="dialog"
                      aria-expanded={showDeleteConfirm}
                    >
                      <Icon name="TrashIcon" size={12} />
                    </button>
                    <Popover
                      open={showDeleteConfirm}
                      anchorRef={deleteBtnRef}
                      onClose={() => setShowDeleteConfirm(false)}
                      role="alertdialog"
                      label="Confirm delete"
                      className="todo-popover p-3 min-w-[180px]"
                    >
                      <p className="text-xs text-foreground font-medium mb-2">Delete this task{hasChildren ? ' and all subtasks' : ''}?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="todo-focus text-xs px-3 py-1.5 rounded-md bg-error text-error-foreground hover:opacity-90 transition-smooth font-medium disabled:opacity-60"
                        >
                          Delete
                        </button>
                        <button
                          data-autofocus
                          onClick={() => setShowDeleteConfirm(false)}
                          className="todo-focus text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-smooth"
                        >
                          Cancel
                        </button>
                      </div>
                    </Popover>
                  </div>
                </div>

                {/* Context display */}
                {showContext && task.context && (
                  <div className="rounded-lg p-3 mix-bg-foreground/[0.05]">
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {task.context}
                    </p>
                  </div>
                )}

                {/* Recurrence — compact inline control (intention/DoD editing lives in the Details modal) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer font-medium [@media(pointer:coarse)]:min-h-10">
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
                    <Icon name="ArrowPathIcon" size={11} /> Recurring
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
                        className="bg-input border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus-ring font-semibold"
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
                          className="bg-input border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus-ring w-[6rem] placeholder:mix-text-muted-foreground/60"
                        />
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Notes display */}
                {showNotes && (
                  <div className="space-y-3 rounded-lg p-3 mix-bg-foreground/[0.05]">
                    {/* AI Action Buttons */}
                    <div className="flex items-center gap-1 flex-wrap border-b mix-border-foreground/10 pb-2">
                      <span className="mr-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">AI Journal</span>
                      <button
                        type="button"
                        onClick={handleExplainTask}
                        disabled={aiActionLoading !== null}
                        className="todo-btn todo-btn-ghost px-2 py-1 disabled:opacity-50"
                      >
                        {aiActionLoading === 'explain' ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <Icon name="SparklesIcon" size={11} />} Explain Task
                      </button>
                      <button
                        type="button"
                        onClick={handleSummarizeNotes}
                        disabled={aiActionLoading !== null || notes.length === 0}
                        className="todo-btn todo-btn-ghost px-2 py-1 disabled:opacity-50"
                      >
                        {aiActionLoading === 'summarize' ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <Icon name="ClipboardDocumentListIcon" size={11} />} Summarize Journal
                      </button>
                    </div>

                    {/* AI Summary display (dismissable) */}
                    {summary && (
                      <div className="p-2.5 rounded-md mix-bg-foreground/[0.05] text-xs text-foreground relative">
                        <button
                          type="button"
                          onClick={() => setSummary(null)}
                          className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
                          aria-label="Dismiss summary"
                        >
                          <Icon name="XMarkIcon" size={12} />
                        </button>
                        <p className="font-semibold text-foreground mb-1">Journal Summary</p>
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
                        className="flex-1 bg-input border border-border rounded-md px-2.5 py-1.5 text-xs focus-ring placeholder:text-muted-foreground"
                      />
                      <button
                        type="submit"
                        className="todo-btn todo-btn-primary px-3 py-1.5"
                      >
                        Add Note
                      </button>
                    </form>

                    {/* Notes list (timeline) */}
                    <div className="max-h-[220px] overflow-y-auto scrollbar-clean pr-1">
                      {notes.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">No notes logged yet.</p>
                      ) : (
                        notes.map(note => (
                          <div key={note.id} className="flex flex-col gap-1 border-t py-2 first:border-t-0 mix-border-foreground/[0.08]">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-semibold capitalize text-foreground">
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
                                className="text-xs text-primary hover:underline font-semibold mt-1 self-start flex items-center gap-0.5 disabled:opacity-50"
                              >
                                {aiActionLoading === `expand-${note.id}` ? 'Expanding...' : <><Icon name="ArrowsPointingOutIcon" size={10} /> Expand decision</>}
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
        </div>

        {/* Task Detail & Pareto modals — rendered unconditionally so opening them (e.g. via the
            title click) doesn't require the collapsed details panel to be expanded first */}
        <TaskDetailModal
          taskId={task.id}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onUpdate={(updates) => onUpdate(task.id, updates || {})}
          onSubtaskCreated={(child) => {
            onChildAdded?.(task.id, child);
            setChildrenExpanded(true);
          }}
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
      </div>

      {/* Children (recursive) */}
      {childrenExpanded && hasChildren && !flat && (
        <div className="relative">
          {/* This parent's colour, dimmed, running down beside its children (gone with them when collapsed) */}
          <span className="todo-branch" aria-hidden="true" style={{ '--rail': depthColor } as React.CSSProperties} />
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
              onChildAdded={onChildAdded}
              searchQuery={searchQuery}
              onResumeTask={onResumeTask}
            />
          ))}
        </div>
      )}

      {/* Loading skeleton for AI generation */}
      {loading && loading !== 'regen' && (
        <div className="ml-[1.5rem] space-y-2 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-xl mix-bg-foreground/[0.06] motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}
    </div>
  );
}
