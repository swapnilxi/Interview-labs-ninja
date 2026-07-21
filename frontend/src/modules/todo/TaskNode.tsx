'use client';

import { useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  getDepthColor,
  getRelativeDueDate,
  computeProgress,
  todoService,
} from '@/lib/services/todoService';

interface TaskNodeProps {
  task: Task;
  depth?: number;
  chunkIndex?: number;
  model: 'ollama' | 'gemini';
  onUpdate: (taskId: number, updates: Partial<Task>) => void;
  onDelete: (taskId: number) => void;
  onChildrenGenerated: (parentId: number, children: Task[], generationType: string) => void;
  onUndoAvailable: (parentId: number, previousChildren: Task[]) => void;
  searchQuery?: string;
}

export default function TaskNode({
  task,
  depth = 1,
  chunkIndex,
  model,
  onUpdate,
  onDelete,
  onChildrenGenerated,
  onUndoAvailable,
  searchQuery = '',
}: TaskNodeProps) {
  const [expanded, setExpanded] = useState(depth <= 2);
  const [loading, setLoading] = useState<'dive' | 'chunk' | 'regen' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showDepthWarning, setShowDepthWarning] = useState<'dive' | 'chunk' | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const depthColor = getDepthColor(depth);
  const progress = computeProgress(task);
  const dueInfo = getRelativeDueDate(task.due_date);
  const hasChildren = task.children && task.children.length > 0;
  const isAiGenerated = task.generation_type !== 'manual';

  // Search highlight
  const matchesSearch = searchQuery && task.title.toLowerCase().includes(searchQuery.toLowerCase());

  // ── Inline edit handlers ─────────────────────────────────────────────────

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = async (field: string) => {
    if (editValue.trim() || field !== 'title') {
      const updated = await todoService.updateTask(task.id, { [field]: editValue.trim() || null });
      if (updated) onUpdate(task.id, { [field]: editValue.trim() || null });
    }
    setEditingField(null);
  };

  // ── Status / Priority handlers ───────────────────────────────────────────

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setShowStatusMenu(false);
    const updated = await todoService.updateTask(task.id, { status: newStatus });
    if (updated) onUpdate(task.id, { status: newStatus });
  };

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    setShowPriorityMenu(false);
    const updated = await todoService.updateTask(task.id, { priority: newPriority });
    if (updated) onUpdate(task.id, { priority: newPriority });
  };

  const handleCheckbox = async () => {
    const newStatus = task.status === 'done' ? 'backlog' : 'done';
    const updated = await todoService.updateTask(task.id, { status: newStatus as TaskStatus });
    if (updated) onUpdate(task.id, { status: newStatus as TaskStatus });
  };

  // ── AI breakdown handlers ────────────────────────────────────────────────

  const handleAIAction = async (type: 'dive' | 'chunk') => {
    // Depth warning at L4+ (feedback #11)
    if (depth >= 4 && !showDepthWarning) {
      setShowDepthWarning(type);
      return;
    }
    setShowDepthWarning(null);
    setLoading(type);
    setExpanded(true);

    try {
      const previousChildren = [...(task.children || [])];
      const subtasks = type === 'dive'
        ? await todoService.diveDeeper(task.id, model)
        : await todoService.chunkIt(task.id, model);

      if (subtasks.length > 0) {
        onChildrenGenerated(task.id, subtasks, type === 'dive' ? 'dive_deeper' : 'chunk');
        onUndoAvailable(task.id, previousChildren);
      }
    } catch (err) {
      console.error('AI action failed:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleRegenerate = async () => {
    setLoading('regen');
    try {
      const subtasks = await todoService.regenerate(task.id, model);
      if (subtasks.length > 0) {
        onChildrenGenerated(task.id, subtasks, task.generation_type);
      }
    } catch (err) {
      console.error('Regeneration failed:', err);
    } finally {
      setLoading(null);
    }
  };

  // ── Delete handler ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    const deleted = await todoService.deleteTask(task.id);
    if (deleted) onDelete(task.id);
    setShowDeleteConfirm(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.backlog;
  const priorityConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.p3;

  return (
    <div
      className={`task-node relative ${matchesSearch ? 'ring-2 ring-primary/40 rounded-lg' : ''}`}
      style={{ paddingLeft: depth > 1 ? '24px' : '0' }}
    >
      {/* Vertical connector line */}
      {depth > 1 && (
        <div
          className="absolute left-[11px] top-0 bottom-0 w-[2px] rounded-full opacity-30"
          style={{ backgroundColor: depthColor }}
        />
      )}

      {/* Main task card */}
      <div className={`relative lab-card-muted p-3 mb-2 transition-smooth hover:shadow-sm`}
           style={{ borderLeftWidth: '3px', borderLeftColor: depthColor }}>

        {/* Row 1: Checkbox + depth badge + gen badge + title + status + priority */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Checkbox */}
          <button onClick={handleCheckbox} className="flex-shrink-0 transition-smooth hover:scale-110">
            <div className={`w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center transition-smooth ${
              task.status === 'done'
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-muted-foreground/40 hover:border-primary'
            }`}>
              {task.status === 'done' && (
                <Icon name="CheckIcon" size={12} className="text-white" variant="solid" />
              )}
            </div>
          </button>

          {/* Step number for chunk subtasks */}
          {task.generation_type === 'chunk' && chunkIndex !== undefined && (
            <span className="flex-shrink-0 text-[10px] font-bold text-emerald-500 w-5 text-center">
              {chunkIndex + 1}.
            </span>
          )}

          {/* Depth badge */}
          <span
            className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${depthColor}20`, color: depthColor }}
          >
            L{depth}
          </span>

          {/* Generation type badge */}
          {task.generation_type === 'dive_deeper' && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
              🔍 Deep
            </span>
          )}
          {task.generation_type === 'chunk' && (
            <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
              ⚡ Chunk
            </span>
          )}

          {/* Title (click to edit or expand) */}
          {editingField === 'title' ? (
            <input
              ref={titleRef}
              className="flex-1 min-w-0 text-sm font-medium bg-input border border-border rounded px-2 py-0.5 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('title')}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit('title'); if (e.key === 'Escape') setEditingField(null); }}
              autoFocus
            />
          ) : (
            <button
              className={`flex-1 min-w-0 text-left text-sm font-medium transition-smooth hover:text-primary truncate ${
                task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
              onClick={() => setExpanded(!expanded)}
              onDoubleClick={() => startEdit('title', task.title)}
            >
              {hasChildren && (
                <Icon
                  name="ChevronRightIcon"
                  size={12}
                  className={`inline mr-1 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                />
              )}
              {task.title}
            </button>
          )}

          {/* Status badge (inline dropdown) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false); }}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-smooth hover:opacity-80 ${statusConf.bgClass}`}
            >
              {statusConf.label}
            </button>
            {showStatusMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[130px]">
                {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof statusConf][]).map(([key, conf]) => (
                  <button
                    key={key}
                    onClick={() => handleStatusChange(key)}
                    className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted flex items-center gap-2 ${
                      task.status === key ? 'font-semibold' : ''
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: conf.color }} />
                    {conf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Priority dot (inline dropdown) */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false); }}
              className="transition-smooth hover:scale-125"
              title={priorityConf.label}
            >
              <span className={`block w-2.5 h-2.5 rounded-full ${priorityConf.dotClass}`} />
            </button>
            {showPriorityMenu && (
              <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof priorityConf][]).map(([key, conf]) => (
                  <button
                    key={key}
                    onClick={() => handlePriorityChange(key)}
                    className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-md transition-smooth hover:bg-muted flex items-center gap-2 ${
                      task.priority === key ? 'font-semibold' : ''
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dotClass}`} />
                    {conf.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Time estimate + due date + progress + action buttons */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Time estimate (click to edit) */}
          {editingField === 'time_estimate' ? (
            <input
              className="text-[10px] bg-input border border-border rounded px-2 py-0.5 w-20 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('time_estimate')}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit('time_estimate'); if (e.key === 'Escape') setEditingField(null); }}
              placeholder="e.g. 30 mins"
              autoFocus
            />
          ) : (
            <button
              onClick={() => startEdit('time_estimate', task.time_estimate || '')}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-smooth flex items-center gap-1"
            >
              <Icon name="ClockIcon" size={11} />
              {task.time_estimate || 'Add time'}
            </button>
          )}

          {/* Due date */}
          {editingField === 'due_date' ? (
            <input
              type="date"
              className="text-[10px] bg-input border border-border rounded px-2 py-0.5 focus-ring"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => saveEdit('due_date')}
              autoFocus
            />
          ) : (
            <button
              onClick={() => startEdit('due_date', task.due_date || '')}
              className={`text-[10px] flex items-center gap-1 transition-smooth ${
                dueInfo?.isOverdue ? 'text-red-500 font-semibold' :
                dueInfo?.isDueToday ? 'text-amber-500 font-semibold' :
                'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="CalendarIcon" size={11} />
              {dueInfo?.text || 'Add date'}
            </button>
          )}

          {/* Progress bar (if has children) */}
          {hasChildren && (
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : depthColor }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground font-medium">{progress}%</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Context icon */}
          {task.context && (
            <button
              onClick={() => setShowContext(!showContext)}
              className="text-muted-foreground hover:text-foreground transition-smooth"
              title="View context"
            >
              <Icon name="PaperClipIcon" size={13} />
            </button>
          )}

          {/* AI Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Dive Deeper */}
            <button
              onClick={() => handleAIAction('dive')}
              disabled={loading !== null}
              className="text-[10px] px-2 py-1 rounded-md border border-purple-500/30 text-purple-500 hover:bg-purple-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1"
              title="Break into strategic subtasks"
            >
              {loading === 'dive' ? (
                <span className="w-3 h-3 border border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              ) : '🔍'}
              <span className="hidden sm:inline">Dive</span>
            </button>

            {/* Chunk It */}
            <button
              onClick={() => handleAIAction('chunk')}
              disabled={loading !== null}
              className="text-[10px] px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1"
              title="Break into actionable steps"
            >
              {loading === 'chunk' ? (
                <span className="w-3 h-3 border border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              ) : '⚡'}
              <span className="hidden sm:inline">Chunk</span>
            </button>

            {/* Generate DoD & Subtasks */}
            <button
              onClick={async () => {
                setLoading('dod' as any);
                try {
                  const res = await todoService.generateTaskDoD(task.id, model);
                  if (res && res.created_subtasks && res.created_subtasks.length > 0) {
                    onChildrenGenerated(task.id, res.created_subtasks, 'chunk');
                  }
                  if (res && res.definition_of_done) {
                    onUpdate(task.id, { definition_of_done: res.definition_of_done });
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(null);
                }
              }}
              disabled={loading !== null}
              className="text-[10px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-smooth disabled:opacity-40 flex items-center gap-1"
              title="Generate Definition of Done & Subtasks with AI"
            >
              {loading === ('dod' as any) ? (
                <span className="w-3 h-3 border border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              ) : '✨'}
              <span className="hidden sm:inline">DoD</span>
            </button>

            {/* Regenerate (AI-generated nodes only) */}
            {isAiGenerated && hasChildren && (
              <button
                onClick={handleRegenerate}
                disabled={loading !== null}
                className="text-[10px] px-1.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth disabled:opacity-40"
                title="Regenerate subtasks"
              >
                {loading === 'regen' ? (
                  <span className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" />
                ) : '🔄'}
              </button>
            )}

            {/* Delete */}
            <div className="relative">
              <button
                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                className="text-[10px] px-1.5 py-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-smooth"
                title="Delete task"
              >
                <Icon name="TrashIcon" size={12} />
              </button>
              {showDeleteConfirm && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                  <p className="text-xs text-foreground font-medium mb-2">Delete this task{hasChildren ? ' and all subtasks' : ''}?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="text-[11px] px-3 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-smooth font-medium"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-[11px] px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-smooth"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Depth warning modal (feedback #11) */}
        {showDepthWarning && (
          <div className="mt-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <span className="text-xs">⚠️</span>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex-1">
              You're at L{depth} depth — AI subtasks may become too granular. Continue?
            </p>
            <button
              onClick={() => handleAIAction(showDepthWarning)}
              className="text-[10px] px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition-smooth"
            >
              Yes, continue
            </button>
            <button
              onClick={() => setShowDepthWarning(null)}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted transition-smooth"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Context display */}
        {showContext && task.context && (
          <div className="mt-2 p-2.5 rounded-md bg-muted/50 border border-border">
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {task.context}
            </p>
          </div>
        )}
      </div>

      {/* Children (recursive) */}
      {expanded && hasChildren && (
        <div className="relative">
          {task.children.map((child, index) => (
            <TaskNode
              key={child.id}
              task={child}
              depth={depth + 1}
              chunkIndex={child.generation_type === 'chunk' ? index : undefined}
              model={model}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onChildrenGenerated={onChildrenGenerated}
              onUndoAvailable={onUndoAvailable}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Loading skeleton for AI generation */}
      {loading && loading !== 'regen' && (
        <div className="ml-6 space-y-2 mt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}
    </div>
  );
}
