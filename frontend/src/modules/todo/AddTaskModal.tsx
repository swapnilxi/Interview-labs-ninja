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

  const [intention, setIntention] = useState('');
  const [definitionOfDone, setDefinitionOfDone] = useState('');
  const [showIntentionFields, setShowIntentionFields] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState('daily');
  const [recurrenceCustomDays, setRecurrenceCustomDays] = useState('');

  const handleSuggestIntention = async () => {
    if (!title.trim()) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const suggestions = await todoService.suggestIntentionGeneral(title.trim(), context.trim() || null, 'gemini');
      if (suggestions) {
        setIntention(suggestions.intention || '');
        setDefinitionOfDone(suggestions.definition_of_done || '');
        setShowIntentionFields(true);
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Failed to suggest intention.');
    } finally {
      setSuggesting(false);
    }
  };

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
      intention: intention.trim() || null,
      definition_of_done: definitionOfDone.trim() || null,
      is_recurring: isRecurring ? 1 : 0,
      recurrence_interval: isRecurring ? recurrenceInterval : null,
      recurrence_custom_days: isRecurring && recurrenceInterval === 'custom_days' ? recurrenceCustomDays.trim() || null : null,
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

          {/* Collapsible Intention & Definition of Done */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowIntentionFields(!showIntentionFields)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Icon name={showIntentionFields ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={14} />
              🎯 Intention & Definition of Done (Optional)
            </button>

            {showIntentionFields && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border animate-fade-in">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-muted-foreground">🎯 Why does this matter? (Intention)</label>
                    <button
                      type="button"
                      onClick={handleSuggestIntention}
                      disabled={suggesting || !title.trim()}
                      className="text-[10px] text-primary hover:underline font-semibold disabled:opacity-50"
                    >
                      {suggesting ? 'Suggesting...' : '✨ Suggest'}
                    </button>
                  </div>
                  {suggestError && (
                    <p className="text-[10px] text-red-500 mb-1.5">{suggestError}</p>
                  )}
                  <input
                    type="text"
                    value={intention}
                    onChange={e => setIntention(e.target.value)}
                    placeholder="e.g. To clear technical debt and speed up queries"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">✅ What does done look like? (Definition of Done)</label>
                  <input
                    type="text"
                    value={definitionOfDone}
                    onChange={e => setDefinitionOfDone(e.target.value)}
                    placeholder="e.g. Unit tests passing, code merged, index created"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recurring Task toggle (Feature 4) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-ring cursor-pointer"
              />
              <span>🔁 Make this task recurring</span>
            </label>

            {isRecurring && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border animate-fade-in">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Recurrence Interval</label>
                  <select
                    value={recurrenceInterval}
                    onChange={e => setRecurrenceInterval(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring"
                  >
                    <option value="daily">Daily (Every day)</option>
                    <option value="weekly">Weekly (Every week)</option>
                    <option value="custom_days">Custom Days</option>
                  </select>
                </div>

                {recurrenceInterval === 'custom_days' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Custom Days (comma-separated)</label>
                    <input
                      type="text"
                      value={recurrenceCustomDays}
                      onChange={e => setRecurrenceCustomDays(e.target.value)}
                      placeholder="e.g. mon,wed,fri"
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
                    />
                  </div>
                )}
              </div>
            )}
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
