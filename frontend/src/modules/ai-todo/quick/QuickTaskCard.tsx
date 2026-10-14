'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import FlatIcon from '@/components/ui/FlatIcon';
import type { DragHandleProps } from '@/components/ui/EisenhowerMatrix';
import { QuickTask, quickTaskService } from '@/lib/services/quickTaskService';
import { UNSORTED, type QuickQuadrant } from '@/lib/services/quickQuadrants';
import { triggerConfetti } from '@/lib/services/todoService';
import { notifyTopTaskCompleted } from '@/lib/services/paretoService';

import ParetoModal from '@/components/ui/ParetoModal';
import QuickTaskDetailModal from './QuickTaskDetailModal';
import { QUADRANT_META, QUADRANT_ORDER } from './quadrantMeta';

interface QuickTaskCardProps {
  task: QuickTask;
  model: 'ollama' | 'gemini';
  onUpdate: (taskId: number, updates: Partial<QuickTask>) => void;
  onDelete: (taskId: number) => void;
  onMoveToSmart?: (taskId: number) => void;
  onMoveToPlan?: (taskId: number) => void;
  hideDragHandle?: boolean;
  /** Spread on the grip when the list layout drags by grip only (see EisenhowerMatrix `stack`). */
  dragHandle?: DragHandleProps;
  /** Pick a quadrant from a menu — the way to sort without dragging (phones, keyboards). */
  onQuadrantChange?: (taskId: number, quadrant: QuickQuadrant) => void;
  /** Show the quadrant chip. */
  showQuadrantChip?: boolean;
}

