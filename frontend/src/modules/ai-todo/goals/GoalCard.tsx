'use client';

import { useState, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { GoalNode } from '@/lib/services/goalService';
import { STATUS_CONFIG, TaskStatus, TaskPriority } from '@/lib/services/todoService';
import { exportGoalTreeToCsv } from './exportGoalTree';
import { PRIORITY_COLOR, STATUS_COLOR, STATUS_TEXT } from '../shared/semanticColors';

interface GoalCardProps {
  node: GoalNode;
  byId: Map<number, GoalNode>;
  isSelected: boolean;
  isDimmed: boolean;
  busy?: string;
  onSelect: (id: number | null) => void;
  onEdit: (node: GoalNode) => void;
  onDelete: (node: GoalNode) => void;
  onDiveDeeper: (node: GoalNode) => void;
  onChunk: (node: GoalNode) => void;
  onMove: (node: GoalNode, dest: 'smart' | 'quick' | 'plan') => void;
  /** Set when the card is rendered under a group header naming its root goal — drops the
   *  root from the breadcrumb so the header isn't repeated on every card beneath it. */
  groupedUnderRoot?: boolean;
}

function ancestorChain(node: GoalNode, byId: Map<number, GoalNode>): GoalNode[] {
  const chain: GoalNode[] = [];
  let cur = node.parent_id != null ? byId.get(node.parent_id) : undefined;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return chain;
}

export default function GoalCard({
  node,
  byId,
  isSelected,
  isDimmed,
  busy,
  onSelect,
  onEdit,
  onDelete,
  onDiveDeeper,
  onChunk,
  onMove,
  groupedUnderRoot,
}: GoalCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  // The menu renders through a portal (components/ui/Popover.tsx): inside the card, the next card
  // painted over it. The Popover also handles outside-click and Escape.
  const moveBtnRef = useRef<HTMLButtonElement>(null);

  const fullChain = ancestorChain(node, byId);
  // Inside a group the root is already in the header above; keep only the
  // intermediate ancestors, which are what actually add context there.
  const breadcrumb = groupedUnderRoot ? fullChain.slice(1) : fullChain;
  const statusCfg = STATUS_CONFIG[node.status as TaskStatus] || STATUS_CONFIG.backlog;
    const hasExports = node.exported_to_smart_todo || node.exported_to_quick || node.exported_to_plan;

  return (
    <div
      onClick={() => onSelect(isSelected ? null : node.id)}
      className={`todo-task-card goal-card cursor-pointer p-4 ${isSelected ? 'goal-card-selected' : ''} ${
        isDimmed ? 'opacity-40' : ''
      }`}
    >
      {breadcrumb.length > 0 && (
        <div className="mb-1.5 truncate text-[12px] text-muted-foreground" title={breadcrumb.map((b) => b.title).join(' › ')}>
          ↳ {breadcrumb.map((b) => b.title).join(' › ')}
        </div>
      )}

      <div className="flex items-start justify-between gap-1.5">
        {/* The keyboard way to select: a real button. It has no handler of its own — its click bubbles to the
            card, whose handler (the pointer way, anywhere on the card) does the work. */}
        <button
          type="button"
          aria-pressed={isSelected}
          className="todo-focus -m-0.5 flex-1 rounded p-0.5 text-left text-[15px] font-medium leading-snug text-foreground"
        >
          {node.title}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActionsExpanded((v) => !v);
          }}
          aria-expanded={actionsExpanded}
          aria-label={actionsExpanded ? 'Hide goal actions' : 'Show goal actions'}
          className={`-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            actionsExpanded ? 'copilot-tint' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          title={actionsExpanded ? 'Hide actions' : 'Show actions (breakdown, chunk, move, delete)'}
        >
          <Icon
            name="ChevronDownIcon"
            size={16}
            className={`transition-transform duration-200 ${actionsExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {node.description && (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{node.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${STATUS_TEXT[node.status as TaskStatus] || STATUS_TEXT.backlog}`}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[node.status as TaskStatus] || STATUS_COLOR.backlog }} aria-hidden="true" />
          {statusCfg.label}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[node.priority as TaskPriority] || PRIORITY_COLOR.p3 }} aria-hidden="true" />
          {node.priority.toUpperCase()}
        </span>
        {node.due_date && (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground tabular-nums">
            <Icon name="CalendarIcon" size={13} /> {node.due_date}
          </span>
        )}
        {node.generation_type !== 'manual' && (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium copilot-tint">
            AI {node.generation_type.replace('_', ' ')}
          </span>
        )}
      </div>

      {hasExports && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] font-medium">
          {node.exported_to_smart_todo && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon name="CpuChipIcon" size={13} /> Smart
            </span>
          )}
          {node.exported_to_quick && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon name="BoltIcon" size={13} /> Quick
            </span>
          )}
          {node.exported_to_plan && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon name="MapIcon" size={13} /> Plan
            </span>
          )}
        </div>
      )}

      {actionsExpanded && (
        <div className="goal-card-actions mt-3 flex flex-wrap items-center gap-2 pt-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDiveDeeper(node)}
            disabled={!!busy}
            className="todo-btn todo-btn-quiet"
            title="AI: break into strategic sub-goals at the next level down"
          >
            {busy === 'dive-deeper' ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 mix-border-primary/30 border-t-primary" />
            ) : (
              <Icon name="MagnifyingGlassIcon" size={14} className="lab-ink" />
            )}
            Breakdown
          </button>
          <button
            onClick={() => onChunk(node)}
            disabled={!!busy}
            className="todo-btn todo-btn-quiet"
            title="AI: break into small, concrete daily action steps"
          >
            {busy === 'chunk' ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 mix-border-primary/30 border-t-primary" />
            ) : (
              <Icon name="BoltIcon" size={14} className="lab-ink" />
            )}
            Chunk
          </button>

          <div>
            <button
              ref={moveBtnRef}
              onClick={() => setShowMoveMenu((v) => !v)}
              disabled={!!busy}
              aria-haspopup="menu"
              aria-expanded={showMoveMenu}
              className="todo-btn todo-btn-quiet"
            >
              Move to <Icon name="ChevronDownIcon" size={13} />
            </button>
            <Popover
              open={showMoveMenu}
              anchorRef={moveBtnRef}
              onClose={() => setShowMoveMenu(false)}
              label="Move goal to"
              className="todo-popover overflow-hidden w-[11rem] py-1"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setShowMoveMenu(false);
                  onMove(node, 'smart');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] font-medium transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
              >
                <Icon name="CpuChipIcon" size={16} className="text-muted-foreground" /> Smart To-Do
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setShowMoveMenu(false);
                  onMove(node, 'quick');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] font-medium transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
              >
                <Icon name="BoltIcon" size={16} className="text-muted-foreground" /> Quick Daily
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setShowMoveMenu(false);
                  onMove(node, 'plan');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] font-medium transition-smooth hover:bg-muted focus:outline-none focus-visible:bg-muted"
              >
                <Icon name="MapIcon" size={16} className="text-muted-foreground" /> Plan & Project
              </button>
            </Popover>
          </div>

          {/* Secondary actions: icon buttons at the trailing edge. */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEdit(node)}
              aria-label="Edit goal"
              title="Edit"
              className="todo-btn todo-btn-ghost h-9 w-9 px-0"
            >
              <Icon name="PencilSquareIcon" size={16} />
            </button>
            {!node.parent_id && (
              <button
                onClick={() => exportGoalTreeToCsv(node, byId)}
                aria-label="Export goal breakdown as CSV"
                title="Export this goal's full breakdown (all levels) as CSV — opens in Excel or Google Sheets"
                className="todo-btn todo-btn-ghost h-9 w-9 px-0"
              >
                <Icon name="ArrowDownTrayIcon" size={16} />
              </button>
            )}
            <button
              onClick={() => onDelete(node)}
              aria-label="Delete goal"
              title="Delete goal"
              className="todo-btn todo-btn-ghost h-9 w-9 px-0 text-error hover:text-error"
            >
              <Icon name="TrashIcon" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
