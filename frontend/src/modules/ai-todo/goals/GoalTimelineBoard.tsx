'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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

const SCROLL_AMOUNT = 288;

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
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging]         = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  // Drag tracking — refs avoid re-renders on every mouse-move
  const dragRef    = useRef({ active: false, startX: 0, scrollLeft: 0 });
  // Timer that re-enables scroll-snap after the user pauses scrolling/dragging
  const snapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleRoot = (rootId: number) => {
    setCollapsedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  // ── Shared snap helpers ────────────────────────────────────────────────────
  // Removing scroll-snap lets the user scroll freely; we restore it once they
  // stop so the cards still snap into place on touch / after drag ends.
  const killSnap = (el: HTMLDivElement) => {
    el.style.scrollSnapType = 'none';
    if (snapTimer.current) clearTimeout(snapTimer.current);
  };

  const scheduleSnapRestore = (el: HTMLDivElement) => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      el.style.scrollSnapType = ''; // inherits from CSS class again
      snapTimer.current = null;
    }, 180); // ms after last wheel/drag event
  };

  // ── Sync arrow visibility ──────────────────────────────────────────────────
  const syncScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  // ── Mouse-wheel → horizontal scroll ───────────────────────────────────────
  // We directly mutate scrollLeft (no scrollBy / smooth) so there's zero
  // animation fighting against snap. Snap is disabled for the duration and
  // restored 180 ms after the last wheel event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      // Let vertical-scroll children handle their own scroll
      if (target.closest('[data-vscroll]') && el.contains(target.closest('[data-vscroll]')!)) return;

      const dy = e.deltaY;
      const dx = e.deltaX;

      // Only intercept when the dominant axis is vertical (trackpad natural scroll
      // or mouse wheel), converting it to horizontal movement.
      if (Math.abs(dy) > Math.abs(dx)) {
        e.preventDefault();
        killSnap(el);
        el.scrollLeft += dy;
        scheduleSnapRestore(el);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Track scroll position for nav-arrow visibility ────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncScrollState();
    el.addEventListener('scroll', syncScrollState, { passive: true });
    const ro = new ResizeObserver(syncScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', syncScrollState);
      ro.disconnect();
    };
  }, [syncScrollState]);

  const scrollBy = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    });
  };

  // ── Drag-to-scroll handlers ───────────────────────────────────────────────
  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Don't hijack clicks on interactive children
    if (target.closest('[data-vscroll]') || target.closest('button') || target.closest('a')) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    killSnap(el);
    setIsDragging(true);
    e.preventDefault();
  };

  const onDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const x    = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.5;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  const onDragEnd = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const el = scrollRef.current;
    if (el) scheduleSnapRestore(el); // snap after momentum settles
    setIsDragging(false);
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
        <div className="todo-glass mb-[1.25rem] flex items-center gap-3 px-4 py-3.5 text-[14px] text-muted-foreground">
          <Icon name="SparklesIcon" size={16} className="lab-ink shrink-0" />
          <span>
            <strong className="text-foreground font-medium">Start with what matters</strong> — create a
            goal for any time horizon, from your bigger vision to your next milestone.
          </span>
        </div>
      )}

      {/* Wrapper — relative so arrows can be positioned at its edges */}
      <div className="relative">

        {/* Left nav arrow — desktop only */}
        <button
          onClick={() => scrollBy('left')}
          aria-label="Scroll left"
          className={[
            'absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-1/2',
            'hidden sm:flex items-center justify-center',
            'h-9 w-9 rounded-full border border-border bg-card shadow-lg',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
            'transition-[opacity,background-color,color] duration-200',
            canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <Icon name="ChevronLeftIcon" size={16} />
        </button>

        {/* Right nav arrow — desktop only */}
        <button
          onClick={() => scrollBy('right')}
          aria-label="Scroll right"
          className={[
            'absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1/2',
            'hidden sm:flex items-center justify-center',
            'h-9 w-9 rounded-full border border-border bg-card shadow-lg',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
            'transition-[opacity,background-color,color] duration-200',
            canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <Icon name="ChevronRightIcon" size={16} />
        </button>

        {/*
          Scroll track
          - overflow-x-auto  : enables horizontal scrolling
          - [scroll-snap-type:x_mandatory] : snappy card-by-card feel on touch
          - scrollbar-clean  : thin / hidden custom scrollbar
          - pb-3             : room for scrollbar on desktop
        */}
        <div
          ref={scrollRef}
          className={[
            // Phones: the track bleeds to the screen edges (cards slide under the edge, as in a native carousel) and
            // snaps each column to the page gutter.
            'goal-track flex gap-3 sm:gap-4 items-start overflow-x-auto [scroll-snap-type:x_mandatory] scrollbar-clean pb-3 todo-stagger',
            '-mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0',
            isDragging ? 'cursor-grabbing select-none' : 'cursor-grab',
          ].join(' ')}
          onMouseDown={onDragStart}
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
        >
          {columns.map((col) => (
            <div
              key={col.id}
              className="goal-column shrink-0 flex flex-col overflow-hidden [scroll-snap-align:start] w-[82vw] max-w-[22rem] sm:w-[260px]"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-4">
                <span className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-foreground">{col.label}</span>
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {col.count}
                </span>
              </div>

              {/* data-vscroll: wheel handler skips this zone so inner vertical scroll still works */}
              <div data-vscroll="" className="max-h-[460px] overflow-y-auto overscroll-contain scrollbar-clean space-y-2.5 p-3">
                {col.standalone.length === 0 && col.groups.length === 0 && (
                  <p className="py-5 text-center text-[13px] text-muted-foreground">No {col.label.toLowerCase()} goals yet</p>
                )}

                {col.standalone.map((item) => renderCard(item))}

                {col.groups.map((group) => {
                  const collapsed = collapsedRoots.has(group.root.id);
                  return (
                    <div key={group.root.id} className="space-y-1.5">
                      <button
                        onClick={() => toggleRoot(group.root.id)}
                        className="flex w-full items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-left transition-smooth mix-bg-muted/40 hover:mix-bg-muted/70"
                        aria-expanded={!collapsed}
                        title={`${collapsed ? 'Expand' : 'Collapse'} everything under "${group.root.title}"`}
                      >
                        <Icon
                          name="ChevronRightIcon"
                          size={13}
                          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${
                            collapsed ? '' : 'rotate-90'
                          }`}
                        />
                        <span className="flex-1 truncate text-[12px] font-medium text-muted-foreground">
                          ↳ {group.root.title}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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

              <div className="shrink-0 p-3 pt-0">
                <button
                  onClick={() => onAddAtLevel(col.id)}
                  className="todo-add-slot todo-focus flex w-full items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[13px] font-medium"
                >
                  <Icon name="PlusIcon" size={15} /> Add {col.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

