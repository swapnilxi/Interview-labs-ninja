'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { GoalNode } from '@/lib/services/goalService';
import { STATUS_CONFIG, PRIORITY_CONFIG, TaskStatus, TaskPriority } from '@/lib/services/todoService';
import { exportGoalTreeToCsv } from './exportGoalTree';

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoveMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMoveMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoveMenu]);

  const fullChain = ancestorChain(node, byId);
  // Inside a group the root is already in the header above; keep only the
  // intermediate ancestors, which are what actually add context there.
  const breadcrumb = groupedUnderRoot ? fullChain.slice(1) : fullChain;
  const statusCfg = STATUS_CONFIG[node.status as TaskStatus] || STATUS_CONFIG.backlog;
  const priorityCfg = PRIORITY_CONFIG[node.priority as TaskPriority] || PRIORITY_CONFIG.p3;
  const hasExports = node.exported_to_smart_todo || node.exported_to_quick || node.exported_to_plan;

  return (
    <div
      onClick={() => onSelect(isSelected ? null : node.id)}
      className={`todo-task-card cursor-pointer p-4 ${
        isSelected ? 'border-primary shadow-md ring-1 ring-primary' : ''
      } ${isDimmed ? 'opacity-35' : ''}`}
    >
      {breadcrumb.length > 0 && (
        <div className="mb-1.5 truncate text-[10px] text-muted-foreground" title={breadcrumb.map((b) => b.title).join(' › ')}>
          ↳ {breadcrumb.map((b) => b.title).join(' › ')}
        </div>
      )}

      <div className="flex items-start justify-between gap-1.5">
        <p className="flex-1 text-[13px] font-semibold leading-snug text-foreground">{node.title}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActionsExpanded((v) => !v);
          }}
          className={`shrink-0 rounded-md p-1 transition-colors ${
            actionsExpanded ? 'copilot-tint' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          title={actionsExpanded ? 'Hide actions' : 'Show actions (breakdown, chunk, move, delete)'}
        >
          <Icon
            name="ChevronDownIcon"
            size={12}
            className={`transition-transform duration-200 ${actionsExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {node.description && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{node.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.bgClass}`}>{statusCfg.label}</span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <div className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dotClass}`} />
          {node.priority.toUpperCase()}
        </span>
        {node.due_date && (
          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
            <Icon name="CalendarIcon" size={9} /> {node.due_date}
          </span>
        )}
        {node.generation_type !== 'manual' && (
          <span className="text-[9px] uppercase tracking-wider font-semibold text-blue-500 bg-blue-500/10 px-1 rounded-sm">
            AI {node.generation_type.replace('_', ' ')}
          </span>
        )}
      </div>

      {hasExports && (
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[9px] font-bold">
          {node.exported_to_smart_todo && (
            <span className="text-emerald-500 flex items-center gap-0.5">
              <Icon name="CpuChipIcon" size={10} /> Smart
            </span>
          )}
          {node.exported_to_quick && (
            <span className="text-amber-500 flex items-center gap-0.5">
              <Icon name="BoltIcon" size={10} /> Quick
            </span>
          )}
          {node.exported_to_plan && (
            <span className="text-blue-500 flex items-center gap-0.5">
              <Icon name="MapIcon" size={10} /> Plan
            </span>
          )}
        </div>
      )}

      {actionsExpanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDiveDeeper(node)}
            disabled={!!busy}
            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
            title="AI: break into strategic sub-goals at the next level down"
          >
            {busy === 'dive-deeper' ? (
              <span className="w-2.5 h-2.5 border border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
            ) : (
              <Icon name="MagnifyingGlassIcon" size={10} />
            )}{' '}
            Breakdown
          </button>
          <button
            onClick={() => onChunk(node)}
            disabled={!!busy}
            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
            title="AI: break into small, concrete daily action steps"
          >
            {busy === 'chunk' ? (
              <span className="w-2.5 h-2.5 border border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
            ) : (
              <Icon name="BoltIcon" size={10} />
            )}{' '}
            Chunk
          </button>
          <button
            onClick={() => onEdit(node)}
            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-smooth flex items-center gap-0.5"
            title="Edit"
          >
            <Icon name="PencilSquareIcon" size={10} />
          </button>

          {!node.parent_id && (
            <button
              onClick={() => exportGoalTreeToCsv(node, byId)}
              className="text-[10px] font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-smooth flex items-center gap-0.5"
              title="Export this goal's full breakdown (all levels) as CSV — opens in Excel or Google Sheets"
            >
              <Icon name="ArrowDownTrayIcon" size={10} /> Export
            </button>
          )}

          <div className="relative ml-auto" ref={menuRef}>
            <button
              onClick={() => setShowMoveMenu((v) => !v)}
              disabled={!!busy}
              className="text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
            >
              Move to <Icon name="ChevronDownIcon" size={9} />
            </button>
            {showMoveMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-xl overflow-hidden w-36">
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    onMove(node, 'smart');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-medium hover:bg-muted transition-smooth flex items-center gap-1.5"
                >
                  <Icon name="CpuChipIcon" size={11} className="text-emerald-500" /> Smart To-Do
                </button>
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    onMove(node, 'quick');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-medium hover:bg-muted transition-smooth flex items-center gap-1.5"
                >
                  <Icon name="BoltIcon" size={11} className="text-amber-500" /> Quick Daily
                </button>
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    onMove(node, 'plan');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-medium hover:bg-muted transition-smooth flex items-center gap-1.5"
                >
                  <Icon name="MapIcon" size={11} className="text-blue-500" /> Plan & Project
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => onDelete(node)}
            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-smooth"
          >
            <Icon name="TrashIcon" size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
