'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Project, projectService } from '@/lib/services/projectService';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: (project: Project) => void;
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', 
  '#f59e0b', '#10b981', '#14b8a6', '#64748b'
];

const ICONS = ['📁', '🚀', '🧠', '💼', '🏡', '🏋️', '📚', '🎨', '💰', '🛠️'];

export default function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('p3');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [dueDate, setDueDate] = useState('');
  
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    const newProject = await projectService.createProject({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      color,
      icon,
      due_date: dueDate || null,
    });
    setLoading(false);

    if (newProject) {
      onSuccess(newProject);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2 text-foreground">
            <span className="text-xl">🗺️</span> New Project
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-smooth"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              Project Name *
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Marketing Launch"
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
              placeholder="What's the goal of this project?"
              className="w-full h-20 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth resize-none"
            />
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
              Icon & Color
            </label>
            <div className="flex gap-4 items-center">
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-clean flex-1 border border-border/50 rounded-lg p-1 bg-muted/20">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcon(i)}
                    className={`shrink-0 w-8 h-8 rounded text-lg flex items-center justify-center transition-smooth ${
                      icon === i ? 'bg-primary/20 scale-110 shadow-sm' : 'hover:bg-muted opacity-60 hover:opacity-100'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap w-24 gap-1 justify-center border border-border/50 rounded-lg p-1.5 bg-muted/20">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-4 h-4 rounded-full transition-smooth ${
                      color === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-card scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
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
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
