'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type Task,
  type TaskPriority,
  PRIORITY_CONFIG,
  todoService,
} from '@/lib/services/todoService';

interface AddTaskModalProps {
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export default function AddTaskModal({ onClose, onCreated }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('p3');
  const [timeEstimate, setTimeEstimate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [context, setContext] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext || '')) {
      alert('Only .txt, .pdf, .docx files are supported');
      return;
    }

    setUploading(true);
    const result = await todoService.uploadContext(file);
    if (result) {
      setAttachments(prev => [...prev, result.filename]);
      setContext(prev => prev ? `${prev}\n\n--- ${result.filename} ---\n${result.extracted_text}` : result.extracted_text);
    }
    setUploading(false);
    e.target.value = '';
  };

  const removeAttachment = (filename: string) => {
    setAttachments(prev => prev.filter(a => a !== filename));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const task = await todoService.createTask({
      title: title.trim(),
      priority,
      time_estimate: timeEstimate.trim() || null,
      due_date: dueDate || null,
      context: context.trim() || null,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setSaving(false);

    if (task) {
      onCreated(task);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading text-base font-semibold text-foreground">Add New Task</h3>
          <button onClick={onClose} className="theme-toggle w-8 h-8">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Task Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Priority + Time + Due date row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring"
              >
                {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, any][]).map(([key, conf]) => (
                  <option key={key} value={key}>{conf.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Time Estimate</label>
              <input
                type="text"
                value={timeEstimate}
                onChange={e => setTimeEstimate(e.target.value)}
                placeholder="e.g. 2 hrs"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring"
              />
            </div>
          </div>

          {/* Context textarea */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Add Context <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Add notes, requirements, or paste relevant information. AI will use this to generate better subtasks."
              rows={3}
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus-ring placeholder:text-muted-foreground resize-none"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Attach Files <span className="text-muted-foreground/60">(.txt, .pdf, .docx)</span>
            </label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-smooth">
              <Icon name="PaperClipIcon" size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {uploading ? 'Extracting text...' : 'Choose file'}
              </span>
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              {uploading && <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
            </label>

            {/* Attached file chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
                    <Icon name="DocumentIcon" size={12} className="text-muted-foreground" />
                    {name}
                    <button onClick={() => removeAttachment(name)} className="text-muted-foreground hover:text-red-500 transition-smooth">
                      <Icon name="XMarkIcon" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-smooth"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-smooth disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Icon name="PlusIcon" size={14} variant="solid" />
              )}
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
