'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { QuickTask, quickTaskService } from '@/lib/services/quickTaskService';
import { triggerConfetti } from '@/lib/services/todoService';

import ParetoModal from '@/components/ui/ParetoModal';
import QuickTaskDetailModal from './QuickTaskDetailModal';

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
  const [showParetoModal, setShowParetoModal] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleCheckbox = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDone = !task.done;
    if (newDone) {
      triggerConfetti(e.clientX, e.clientY);
    }
    const updated = await quickTaskService.updateTask(task.id, { done: newDone });
    if (updated) onUpdate(task.id, { done: newDone });
  };

  const [editingField, setEditingField] = useState<'time_estimate' | 'due_date' | null>(null);
  const [fieldValue, setFieldValue] = useState<string>('');

  const handleSaveField = async (field: 'time_estimate' | 'due_date') => {
    setEditingField(null);
    const val = fieldValue.trim() || null;
    onUpdate(task.id, { [field]: val });
    await quickTaskService.updateTask(task.id, { [field]: val });
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
      <div className="flex flex-col gap-1.5">
        {/* Row 1: checkbox + full title */}
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
            <button
              className={`flex-1 min-w-0 text-left text-[11px] font-medium cursor-pointer transition-smooth hover:text-primary leading-snug ${task.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}
              onClick={() => setShowDetailModal(true)}
              onDoubleClick={() => setEditingTitle(true)}
              title="Click to open details, context & due date"
            >
              {task.title}
            </button>
          )}

          {/* Source Badge */}
          {task.source !== 'manual' && (
            <span className="flex-shrink-0 text-[8px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1 rounded-sm">
              {task.source.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Row 2: time / due date badges + secondary actions */}
        <div className="flex items-center gap-2 pl-6 text-[10px] text-muted-foreground flex-wrap">
          {/* Time Estimate */}
          {editingField === 'time_estimate' ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={fieldValue}
                onChange={e => setFieldValue(e.target.value)}
                placeholder="30m, 1h..."
                className="w-16 text-[10px] bg-input border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveField('time_estimate');
                  if (e.key === 'Escape') setEditingField(null);
                }}
                autoFocus
              />
              <button
                onClick={() => handleSaveField('time_estimate')}
                className="text-[9px] bg-primary text-primary-foreground font-bold px-1.5 py-0.5 rounded"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingField('time_estimate');
                setFieldValue(task.time_estimate || '');
              }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-smooth hover:bg-muted ${
                task.time_estimate ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground/60 hover:text-muted-foreground'
              }`}
              title="Click to set time estimate"
            >
              <Icon name="ClockIcon" size={10} />
              <span>{task.time_estimate || '+ Time'}</span>
            </button>
          )}

          {/* Due Date */}
          {editingField === 'due_date' ? (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={fieldValue}
                onChange={e => setFieldValue(e.target.value)}
                className="text-[10px] bg-input border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                onBlur={() => handleSaveField('due_date')}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveField('due_date');
                  if (e.key === 'Escape') setEditingField(null);
                }}
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingField('due_date');
                setFieldValue(task.due_date || '');
              }}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-smooth hover:bg-muted ${
                task.due_date ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted-foreground/60 hover:text-muted-foreground'
              }`}
              title="Click to set due date"
            >
              <Icon name="CalendarIcon" size={10} />
              <span>{task.due_date || '+ Due Date'}</span>
            </button>
          )}

          {/* Context indicator */}
          {task.context && (
            <button
              onClick={() => setShowDetailModal(true)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-smooth"
              title="Has context / details"
            >
              <Icon name="PaperClipIcon" size={10} />
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Pareto 80/20 Button */}
          <button
            onClick={() => setShowParetoModal(true)}
            className={`p-1 rounded-md transition-smooth ${
              task.is_top_20 ? 'text-amber-500 font-bold hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-muted'
            }`}
            title="80/20 Pareto Analysis"
          >
            ⭐
          </button>

          {/* Move Menu */}
          <div className="relative">
            <button
              onClick={() => { setShowMoveMenu(!showMoveMenu); setShowDeleteConfirm(false); }}
              className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-smooth flex items-center gap-0.5"
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
              className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-smooth"
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

        {/* Quick Task Detail Modal */}
        <QuickTaskDetailModal
          task={task}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onUpdate={onUpdate}
        />

        {/* 80/20 Pareto Modal */}
        <ParetoModal
          isOpen={showParetoModal}
          onClose={() => setShowParetoModal(false)}
          title={task.title}
          table="quick_tasks"
          itemId={task.id}
          paretoScore={task.pareto_score}
          isTop20={task.is_top_20}
          model={model}
          onUpdate={async (updates) => {
            const updated = await quickTaskService.updateTask(task.id, updates);
            if (updated) onUpdate(task.id, updates);
          }}
        />
      </div>
  );
}
