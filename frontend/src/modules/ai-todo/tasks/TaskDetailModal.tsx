'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { SaveIndicator, useSaveStatus } from '../shared/useSaveStatus';
import { fieldsServerKept } from '../shared/patchSemantics';
import {
  Task,
  TaskStatus,
  TaskPriority,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  todoService,
  withPeriod,
} from '@/lib/services/todoService';

interface TaskDetailModalProps {
  taskId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updates?: Record<string, any>) => void;
  /** A subtask was created from inside the dialog — the owner adds it to its task tree. */
  onSubtaskCreated?: (child: Task) => void;
  model?: 'ollama' | 'gemini';
}

type TextField = 'context' | 'intention' | 'definition_of_done' | 'time_estimate';

export default function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
  onUpdate,
  onSubtaskCreated,
  model = 'gemini',
}: TaskDetailModalProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [intention, setIntention] = useState('');
  const [dod, setDod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [timeEstimate, setTimeEstimate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [priority, setPriority] = useState<TaskPriority>('p3');

  // Autosave state (Saving… / Saved / Couldn't save · Retry).
  const saveStatus = useSaveStatus();
  // What the server last confirmed, and what is currently on its way — so blur / close only save
  // what actually changed (no empty PATCH when you just tab through, no duplicate on close).
  const savedRef = useRef<Task | null>(null);
  const sentRef = useRef<Record<string, unknown>>({});
  // True while a close is waiting on a save that hasn't answered yet (see handleClose).
  const closingRef = useRef(false);

  // Notes state
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Subtask addition state
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const loadTaskData = async (id: number) => {
    setLoading(true);
    const data = await todoService.fetchTask(id);
    if (data) {
      savedRef.current = data;
      sentRef.current = {};
      setTask(data);
      setTitle(data.title);
      setContext(data.context || '');
      setIntention(data.intention || '');
      setDod(data.definition_of_done || '');
      setDueDate(data.due_date || '');
      setTimeEstimate(data.time_estimate || '');
      setStatus(data.status);
      setPriority(data.priority);
    }
    const noteList = await todoService.fetchNotes(id);
    setNotes(noteList);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen && taskId) {
      saveStatus.reset();
      closingRef.current = false;
      setSubtaskError(null);
      loadTaskData(taskId);
    }
    // Only when the dialog opens (or switches task): `saveStatus` is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, taskId]);

  if (!isOpen || !taskId) return null;

  /** Saves one or more fields. `updateTask` already toasts the reason when it fails. */
  const saveField = (key: string, updates: Record<string, any>, options?: { retryable?: boolean }) => {
    Object.assign(sentRef.current, updates);
    return saveStatus.run(key, async () => {
      const updated = await todoService.updateTask(taskId, updates as any);
      if (!updated) {
        // Not saved: forget that it was "sent" so the next blur / close / Retry tries again.
        Object.keys(updates).forEach((field) => delete sentRef.current[field]);
        return false;
      }
      const kept = fieldsServerKept(updates, updated);
      if (kept.length > 0) {
        Object.keys(updates).forEach((field) => delete sentRef.current[field]);
        toast.error(`Couldn't clear the ${kept.join(', ')} — the server keeps the old value when a field is emptied.`);
        return false;
      }
      const merged = { ...(savedRef.current as Task), ...updated, children: savedRef.current?.children ?? [] };
      savedRef.current = merged;
      // Subtasks are managed locally in this dialog; a PATCH response may not carry them.
      setTask((prev) => (prev ? { ...prev, ...updated, children: prev.children } : merged));
      onUpdate?.(updates);
      return true;
    }, options);
  };

  const current = (field: string, saved: unknown) => (field in sentRef.current ? sentRef.current[field] : saved);

  const saveTitle = () => {
    const next = title.trim();
    const saved = savedRef.current?.title ?? '';
    if (!next) {
      setTitle(saved); // never save a blank title
      return;
    }
    if (next === current('title', saved)) return;
    void saveField('title', { title: next });
  };

  const saveText = (field: TextField, value: string) => {
    // '' (not null) clears a text field: the backend ignores null in a PATCH.
    const next = value.trim();
    const saved = ((savedRef.current?.[field] as string | null | undefined) ?? '').trim();
    if (next === current(field, saved)) return;
    void saveField(field, { [field]: next });
  };

  const onStatusChange = async (value: TaskStatus) => {
    setStatus(value);
    const ok = await saveField('status', { status: value }, { retryable: false });
    if (!ok && savedRef.current) setStatus(savedRef.current.status); // put the old value back
  };

  const onPriorityChange = async (value: TaskPriority) => {
    setPriority(value);
    const ok = await saveField('priority', { priority: value }, { retryable: false });
    if (!ok && savedRef.current) setPriority(savedRef.current.priority);
  };

  const onDueDateChange = async (value: string) => {
    setDueDate(value);
    const ok = await saveField('due_date', { due_date: value || null }, { retryable: false });
    if (!ok && savedRef.current) setDueDate(savedRef.current.due_date || '');
  };

  // Text fields autosave on blur, but Esc / a backdrop click close the dialog without a blur —
  // so save anything still unsaved first, and only close once that worked. If a save fails the
  // dialog stays open (the toast + "Couldn't save · Retry" say why) so nothing typed is lost; closing
  // again after that discards it, so a server that keeps failing can never trap you here.
  const handleClose = async () => {
    // Closing again — after a failed save, or while a close is still waiting on a slow one — closes
    // for good: the user has been told, and a hanging request mustn't trap them in the dialog.
    if (closingRef.current || saveStatus.hasFailures()) {
      closingRef.current = false;
      onClose();
      return;
    }
    closingRef.current = true;
    if (task) {
      saveTitle();
      saveText('context', context);
      saveText('intention', intention);
      saveText('definition_of_done', dod);
      saveText('time_estimate', timeEstimate);
    }
    const allSaved = await saveStatus.settled();
    if (!closingRef.current) return; // a second close already closed it
    closingRef.current = false;
    if (allSaved) onClose();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || addingNote) return;
    setAddingNote(true);
    const created = await todoService.createNote(taskId, newNoteContent.trim());
    if (created) {
      setNotes((prev) => [...prev, created]);
      setNewNoteContent('');
    }
    setAddingNote(false);
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = subtaskTitle.trim();
    if (!text || addingSubtask) return;
    setAddingSubtask(true);
    setSubtaskError(null);
    try {
      const created = await todoService.createTaskStrict({ title: text, parent_id: taskId, priority: 'p3' });
      const child: Task = { ...created, children: [] };
      setSubtaskTitle('');
      // Update this dialog and the tree behind it in place: no reload, so the input keeps focus
      // and you can type the next subtask straight away.
      setTask((prev) => (prev ? { ...prev, children: [...(prev.children || []), child] } : prev));
      onSubtaskCreated?.(child);
    } catch (err) {
      setSubtaskError(withPeriod(err instanceof Error ? err.message : "Couldn't add the subtask"));
    } finally {
      setAddingSubtask(false);
      subtaskInputRef.current?.focus();
    }
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      label="Task details"
      // An unsent note or subtask title shouldn't vanish because of a stray click outside.
      closeOnBackdrop={!newNoteContent.trim() && !subtaskTitle.trim()}
      overlayClassName="flex items-center justify-center p-3 sm:p-[1.5rem]"
      className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-foreground"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b mix-border-border/80 mix-bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
            Task #{taskId}
          </span>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            aria-label="Task title"
            className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-smooth truncate w-full"
          />
        </div>

        <div className="ml-3 flex shrink-0 items-center gap-2">
          <SaveIndicator state={saveStatus.state} canRetry={saveStatus.canRetry} onRetry={saveStatus.retry} />
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close task details"
            className="todo-focus p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {loading ? (
        <div className="p-[3rem] flex flex-col items-center justify-center text-muted-foreground space-y-3">
          <span className="w-[1.5rem] h-[1.5rem] border-2 mix-border-primary/20 border-t-primary rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading task details...</span>
        </div>
      ) : !task ? (
        <div className="p-[3rem] text-center text-muted-foreground">Task not found.</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-[1.5rem] scrollbar-clean">
          {/* Status & Priority Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mix-bg-muted/20 p-3 rounded-xl border mix-border-border/60">
            {/* Status */}
            <div>
              <label htmlFor="task-detail-status" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Status
              </label>
              <select
                id="task-detail-status"
                value={status}
                onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
                className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="task-detail-priority" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Priority
              </label>
              <select
                id="task-detail-priority"
                value={priority}
                onChange={(e) => onPriorityChange(e.target.value as TaskPriority)}
                className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="task-detail-due" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Due Date
              </label>
              <input
                id="task-detail-due"
                type="date"
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Time Estimate */}
            <div>
              <label htmlFor="task-detail-estimate" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Time Estimate
              </label>
              <input
                id="task-detail-estimate"
                type="text"
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                onBlur={() => saveText('time_estimate', timeEstimate)}
                placeholder="e.g. 30m, 1h"
                className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Context & Description */}
          <div className="space-y-1.5">
            <label htmlFor="task-detail-context" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon name="DocumentTextIcon" size={14} className="text-primary" />
              Context & Description
            </label>
            <textarea
              id="task-detail-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={() => saveText('context', context)}
              placeholder="Attach background details, notes, links, or instructions for this task..."
              rows={3}
              className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground leading-relaxed"
            />
          </div>

          {/* Intention & Definition of Done */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="task-detail-intention" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <FlatIcon name="idea" size={16} /><span>Intention</span>
              </label>
              <textarea
                id="task-detail-intention"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                onBlur={() => saveText('intention', intention)}
                placeholder="Why are you doing this task?..."
                rows={2}
                className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-detail-dod" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <FlatIcon name="done" size={16} /><span>Definition of Done</span>
              </label>
              <textarea
                id="task-detail-dod"
                value={dod}
                onChange={(e) => setDod(e.target.value)}
                onBlur={() => saveText('definition_of_done', dod)}
                placeholder="Clear criteria when this task is complete..."
                rows={2}
                className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Subtasks Section */}
          <div className="space-y-3 pt-2 border-t mix-border-border/60">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon name="FolderIcon" size={14} className="text-primary" />
              Subtasks ({task.children?.length || 0})
            </h3>

            <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
              <input
                ref={subtaskInputRef}
                type="text"
                value={subtaskTitle}
                onChange={(e) => {
                  setSubtaskTitle(e.target.value);
                  if (subtaskError) setSubtaskError(null);
                }}
                aria-label="New subtask title"
                aria-invalid={subtaskError ? true : undefined}
                placeholder="Add a subtask..."
                className="flex-1 bg-input border mix-border-border/80 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!subtaskTitle.trim() || addingSubtask}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:mix-bg-primary/90 transition-smooth disabled:opacity-50 shrink-0"
              >
                {addingSubtask ? '...' : '+ Add Subtask'}
              </button>
            </form>
            {subtaskError && (
              <p role="alert" className="text-xs text-error">
                {subtaskError} Your text is still in the box, so you can try again.
              </p>
            )}

            {task.children && task.children.length > 0 && (
              <div className="space-y-1.5 max-h-[12rem] overflow-y-auto pr-1">
                {task.children.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between mix-bg-muted/30 border mix-border-border/50 rounded-lg p-2 text-xs"
                  >
                    <span className={sub.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}>
                      {sub.title}
                    </span>
                    <span className="text-[11px] uppercase font-bold text-muted-foreground">
                      {sub.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes / Journal Section */}
          <div className="space-y-3 pt-2 border-t mix-border-border/60">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FlatIcon name="notes" size={16} /> Notes & Journal ({notes.length})
            </h3>

            <form onSubmit={handleAddNote} className="flex flex-col gap-2">
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                aria-label="New note"
                placeholder="Add a progress note or journal entry..."
                rows={2}
                className="w-full bg-input border mix-border-border/80 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!newNoteContent.trim() || addingNote}
                className="self-end px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:mix-bg-primary/90 transition-smooth disabled:opacity-50"
              >
                {addingNote ? 'Saving...' : 'Add Note'}
              </button>
            </form>

            {notes.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <div key={n.id} className="mix-bg-muted/40 border mix-border-border/60 rounded-xl p-2.5 text-xs">
                    <div className="text-xs text-muted-foreground mb-1 tabular-nums">
                      {n.created_at}
                    </div>
                    <div className="text-foreground whitespace-pre-wrap leading-relaxed">{n.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
