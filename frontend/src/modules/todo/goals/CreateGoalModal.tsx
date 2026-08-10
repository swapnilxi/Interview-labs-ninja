'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { GoalNode, GoalLevel, GOAL_LEVELS, goalService } from '@/lib/services/goalService';

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

  const levelLabel = (lvl: GoalLevel) => GOAL_LEVELS.find((l) => l.id === lvl)?.label || lvl;

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
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context"
              className="w-full h-16 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth resize-none"
            />
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