export default function QuickTaskCard({
  task,
  model,
  onUpdate,
  onDelete,
  onMoveToSmart,
  onMoveToPlan,
  hideDragHandle,
  dragHandle,
  onQuadrantChange,
  showQuadrantChip,
}: QuickTaskCardProps) {
  const [showParetoModal, setShowParetoModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showQuadrantMenu, setShowQuadrantMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [showDetailModal, setShowDetailModal] = useState(false);
  // Triggers the menus anchor to (they render through a portal; see components/ui/Popover.tsx)
  const moveBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const quadrantBtnRef = useRef<HTMLButtonElement>(null);

  const quadrant: QuickQuadrant = task.quadrant ?? UNSORTED;
  const quadrantMeta = QUADRANT_META[quadrant] ?? QUADRANT_META[UNSORTED];
  const isUnsorted = quadrant === UNSORTED;

  const handleCheckbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDone = !task.done;
    const { clientX, clientY } = e;
    const updated = await quickTaskService.updateTask(task.id, { done: newDone });
    // Not saved: the service already toasted why, and a failed save gets no celebration.
    if (!updated) return;
    if (newDone) {
      triggerConfetti(clientX, clientY);
      if (task.is_top_20) notifyTopTaskCompleted(task.title);
    }
    onUpdate(task.id, { done: newDone });
  };

  const [editingField, setEditingField] = useState<'time_estimate' | 'due_date' | null>(null);
  const [fieldValue, setFieldValue] = useState<string>('');

  const handleSaveField = async (field: 'time_estimate' | 'due_date') => {
    setEditingField(null);
    const val = fieldValue.trim() || null;
    const previous = task[field] ?? null;
    if (val === previous) return;
    onUpdate(task.id, { [field]: val }); // optimistic
    const updated = await quickTaskService.updateTask(task.id, { [field]: val });
    // Not saved (the service already toasted why): put the old value back instead of showing a lie.
    if (!updated) onUpdate(task.id, { [field]: previous });
  };

  const handleSaveTitle = async () => {
    if (editValue.trim() && editValue !== task.title) {
      const updated = await quickTaskService.updateTask(task.id, { title: editValue.trim() });
      if (updated) onUpdate(task.id, { title: editValue.trim() });
    } else {
      setEditValue(task.title);
    }
    setEditingTitle(false);
  };

  const handleDelete = async () => {
    if (deleting) return; // a double-click must not send two DELETEs
    setDeleting(true);
    const success = await quickTaskService.deleteTask(task.id);
    if (success) onDelete(task.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  // 80/20 styling
  let paretoClasses = '';
  if (task.is_top_20) {
    paretoClasses = 'ring-1 ring-amber-400/50 shadow-sm';
  } else if (task.pareto_score !== undefined && task.pareto_score !== null) {
    if (task.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (task.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  // Chips for the values a task has. The row only exists when there is something to show (or an editor is
  // open) — never because the pointer is over the card: a row that appears on hover pushes every card
  // below it down as the pointer passes, which moves the drag grip out from under the pointer.
  const hasMeta = !!(task.time_estimate || task.due_date || task.context);
  const metaRowVisible = hasMeta || editingField !== null;
  const iconButton = 'todo-focus flex h-8 w-8 items-center justify-center rounded-lg transition-smooth';
  // "Add time" / "add date" fade in on hover or focus (and are always shown on touch screens). Opacity, not
  // display: they reserve their space, so nothing shifts.
  const revealOnHover = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

  return (
    <div className={`todo-lit relative bg-card border mix-border-border/60 rounded-xl p-3.5 group ${paretoClasses} ${task.done ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {/* Grip: drags the card (list layout) — or just a hint that the whole card drags (matrix) */}
        {dragHandle ? (
          <button
            type="button"
            {...dragHandle}
            aria-label={`Drag "${task.title}" to reorder or move to another quadrant`}
            title="Drag to reorder or move"
            className="todo-focus -ml-1.5 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <Icon name="Bars3Icon" size={18} />
          </button>
        ) : (
          !hideDragHandle && (
            <div className="mt-1 flex-shrink-0 cursor-grab mix-text-muted-foreground/30 transition-smooth hover:text-muted-foreground">
              <Icon name="Bars3Icon" size={16} />
            </div>
          )
        )}

        {/* Checkbox — a 32px target around the 20px box */}
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
          onClick={handleCheckbox}
          className="todo-focus -ml-1 -mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-smooth hover:scale-110"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-smooth ${
              task.done ? 'border-emerald-500 bg-emerald-500' : 'mix-border-muted-foreground/50 hover:border-primary'
            }`}
          >
            {task.done && <Icon name="CheckIcon" size={12} className="text-white" variant="solid" />}
          </span>
        </button>

        {/* Title + meta */}
        <div className="min-w-[8rem] flex-1 basis-[10rem]">
          <div className="flex items-start gap-2">
            {/* Top 20 Badge — pin icon distinguishes a manual override from an AI-assigned one */}
            {task.is_top_20 && (
              <span
                className="mt-0.5 flex flex-shrink-0 items-center gap-0.5 rounded-md border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 text-xs font-bold text-amber-600 shadow-sm dark:text-amber-400"
                title={task.pareto_locked ? 'Manually pinned as Top 20%' : 'AI-assigned Top 20%'}
              >
                <FlatIcon name={task.pareto_locked ? 'pin' : 'star'} size={14} /> 20%
              </span>
            )}

            {editingTitle ? (
              <input
                className="focus-ring min-w-0 flex-1 rounded-md border border-border bg-input px-2 py-1 text-sm font-medium"
                value={editValue}
                aria-label="Task title"
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                autoFocus
              />
            ) : (
              <button
                className={`min-w-0 flex-1 cursor-pointer text-left text-sm font-medium leading-snug transition-smooth hover:text-primary ${task.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                onClick={() => setShowDetailModal(true)}
                onDoubleClick={() => setEditingTitle(true)}
                title="Click to open details, context & due date"
              >
                {task.title}
              </button>
            )}

            {/* Source Badge */}
            {task.source !== 'manual' && (
              <span className="mt-0.5 flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
                {task.source.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Time / due date / context. */}
          <div className={`mt-1.5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground ${metaRowVisible ? 'flex' : 'hidden'}`}>
            {/* Time Estimate */}
            {editingField === 'time_estimate' ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={fieldValue}
                  onChange={e => setFieldValue(e.target.value)}
                  placeholder="30m, 1h..."
                  aria-label="Time estimate"
                  className="w-20 rounded-md border border-border bg-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveField('time_estimate');
                    if (e.key === 'Escape') setEditingField(null);
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleSaveField('time_estimate')}
                  className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingField('time_estimate');
                  setFieldValue(task.time_estimate || '');
                }}
                className={`items-center gap-1 rounded-md px-2 py-1 transition-smooth hover:bg-muted ${
                  task.time_estimate
                    ? 'inline-flex bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-300'
                    : 'hidden'
                }`}
                title="Click to set time estimate"
              >
                <Icon name="ClockIcon" size={13} />
                <span>{task.time_estimate || '+ Time'}</span>
              </button>
            )}

            {/* Due Date */}
            {editingField === 'due_date' ? (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={fieldValue}
                  onChange={e => setFieldValue(e.target.value)}
                  aria-label="Due date"
                  className="rounded-md border border-border bg-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  onBlur={() => handleSaveField('due_date')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveField('due_date');
                    if (e.key === 'Escape') setEditingField(null);
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingField('due_date');
                  setFieldValue(task.due_date || '');
                }}
                className={`items-center gap-1 rounded-md px-2 py-1 transition-smooth hover:bg-muted ${
                  task.due_date
                    ? 'inline-flex bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-300'
                    : 'hidden'
                }`}
                title="Click to set due date"
              >
                <Icon name="CalendarIcon" size={13} />
                <span>{task.due_date || '+ Due Date'}</span>
              </button>
            )}

            {/* Context indicator */}
            {task.context && (
              <button
                onClick={() => setShowDetailModal(true)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                title="Has context / details"
              >
                <Icon name="PaperClipIcon" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Quadrant chip + actions. They wrap among themselves when the card is narrow (six 40px touch targets
            are wider than a phone) instead of spilling out of it. */}
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
          {showQuadrantChip && onQuadrantChange && (
            <div>
              <button
                ref={quadrantBtnRef}
                type="button"
                onClick={() => { setShowQuadrantMenu(!showQuadrantMenu); setShowMoveMenu(false); setShowDeleteConfirm(false); }}
                className={`todo-focus inline-flex h-8 min-w-[7.5rem] items-center justify-between gap-1.5 rounded-full border px-3 text-xs font-semibold transition-smooth ${
                  isUnsorted
                    ? 'border-amber-400 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
                aria-haspopup="menu"
                aria-expanded={showQuadrantMenu}
                aria-label={`Quadrant: ${quadrantMeta.label}. Choose another`}
                title={isUnsorted ? 'Sort this task into a quadrant' : `${quadrantMeta.label} — click to change`}
              >
                <span className={`h-2 w-2 rounded-full ${quadrantMeta.dot}`} aria-hidden="true" />
                {isUnsorted ? 'Sort' : quadrantMeta.label}
                <Icon name="ChevronDownIcon" size={12} />
              </button>
              <Popover
                open={showQuadrantMenu}
                anchorRef={quadrantBtnRef}
                onClose={() => setShowQuadrantMenu(false)}
                label="Choose a quadrant"
                className="todo-popover p-1 min-w-[220px]"
              >
                {QUADRANT_ORDER.map((q) => {
                  const meta = QUADRANT_META[q];
                  const current = q === quadrant;
                  return (
                    <button
                      key={q}
                      role="menuitem"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => {
                        setShowQuadrantMenu(false);
                        if (!current) onQuadrantChange(task.id, q);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                      <span className="flex-1">
                        <span className="block font-medium text-foreground">{meta.label}</span>
                        <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                      </span>
                      {current && <Icon name="CheckIcon" size={14} className="text-primary" />}
                    </button>
                  );
                })}
              </Popover>
            </div>
          )}

          {/* Add a time estimate / due date: fade in on hover, reserve their space (no layout shift) */}
          {!task.time_estimate && editingField !== 'time_estimate' && (
            <button
              type="button"
              onClick={() => { setEditingField('time_estimate'); setFieldValue(''); }}
              className={`${iconButton} ${revealOnHover} text-muted-foreground hover:bg-muted hover:text-foreground`}
              title="Click to set time estimate"
              aria-label="Set time estimate"
            >
              <Icon name="ClockIcon" size={16} />
            </button>
          )}
          {!task.due_date && editingField !== 'due_date' && (
            <button
              type="button"
              onClick={() => { setEditingField('due_date'); setFieldValue(''); }}
              className={`${iconButton} ${revealOnHover} text-muted-foreground hover:bg-muted hover:text-foreground`}
              title="Click to set due date"
              aria-label="Set due date"
            >
              <Icon name="CalendarIcon" size={16} />
            </button>
          )}

          {/* Pareto 80/20 */}
          <button
            onClick={() => setShowParetoModal(true)}
            className={`${iconButton} text-base leading-none ${
              task.is_top_20 ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-muted'
            }`}
            title="80/20 Pareto Analysis"
            aria-label="80/20 Pareto analysis"
          >
            <Icon name="StarIcon" size={18} variant={task.is_top_20 ? 'solid' : 'outline'} />
          </button>

          {/* Move Menu */}
          <div>
            <button
              ref={moveBtnRef}
              onClick={() => { setShowMoveMenu(!showMoveMenu); setShowDeleteConfirm(false); setShowQuadrantMenu(false); }}
              className={`${iconButton} text-muted-foreground hover:mix-bg-primary/10 hover:text-primary`}
              title="Move task"
              aria-label="Move task"
              aria-haspopup="menu"
              aria-expanded={showMoveMenu}
            >
              <Icon name="ArrowRightIcon" size={16} />
            </button>
            <Popover
              open={showMoveMenu}
              anchorRef={moveBtnRef}
              onClose={() => setShowMoveMenu(false)}
              label="Move task"
              className="todo-popover p-1 min-w-[190px]"
            >
              <button
                role="menuitem"
                onClick={() => { setShowMoveMenu(false); onMoveToSmart?.(task.id); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
              >
                <FlatIcon name="brain" size={20} /> Move to Smart To-Do
              </button>
              <button
                role="menuitem"
                onClick={() => { setShowMoveMenu(false); onMoveToPlan?.(task.id); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
              >
                <FlatIcon name="plan" size={20} /> Move to Plan & Project
              </button>
            </Popover>
          </div>

          {/* Delete */}
          <div>
            <button
              ref={deleteBtnRef}
              onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setShowMoveMenu(false); setShowQuadrantMenu(false); }}
              className={`${iconButton} text-muted-foreground hover:bg-red-500/10 hover:text-red-500`}
              title="Delete"
              aria-label="Delete task"
              aria-haspopup="dialog"
              aria-expanded={showDeleteConfirm}
            >
              <Icon name="TrashIcon" size={16} />
            </button>
            <Popover
              open={showDeleteConfirm}
              anchorRef={deleteBtnRef}
              onClose={() => setShowDeleteConfirm(false)}
              role="alertdialog"
              label="Confirm delete"
              className="todo-popover p-3 min-w-[180px]"
            >
              <p className="mb-2.5 text-center text-sm font-medium text-foreground">Delete task?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="todo-focus flex-1 rounded-lg bg-red-500 py-1.5 text-sm font-medium text-white transition-smooth hover:bg-red-600 disabled:opacity-60"
                >
                  Delete
                </button>
                <button
                  data-autofocus
                  onClick={() => setShowDeleteConfirm(false)}
                  className="todo-focus flex-1 rounded-lg border border-border py-1.5 text-sm text-muted-foreground transition-smooth hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </Popover>
          </div>
        </div>
      </div>

      {/* Quick Task Detail Modal */}
      <QuickTaskDetailModal
        task={task}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onUpdate={onUpdate}
      />

      {/* 80/20 Pareto Modal */}
      <ParetoModal
        isOpen={showParetoModal}
        onClose={() => setShowParetoModal(false)}
        title={task.title}
        table="quick_tasks"
        itemId={task.id}
        paretoScore={task.pareto_score}
        isTop20={task.is_top_20}
        paretoLocked={task.pareto_locked}
        reason={task.pareto_reason}
        model={model}
        onUpdate={async (updates) => {
          const updated = await quickTaskService.updateTask(task.id, updates);
          if (updated) onUpdate(task.id, updates);
        }}
      />
    </div>
  );
}
