'use client';

import { useState } from 'react';
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

/** Topmost ancestor of a node — itself when it has no parent. Cycle-guarded against bad data. */
function rootOf(node: GoalNode, byId: Map<number, GoalNode>): GoalNode {
  let cur = node;
  const seen = new Set<number>([cur.id]);
  while (cur.parent_id != null) {
    const parent = byId.get(cur.parent_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cur = parent;
  }
  return cur;
}

const byOrder = (a: GoalNode, b: GoalNode) => a.order_index - b.order_index || a.id - b.id;

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
  // Collapse state is keyed by root goal, not by (column, root) — so folding a
  // goal away hides its sub-goals in every column at once.
  const [collapsedRoots, setCollapsedRoots] = useState<Set<number>>(new Set());

  const toggleRoot = (rootId: number) => {
    setCollapsedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  // Shared root ordering so a goal's group sits in the same relative position in every column.
  const rootRank = new Map<number, number>();
  allGoals
    .filter((g) => g.parent_id == null)
    .sort(byOrder)
    .forEach((r, i) => rootRank.set(r.id, i));

  const columns = GOAL_LEVELS.map((lvl) => {
    const items = allGoals.filter((g) => g.level === lvl.id).sort(byOrder);

    // A goal that *is* its own root needs no group header — it would just be filed under itself.
    const standalone: GoalNode[] = [];
    const groupMap = new Map<number, { root: GoalNode; items: GoalNode[] }>();

    for (const item of items) {
      const root = rootOf(item, byId);
      if (root.id === item.id) {
        standalone.push(item);
        continue;
      }
      const group = groupMap.get(root.id);
      if (group) group.items.push(item);
      else groupMap.set(root.id, { root, items: [item] });
    }

    const groups = [...groupMap.values()].sort(
      (a, b) => (rootRank.get(a.root.id) ?? 0) - (rootRank.get(b.root.id) ?? 0)
    );

    return { ...lvl, count: items.length, standalone, groups };
  });

  const renderCard = (node: GoalNode, groupedUnderRoot = false) => (
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
      groupedUnderRoot={groupedUnderRoot}
    />
  );

  return (
    <div className="w-full">
      {allGoals.length === 0 && (
        <div className="todo-glass mb-[1.5rem] flex items-center gap-3 px-[1.25rem] py-4 text-sm text-muted-foreground">
          <Icon name="SparklesIcon" size={14} className="text-primary shrink-0" />
          <span>
            <strong className="text-foreground font-semibold">Start with what matters</strong> — create a
            goal for any time horizon, from your bigger vision to your next milestone.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-[1.25rem] items-start todo-stagger">
        {columns.map((col) => (
          <div
            key={col.id}
            className="todo-lit min-w-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-[1.25rem] py-4 border-b border-border shrink-0" style={{ background: 'color-mix(in srgb, var(--color-foreground) 4%, transparent)' }}>
              <span className="font-heading text-sm font-bold text-foreground">{col.label}</span>
              <span className="copilot-tint rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                {col.count}
              </span>
            </div>

            <div className="max-h-[460px] overflow-y-auto scrollbar-clean p-4 space-y-3">
              {col.standalone.length === 0 && col.groups.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No {col.label.toLowerCase()} goals yet</p>
              )}

              {col.standalone.map((item) => renderCard(item))}

              {col.groups.map((group) => {
                const collapsed = collapsedRoots.has(group.root.id);
                return (
                  <div key={group.root.id} className="space-y-1.5">
                    <button
                      onClick={() => toggleRoot(group.root.id)}
                      className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md mix-bg-muted/40 hover:mix-bg-muted/70 transition-smooth text-left"
                      title={`${collapsed ? 'Expand' : 'Collapse'} everything under "${group.root.title}"`}
                    >
                      <Icon
                        name="ChevronRightIcon"
                        size={10}
                        className={`shrink-0 text-muted-foreground transition-transform duration-200 ${
                          collapsed ? '' : 'rotate-90'
                        }`}
                      />
                      <span className="text-xs font-bold text-muted-foreground truncate flex-1">
                        ↳ {group.root.title}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-1 rounded-sm shrink-0">
                        {group.items.length}
                      </span>
                    </button>

                    {!collapsed && (
                      <div className="space-y-2 pl-1.5 border-l mix-border-border/50 ml-1">
                        {group.items.map((item) => renderCard(item, true))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 p-4 pt-0">
              <button
                onClick={() => onAddAtLevel(col.id)}
                className="todo-add-slot todo-focus flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold"
              >
                <Icon name="PlusIcon" size={13} /> Add {col.label}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
