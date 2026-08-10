'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { GoalNode } from '@/lib/services/goalService';
import { STATUS_CONFIG, PRIORITY_CONFIG, TaskStatus, TaskPriority } from '@/lib/services/todoService';

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

  const breadcrumb = ancestorChain(node, byId);
  const statusCfg = STATUS_CONFIG[node.status as TaskStatus] || STATUS_CONFIG.backlog;
  const priorityCfg = PRIORITY_CONFIG[node.priority as TaskPriority] || PRIORITY_CONFIG.p3;
  const hasExports = node.exported_to_smart_todo || node.exported_to_quick || node.exported_to_plan;

  return (
    <div
      onClick={() => onSelect(isSelected ? null : node.id)}
      className={`relative bg-card border rounded-lg p-2.5 cursor-pointer transition-smooth ${
        isSelected ? 'border-primary shadow-md ring-1 ring-primary/40' : 'border-border/60 hover:border-border'
      } ${isDimmed ? 'opacity-35' : ''}`}
    >
      {breadcrumb.length > 0 && (
        <div className="text-[9px] text-muted-foreground truncate mb-1" title={breadcrumb.map((b) => b.title).join(' › ')}>
          ↳ {breadcrumb.map((b) => b.title).join(' › ')}
        </div>
      )}

      <div className="flex items-start justify-between gap-1.5">
        <p className="text-xs font-semibold text-foreground leading-snug flex-1">{node.title}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActionsExpanded((v) => !v);
          }}
          className={`shrink-0 p-0.5 rounded transition-smooth ${
            actionsExpanded ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{node.description}</p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.bgClass}`}>{statusCfg.label}</span>
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
          {node.exported_to_smart_todo && <span className="text-emerald-500 flex items-center gap-0.5">🧠 Smart</span>}
          {node.exported_to_quick && <span className="text-amber-500 flex items-center gap-0.5">⚡ Quick</span>}
          {node.exported_to_plan && <span className="text-blue-500 flex items-center gap-0.5">🗺️ Plan</span>}
        </div>
      )}

      {actionsExpanded && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDiveDeeper(node)}
            disabled={!!busy}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
            title="AI: break into strategic sub-goals at the next level down"
          >
            {busy === 'dive-deeper' ? <span className="w-2.5 h-2.5 border border-blue-500/40 border-t-blue-500 rounded-full animate-spin" /> : '🔍'} Breakdown
          </button>
          <button
            onClick={() => onChunk(node)}
            disabled={!!busy}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
            title="AI: break into small, concrete daily action steps"
          >
            {busy === 'chunk' ? <span className="w-2.5 h-2.5 border border-purple-500/40 border-t-purple-500 rounded-full animate-spin" /> : '⚡'} Chunk
          </button>
          <button
            onClick={() => onEdit(node)}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-smooth flex items-center gap-0.5"
            title="Edit"
          >
            <Icon name="PencilSquareIcon" size={10} />
          </button>

          <div className="relative ml-auto" ref={menuRef}>
            <button
              onClick={() => setShowMoveMenu((v) => !v)}
              disabled={!!busy}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-smooth disabled:opacity-50 flex items-center gap-0.5"
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
                  🧠 Smart To-Do
                </button>
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    onMove(node, 'quick');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-medium hover:bg-muted transition-smooth flex items-center gap-1.5"
                >
                  ⚡ Quick Daily
                </button>
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    onMove(node, 'plan');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[10px] font-medium hover:bg-muted transition-smooth flex items-center gap-1.5"
                >
                  🗺️ Plan & Project
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => onDelete(node)}
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-smooth"
          >
            <Icon name="TrashIcon" size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
