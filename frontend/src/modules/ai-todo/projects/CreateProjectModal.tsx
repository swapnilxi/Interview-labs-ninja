'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import ProjectIcon, { DEFAULT_PROJECT_ICON } from './ProjectIcon';
import Modal from '@/components/ui/Modal';
import { Project, projectService } from '@/lib/services/projectService';

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: (project: Project) => void;
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', 
  '#f59e0b', '#10b981', '#14b8a6', '#64748b'
];

// emoji-ok — the only emoji left in the To-Do UI: these are the user's own pick for a project. The first is
// the default (drawn as the flat folder by ProjectIcon).
const ICONS = [DEFAULT_PROJECT_ICON, '🚀', '🧠', '💼', '🏡', '🏋️', '📚', '🎨', '💰', '🛠️'];

export default function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('p3');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [dueDate, setDueDate] = useState('');
  
  const [loading, setLoading] = useState(false);

  // A stray click outside shouldn't throw away a half-filled form.
  const dirty = !!(title.trim() || description.trim() || dueDate);

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
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="create-project-title"
      closeOnEscape={!loading}
      closeOnBackdrop={!loading && !dirty}
      className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md"
    >
      <div className="flex items-center justify-between p-4 border-b mix-border-border/50">
        <h2 id="create-project-title" className="font-heading font-semibold text-lg flex items-center gap-2 text-foreground">
          <FlatIcon name="roadmap" size={26} /> New Project
        </h2>
        <button 
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-smooth"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
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
          <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
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
            Icon & Color
          </label>
          <div className="flex gap-4 items-center">
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-clean flex-1 border mix-border-border/50 rounded-lg p-1 mix-bg-muted/20">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  aria-pressed={icon === i}
                  aria-label={i === DEFAULT_PROJECT_ICON ? 'Folder icon' : `Icon ${i}`}
                  className={`shrink-0 w-8 h-8 rounded text-lg flex items-center justify-center transition-smooth ${
                    icon === i ? 'mix-bg-primary/20 scale-110 shadow-sm' : 'hover:bg-muted opacity-60 hover:opacity-100'
                  }`}
                >
                  <ProjectIcon icon={i} size={20} />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap w-[6rem] gap-1 justify-center border mix-border-border/50 rounded-lg p-1.5 mix-bg-muted/20">
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
            Create Project
          </button>
        </div>
      </form>
    </Modal>
  );
}
