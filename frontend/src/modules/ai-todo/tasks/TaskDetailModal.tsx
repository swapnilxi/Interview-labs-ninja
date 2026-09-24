'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  Task,
  TaskStatus,
  TaskPriority,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  todoService,
} from '@/lib/services/todoService';

interface TaskDetailModalProps {
  taskId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updates?: Record<string, any>) => void;
  model?: 'ollama' | 'gemini';
}

export default function TaskDetailModal({
  taskId,
  isOpen,
  onClose,
  onUpdate,
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
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Subtask addition state
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  const loadTaskData = async (id: number) => {
    setLoading(true);
    const data = await todoService.fetchTask(id);
    if (data) {
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
      loadTaskData(taskId);
    }
  }, [isOpen, taskId]);

  if (!isOpen || !taskId) return null;

  const handleSaveField = async (updates: Record<string, any>) => {
    setSaving(true);
    const updated = await todoService.updateTask(taskId, updates as any);
    if (updated) {
      setTask(updated);
      onUpdate?.(updates);
    }
    setSaving(false);
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
    if (!subtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true);
    const created = await todoService.createTask({
      title: subtaskTitle.trim(),
      parent_id: taskId,
      priority: 'p3',
    });
    if (created) {
      setSubtaskTitle('');
      await loadTaskData(taskId);
      onUpdate?.();
    }
    setAddingSubtask(false);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-foreground animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
              Task #{taskId}
            </span>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleSaveField({ title })}
              className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-smooth truncate w-full"
            />
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-smooth shrink-0 ml-3"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading task details...</span>
          </div>
        ) : !task ? (
          <div className="p-12 text-center text-muted-foreground">Task not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-clean">
            {/* Status & Priority Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-muted/20 p-3 rounded-xl border border-border/60">
              {/* Status */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    const val = e.target.value as TaskStatus;
                    setStatus(val);
                    handleSaveField({ status: val });
                  }}
                  className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => {
                    const val = e.target.value as TaskPriority;
                    setPriority(val);
                    handleSaveField({ priority: val });
                  }}
                  className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    handleSaveField({ due_date: e.target.value || null });
                  }}
                  className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
                />
              </div>

              {/* Time Estimate */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Time Estimate
                </label>
                <input
                  type="text"
                  value={timeEstimate}
                  onChange={(e) => setTimeEstimate(e.target.value)}
                  onBlur={() => handleSaveField({ time_estimate: timeEstimate || null })}
                  placeholder="e.g. 30m, 1h"
                  className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
                />
              </div>
            </div>

            {/* Context & Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Icon name="DocumentTextIcon" size={14} className="text-primary" />
                  Context & Description
                </label>
                {saving && <span className="text-[10px] text-muted-foreground italic">Saving...</span>}
              </div>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                onBlur={() => handleSaveField({ context: context.trim() || null })}
                placeholder="Attach background details, notes, links, or instructions for this task..."
                rows={3}
                className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 leading-relaxed"
              />
            </div>

            {/* Intention & Definition of Done */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>💡 Intention</span>
                </label>
                <textarea
                  value={intention}
                  onChange={(e) => setIntention(e.target.value)}
                  onBlur={() => handleSaveField({ intention: intention.trim() || null })}
                  placeholder="Why are you doing this task?..."
                  rows={2}
                  className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>🎯 Definition of Done</span>
                </label>
                <textarea
                  value={dod}
                  onChange={(e) => setDod(e.target.value)}
                  onBlur={() => handleSaveField({ definition_of_done: dod.trim() || null })}
                  placeholder="Clear criteria when this task is complete..."
                  rows={2}
                  className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* Subtasks Section */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Icon name="FolderIcon" size={14} className="text-primary" />
                Subtasks ({task.children?.length || 0})
              </h3>

              <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
                <input
                  type="text"
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="Add a subtask..."
                  className="flex-1 bg-input border border-border/80 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  disabled={!subtaskTitle.trim() || addingSubtask}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth disabled:opacity-50 shrink-0"
                >
                  {addingSubtask ? '...' : '+ Add Subtask'}
                </button>
              </form>

              {task.children && task.children.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {task.children.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-lg p-2 text-xs"
                    >
                      <span className={sub.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}>
                        {sub.title}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {sub.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes / Journal Section */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>📝</span> Notes & Journal ({notes.length})
              </h3>

              <form onSubmit={handleAddNote} className="flex flex-col gap-2">
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Add a progress note or journal entry..."
                  rows={2}
                  className="w-full bg-input border border-border/80 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  disabled={!newNoteContent.trim() || addingNote}
                  className="self-end px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth disabled:opacity-50"
                >
                  {addingNote ? 'Saving...' : 'Add Note'}
                </button>
              </form>

              {notes.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {notes.map((n) => (
                    <div key={n.id} className="bg-muted/40 border border-border/60 rounded-xl p-2.5 text-xs">
                      <div className="text-[10px] text-muted-foreground mb-1 font-mono">
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
      </div>
    </div>
  );
}
