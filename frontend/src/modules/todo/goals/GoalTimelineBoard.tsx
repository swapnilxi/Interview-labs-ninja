'use client';

import Icon from '@/components/ui/AppIcon';
import GoalCard from './GoalCard';
import { GoalNode, GoalLevel, GOAL_LEVELS } from '@/lib/services/goalService';

interface GoalTimelineBoardProps {
  allGoals: GoalNode[];
  byId: Map<number, GoalNode>;
  selectedId: number | null;
  relatedIds: Set<number> | null;
  busy: Record<number, string | undefined>;
  onSelect: (id: number | null) => void;
  onEdit: (node: GoalNode) => void;
  onDelete: (node: GoalNode) => void;
  onDiveDeeper: (node: GoalNode) => void;
  onChunk: (node: GoalNode) => void;
  onMove: (node: GoalNode, dest: 'smart' | 'quick' | 'plan') => void;
  onAddAtLevel: (level: GoalLevel) => void;
}

export default function GoalTimelineBoard({
  allGoals,
  byId,
  selectedId,
  relatedIds,
  busy,
  onSelect,
  onEdit,
  onDelete,
  onDiveDeeper,
  onChunk,
  onMove,
  onAddAtLevel,
}: GoalTimelineBoardProps) {
  const columns = GOAL_LEVELS.map((lvl) => ({
    ...lvl,
    items: allGoals
      .filter((g) => g.level === lvl.id)
      .sort((a, b) => a.order_index - b.order_index || a.id - b.id),
  }));

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden scrollbar-clean pb-2">
      {allGoals.length === 0 && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3 px-1">
          <span className="text-base">🧭</span>
          <span>
            No goals yet — use a column's own <strong>+ Add</strong> below to start at any time horizon, no
            main goal required.
          </span>
        </div>
      )}
      <div className="flex gap-3 h-full min-w-max">
        {columns.map((col) => (
          <div
            key={col.id}
            className="w-[260px] shrink-0 flex flex-col bg-muted/20 border border-border/60 rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30 shrink-0">
              <span className="text-xs font-bold text-foreground">{col.label}</span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">
                {col.items.length}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-clean p-2 space-y-2">
              {col.items.map((node) => (
                <GoalCard
                  key={node.id}
                  node={node}
                  byId={byId}
                  isSelected={selectedId === node.id}
                  isDimmed={relatedIds != null && !relatedIds.has(node.id)}
                  busy={busy[node.id]}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDiveDeeper={onDiveDeeper}
                  onChunk={onChunk}
                  onMove={onMove}
                />
              ))}

              <button
                onClick={() => onAddAtLevel(col.id)}
                className="w-full py-1.5 rounded-lg border border-dashed border-border/70 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition-smooth flex items-center justify-center gap-1"
              >
                <Icon name="PlusIcon" size={11} /> Add {col.label}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
