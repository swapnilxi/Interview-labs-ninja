'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { QuickTask, quickTaskService } from '@/lib/services/quickTaskService';
import { triggerConfetti } from '@/lib/services/todoService';

interface QuickTaskCardProps {
  task: QuickTask;
  model: 'ollama' | 'gemini';
  onUpdate: (taskId: number, updates: Partial<QuickTask>) => void;
  onDelete: (taskId: number) => void;
  onMoveToSmart?: (taskId: number) => void;
  onMoveToPlan?: (taskId: number) => void;
  hideDragHandle?: boolean;
}

export default function QuickTaskCard({
  task,
  model,
  onUpdate,
  onDelete,
  onMoveToSmart,
  onMoveToPlan,
  hideDragHandle,
}: QuickTaskCardProps) {
  const [showParetoPopover, setShowParetoPopover] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(task.title);

  const handleCheckbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDone = !task.done;
    if (newDone) {
      triggerConfetti(e.clientX, e.clientY);
    }
    const updated = await quickTaskService.updateTask(task.id, { done: newDone });
    if (updated) onUpdate(task.id, { done: newDone });
  };

  const handleSaveTitle = async () => {
    if (editValue.trim() && editValue !== task.title) {
      const updated = await quickTaskService.updateTask(task.id, { title: editValue.trim() });
      if (updated) onUpdate(task.id, { title: editValue.trim() });
    } else {
      setEditValue(task.title);
    }
    setEditingTitle(false);
  };

  const handleDelete = async () => {
    const success = await quickTaskService.deleteTask(task.id);
    if (success) onDelete(task.id);
    setShowDeleteConfirm(false);
  };

  // 80/20 styling
  let paretoClasses = '';
  if (task.is_top_20) {
    paretoClasses = 'ring-1 ring-amber-400/50 shadow-sm';
  } else if (task.pareto_score !== undefined && task.pareto_score !== null) {
    if (task.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (task.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  return (
    <div className={`relative bg-card border border-border/60 rounded-lg p-2.5 transition-smooth hover:border-border/80 group ${paretoClasses} ${task.done ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        {!hideDragHandle && (
          <div className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-smooth flex-shrink-0">
            <Icon name="Bars3Icon" size={14} />
          </div>
        )}

        {/* Checkbox */}
        <button onClick={handleCheckbox} className="flex-shrink-0 transition-smooth hover:scale-110">
          <div className={`w-4 h-4 rounded-sm border-[1.5px] flex items-center justify-center transition-smooth ${
            task.done
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-muted-foreground/40 hover:border-primary'
          }`}>
            {task.done && <Icon name="CheckIcon" size={10} className="text-white" variant="solid" />}
          </div>
        </button>

        {/* Top 20 Badge */}
        {task.is_top_20 && (
          <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 flex items-center gap-0.5 shadow-sm">
            ⭐ 20%
          </span>
        )}

        {/* Title */}
        {editingTitle ? (
          <input
            className="flex-1 min-w-0 text-[11px] font-medium bg-input border border-border rounded px-2 py-0.5 focus-ring"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            autoFocus
          />
        ) : (
          <span 
            className={`flex-1 min-w-0 text-[11px] font-medium truncate cursor-pointer transition-smooth hover:text-primary ${task.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}
            onDoubleClick={() => setEditingTitle(true)}
          >
            {task.title}
          </span>
        )}

        {/* Source Badge */}
        {task.source !== 'manual' && (
          <span className="flex-shrink-0 text-[8px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1 rounded-sm">
            {task.source.replace('_', ' ')}
          </span>
        )}

        {/* Actions Menu */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Pareto Popover */}
          <div className="relative">
            <button
              onClick={() => setShowParetoPopover(!showParetoPopover)}
              className={`text-[10px] p-1 rounded-md transition-smooth ${
                task.is_top_20 ? 'text-amber-500 font-bold hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-muted text-[10px]'
              }`}
              title="80/20 Analysis"
            >
              ⭐
            </button>
            {showParetoPopover && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[220px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-foreground">80/20 Analysis</span>
                  <button onClick={() => setShowParetoPopover(false)} className="text-muted-foreground hover:text-foreground">
                    <Icon name="XMarkIcon" size={12} />
                  </button>
                </div>
                
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Pareto Score</span>
                    <span className="font-semibold text-amber-500">
                      {task.pareto_score !== undefined && task.pareto_score !== null 
                        ? `${Math.round(task.pareto_score * 100)}%` 
                        : 'Not scored'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-400 transition-all duration-300" 
                      style={{ width: `${(task.pareto_score || 0) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={async () => {
                      setReanalyzing(true);
                      try {
                        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/pareto/reanalyze/quick_tasks/${task.id}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ model })
                        });
                        const data = await res.json();
                        if (data.status === 'success') {
                          onUpdate(task.id, { pareto_score: data.pareto_score, is_top_20: data.is_top_20 });
                        }
                      } finally {
                        setReanalyzing(false);
                      }
                    }}
                    disabled={reanalyzing}
                    className="w-full text-left text-[10px] px-2 py-1.5 rounded bg-muted/50 hover:bg-muted text-foreground flex items-center gap-1.5 transition-smooth disabled:opacity-50"
                  >
                    {reanalyzing ? '⏳ Re-scoring...' : '↺ Re-score this task'}
                  </button>
                  
                  <label className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-muted/50 hover:bg-muted cursor-pointer transition-smooth">
                    <span className="text-[10px] text-foreground">Mark as Top 20%</span>
                    <input 
                      type="checkbox" 
                      checked={!!task.is_top_20}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        const updated = await quickTaskService.updateTask(task.id, { is_top_20: val });
                        if (updated) onUpdate(task.id, { is_top_20: val });
                      }}
                      className="w-3 h-3 rounded border-border text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Move Menu */}
          <div className="relative">
            <button
              onClick={() => { setShowMoveMenu(!showMoveMenu); setShowDeleteConfirm(false); }}
              className="text-[10px] p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-smooth flex items-center gap-0.5"
              title="Move Task"
            >
              <Icon name="ArrowRightIcon" size={11} />
            </button>
            {showMoveMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[150px]">
                <button
                  onClick={() => { setShowMoveMenu(false); onMoveToSmart?.(task.id); }}
                  className="w-full text-left text-[10px] px-2.5 py-2 rounded-md hover:bg-muted transition-smooth flex items-center gap-2"
                >
                  <span className="text-xs">🧠</span> Move to Smart To-Do
                </button>
                <button
                  onClick={() => { setShowMoveMenu(false); onMoveToPlan?.(task.id); }}
                  className="w-full text-left text-[10px] px-2.5 py-2 rounded-md hover:bg-muted transition-smooth flex items-center gap-2"
                >
                  <span className="text-xs">🗺️</span> Move to Plan & Project
                </button>
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="relative">
            <button
              onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setShowMoveMenu(false); }}
              className="text-[10px] p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-smooth"
              title="Delete"
            >
              <Icon name="TrashIcon" size={11} />
            </button>
            {showDeleteConfirm && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[140px]">
                <p className="text-[10px] text-foreground font-medium mb-2 text-center">Delete task?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleDelete}
                    className="flex-1 text-[10px] py-1 rounded bg-red-500 text-white font-medium hover:bg-red-600 transition-smooth"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 text-[10px] py-1 rounded border border-border text-muted-foreground hover:bg-muted transition-smooth"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
