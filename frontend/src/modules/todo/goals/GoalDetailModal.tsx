'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { GoalNode, GoalLevel, GoalStatus, GOAL_LEVELS, goalService } from '@/lib/services/goalService';

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

  const levelLabel = (lvl: GoalLevel) => GOAL_LEVELS.find((l) => l.id === lvl)?.label || lvl;

  const excluded = descendantIds(goal.id, allGoals);
  excluded.add(goal.id);
  const parentOptions = allGoals.filter((g) => !excluded.has(g.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    const saved = await goalService.updateGoal(goal.id, {
      title: title.trim(),
      description: description.trim() || null,
      level,
      status,
      priority,
      due_date: dueDate || null,
      parent_id: parentId,
    });
    setLoading(false);

    if (saved) onSaved();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2 text-foreground">
            <span className="text-xl">✏️</span> Edit Goal
          </h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-smooth">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-clean">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
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
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
