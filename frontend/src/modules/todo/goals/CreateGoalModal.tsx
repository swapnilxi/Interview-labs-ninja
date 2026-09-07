'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { GoalNode, GoalLevel, GOAL_LEVELS, goalService } from '@/lib/services/goalService';
import { todoService } from '@/lib/services/todoService';
import { isLoggedIn } from '@/lib/auth/tokenStore';

interface CreateGoalModalProps {
  defaultLevel: GoalLevel;
  allGoals: GoalNode[];
  onClose: () => void;
  onSuccess: (goal: GoalNode) => void;
}

export default function CreateGoalModal({ defaultLevel, allGoals, onClose, onSuccess }: CreateGoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<GoalLevel>(defaultLevel);
  const [parentId, setParentId] = useState<number | null>(null);
  const [priority, setPriority] = useState('p3');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);

  const [contextTab, setContextTab] = useState<'description' | 'attachments'>('description');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const levelLabel = (lvl: GoalLevel) => GOAL_LEVELS.find((l) => l.id === lvl)?.label || lvl;

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
    if (!title.trim()) return;

    setLoading(true);
    const newGoal = await goalService.createGoal({
      title: title.trim(),
      level,
      parent_id: parentId,
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setLoading(false);

    if (newGoal) onSuccess(newGoal);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2 text-foreground">
            <span className="text-xl">🎯</span> New Goal
          </h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-smooth">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Goal Title *
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ship the v2 launch"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth"
            />
          </div>

          <div>
            {isLoggedIn() ? (
              <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg mb-2">
                <button
                  type="button"
                  onClick={() => setContextTab('description')}
                  className={`rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-smooth ${
                    contextTab === 'description' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Description
                </button>
                <button
                  type="button"
                  onClick={() => setContextTab('attachments')}
                  className={`rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-smooth ${
                    contextTab === 'attachments' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
                </button>
              </div>
            ) : (
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Description
              </label>
            )}

            {contextTab === 'description' || !isLoggedIn() ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context"
                className="w-full h-16 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth resize-none"
              />
            ) : (
              <div>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-smooth">
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
                  {uploading && <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
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
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Extracted text gets appended into the Description tab so AI breakdowns can use it as context.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
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
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
              >
                <option value="p1">🔴 P1 (Highest)</option>
                <option value="p2">🟠 P2 (High)</option>
                <option value="p3">🔵 P3 (Normal)</option>
                <option value="p4">⚪ P4 (Low)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Parent Goal (optional)
            </label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            >
              <option value="">No parent — start fresh here</option>
              {allGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {levelLabel(g.level)} — {g.title}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              You don't have to start with a main goal — pick any time horizon and chunk down from there whenever you're ready.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 mt-4 border-t border-border/50">
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
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
              Create Goal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
