'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { GoalNode, GoalLevel, GoalStatus, GOAL_LEVELS, goalService } from '@/lib/services/goalService';
import { todoService } from '@/lib/services/todoService';
import { isLoggedIn } from '@/lib/auth/tokenStore';

interface GoalDetailModalProps {
  goal: GoalNode;
  allGoals: GoalNode[];
  onClose: () => void;
  onSaved: () => void;
}

function descendantIds(goalId: number, allGoals: GoalNode[]): Set<number> {
  const ids = new Set<number>();
  const stack = [goalId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const g of allGoals) {
      if (g.parent_id === cur && !ids.has(g.id)) {
        ids.add(g.id);
        stack.push(g.id);
      }
    }
  }
  return ids;
}

export default function GoalDetailModal({ goal, allGoals, onClose, onSaved }: GoalDetailModalProps) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description || '');
  const [level, setLevel] = useState<GoalLevel>(goal.level);
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [priority, setPriority] = useState(goal.priority);
  const [dueDate, setDueDate] = useState(goal.due_date || '');
  const [parentId, setParentId] = useState<number | null>(goal.parent_id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contextTab, setContextTab] = useState<'description' | 'attachments'>('description');
  const [attachments, setAttachments] = useState<string[]>(goal.attachments || []);
  const [uploading, setUploading] = useState(false);

  const levelLabel = (lvl: GoalLevel) => GOAL_LEVELS.find((l) => l.id === lvl)?.label || lvl;

  const excluded = descendantIds(goal.id, allGoals);
  excluded.add(goal.id);
  const parentOptions = allGoals.filter((g) => !excluded.has(g.id));

  // A stray click outside shouldn't throw away edits.
  const dirty =
    title !== goal.title ||
    description !== (goal.description || '') ||
    level !== goal.level ||
    status !== goal.status ||
    priority !== goal.priority ||
    dueDate !== (goal.due_date || '') ||
    parentId !== goal.parent_id ||
    attachments.length !== (goal.attachments || []).length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext || '')) {
      toast.error('Only .txt, .pdf, .docx files are supported.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    const result = await todoService.uploadContext(file);
    if (result) {
      setAttachments((prev) => [...prev, result.filename]);
      setDescription((prev) => (prev ? `${prev}\n\n--- ${result.filename} ---\n${result.extracted_text}` : result.extracted_text));
    }
    setUploading(false);
    e.target.value = '';
  };

  const removeAttachment = (filename: string) => {
    setAttachments((prev) => prev.filter((a) => a !== filename));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      await goalService.updateGoal(goal.id, {
        title: title.trim(),
        description: description.trim() || null,
        level,
        status,
        priority,
        due_date: dueDate || null,
        parent_id: parentId,
        attachments,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="edit-goal-title"
      closeOnEscape={!loading}
      closeOnBackdrop={!loading && !dirty}
      className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md"
    >
      <div className="flex items-center justify-between p-4 border-b mix-border-border/50">
        <h2 id="edit-goal-title" className="font-heading font-semibold text-lg flex items-center gap-2 text-foreground">
          <Icon name="PencilSquareIcon" size={18} className="text-primary" /> Edit Goal
        </h2>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-smooth">
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-clean">
        <div>
          <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Goal Title *
          </label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth"
          />
        </div>

        <div>
          {isLoggedIn() ? (
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg mb-2">
              <button
                type="button"
                onClick={() => setContextTab('description')}
                className={`rounded-md py-1.5 text-[11px] font-bold uppercase tracking-wider transition-smooth ${
                  contextTab === 'description' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Description
              </button>
              <button
                type="button"
                onClick={() => setContextTab('attachments')}
                className={`rounded-md py-1.5 text-[11px] font-bold uppercase tracking-wider transition-smooth ${
                  contextTab === 'attachments' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
              </button>
            </div>
          ) : (
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Description
            </label>
          )}

          {contextTab === 'description' || !isLoggedIn() ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-16 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth resize-none"
            />
          ) : (
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:mix-border-primary/40 hover:mix-bg-primary/5 transition-smooth">
                <Icon name="PaperClipIcon" size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {uploading ? 'Extracting text...' : 'Choose file (.txt, .pdf, .docx)'}
                </span>
                <input
                  type="file"
                  accept=".txt,.pdf,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                {uploading && <span className="w-3 h-3 border-2 mix-border-primary/30 border-t-primary rounded-full animate-spin" />}
              </label>

              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-foreground">
                      <Icon name="DocumentIcon" size={12} className="text-muted-foreground" />
                      {name}
                      <button
                        type="button"
                        onClick={() => removeAttachment(name)}
                        className="text-muted-foreground hover:text-red-500 transition-smooth"
                      >
                        <Icon name="XMarkIcon" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Extracted text gets appended into the Description tab so AI breakdowns can use it as context.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Time Horizon
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as GoalLevel)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            >
              {GOAL_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GoalStatus)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            >
              <option value="backlog">Backlog</option>
              <option value="in_progress">In Progress</option>
              <option value="delayed">Delayed</option>
              <option value="done">Done</option>
              <option value="not_done">Not Done</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            >
              <option value="p1">P1 (Highest)</option>
              <option value="p2">P2 (High)</option>
              <option value="p3">P3 (Normal)</option>
              <option value="p4">P4 (Low)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Parent Goal
          </label>
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
          >
            <option value="">No parent</option>
            {parentOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {levelLabel(g.level)} — {g.title}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <Icon name="ExclamationTriangleIcon" size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed flex-1">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 mt-4 border-t mix-border-border/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-smooth"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || loading}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:mix-bg-primary/90 transition-smooth disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
