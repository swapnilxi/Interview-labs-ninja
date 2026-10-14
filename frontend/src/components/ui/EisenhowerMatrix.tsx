'use client';

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';

export type QuadrantType = 'do_now' | 'schedule' | 'delegate' | 'eliminate';

export interface MatrixItem {
  id: string | number;
  quadrant: QuadrantType | null;
  is_top_20?: boolean;
  order_index?: number;
}

/** Spread onto the element that should start a drag (see `SortableCard`, "grip-only" mode). */
export type DragHandleProps = Record<string, any>;

/**
 * `grid` is the classic 2×2 matrix. `stack` is the same sections as a vertical list — Quick Daily's
 * default view — where the cards are dragged by a grip so the list still scrolls under your finger.
 */
export type MatrixLayout = 'grid' | 'stack';

interface EisenhowerMatrixProps<T extends MatrixItem> {
  items: T[];
  /** `newQuadrant` is `null` only when a card is dropped back into the unassigned tray (`allowUnassign`). */
  onQuadrantChange: (itemId: string | number, newQuadrant: QuadrantType | null, newIndex?: number) => void;
  onItemClick?: (item: T) => void;
  showAutoSort?: boolean;
  onAutoSort?: () => void;
  autoSortLoading?: boolean;
  /** `dragHandle` is only passed in the `stack` layout; spread it on the grip. */
  itemRenderer: (item: T, isDragging?: boolean, dragHandle?: DragHandleProps) => React.ReactNode;
  layout?: MatrixLayout;
  /** Put the unassigned tray before the quadrants — it is what you sort *from*. */
  unassignedFirst?: boolean;
  /** Let a card be dropped back into the unassigned tray. Leave off where the backend can't hold "no quadrant". */
  allowUnassign?: boolean;
  /** The built-in title row (with AI Auto-Sort). Turn off when the page supplies its own toolbar. */
  showHeader?: boolean;
  unassignedLabel?: string;
  unassignedHint?: string;
}

const UNASSIGNED = 'unassigned' as const;
type Target = QuadrantType | typeof UNASSIGNED;

const QUADRANTS: {
  id: QuadrantType;
  label: string;
  title: string;
  colorClass: string;
  bgClass: string;
  borderActive: string;
  desc: string;
  dot: string;
  lit: string;
}[] = [
  { id: 'do_now',    label: 'DO NOW',    title: 'Do now',    dot: 'bg-red-500',   colorClass: 'text-red-500',   bgClass: 'bg-red-500/5 border-red-500/20',   borderActive: 'border-red-500/60 bg-red-500/10',   desc: 'Urgent & Important', lit: '#ef4444' },
  { id: 'schedule',  label: 'SCHEDULE',  title: 'Schedule',  dot: 'bg-blue-500',  colorClass: 'text-blue-500',  bgClass: 'bg-blue-500/5 border-blue-500/20',  borderActive: 'border-blue-500/60 bg-blue-500/10',  desc: 'Important, Not Urgent', lit: '#3b82f6' },
  { id: 'delegate',  label: 'DELEGATE',  title: 'Delegate',  dot: 'bg-amber-500', colorClass: 'text-amber-500', bgClass: 'bg-amber-500/5 border-amber-500/20', borderActive: 'border-amber-500/60 bg-amber-500/10', desc: 'Urgent, Not Important', lit: '#f59e0b' },
  { id: 'eliminate', label: 'ELIMINATE', title: 'Eliminate', dot: 'bg-gray-400',  colorClass: 'text-gray-500',  bgClass: 'bg-gray-500/5 border-gray-500/20',  borderActive: 'border-gray-400/60 bg-gray-400/10',  desc: 'Neither', lit: '#9ca3af' },
];

// ── Draggable card ────────────────────────────────────────────────────────────

function SortableCard<T extends MatrixItem>({
  item,
  renderer,
  gripOnly,
}: {
  item: T;
  renderer: (item: T, isDragging?: boolean, dragHandle?: DragHandleProps) => React.ReactNode;
  /** The card scrolls and clicks normally; only the grip the renderer places starts a drag. */
  gripOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id.toString(),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  // dnd-kit's keyboard sensor reacts to Space/Enter keydowns that bubble up from *anywhere* inside
  // the card — including a dialog the card renders through a portal (React events bubble through
  // portals). Typing a space in that dialog started a drag and the space was swallowed, and Space
  // on the card's own buttons did the same. Only start a keyboard drag when the card itself has focus.
  const { onKeyDown: sensorKeyDown, ...sensorListeners } = (listeners ?? {}) as Record<string, any>;

  if (gripOnly) {
    // `touch-action: none` on a whole card stops the page scrolling under your finger, which makes a
    // long list of cards unusable on a phone. Here only the grip has it.
    const dragHandle: DragHandleProps = {
      ref: setActivatorNodeRef,
      ...attributes,
      ...sensorListeners,
      onKeyDown: sensorKeyDown,
      style: { touchAction: 'none' },
    };
    return (
      <div ref={setNodeRef} style={style} className="mb-2">
        {renderer(item, isDragging, dragHandle)}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...sensorListeners}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) sensorKeyDown?.(event);
      }}
      className={`mb-3 cursor-grab active:cursor-grabbing touch-none select-none ${item.is_top_20 ? 'ring-1 ring-amber-400 rounded-xl shadow-sm' : ''}`}
    >
      {renderer(item, isDragging)}
    </div>
  );
}

// ── Droppable quadrant container (grid layout) ────────────────────────────────

function QuadrantDropZone<T extends MatrixItem>({
  quad,
  items,
  isOver,
  renderer,
}: {
  quad: (typeof QUADRANTS)[number];
  items: T[];
  isOver: boolean;
  renderer: (item: T, isDragging?: boolean, dragHandle?: DragHandleProps) => React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: quad.id });

  return (
    <div
      ref={setNodeRef}
      style={{ '--lit': quad.lit } as React.CSSProperties}
      className={`todo-lit flex flex-col rounded-xl border-2 overflow-hidden min-h-[220px] ${
        isOver ? quad.borderActive : quad.bgClass
      }`}
    >
      {/* Header */}
      <div className="px-[1.25rem] py-4 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-black/[0.03] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${quad.dot}`} aria-hidden="true" />
          <span className={`font-bold text-xs uppercase tracking-wider ${quad.colorClass}`}>
            {quad.label}
          </span>
          <span className="text-xs text-muted-foreground mix-bg-muted/60 px-1.5 py-0.5 rounded font-semibold">
            {items.length}
          </span>
        </div>
        <span className="text-xs text-muted-foreground opacity-70">{quad.desc}</span>
      </div>

      {/* Items */}
      <div className="flex-1 p-4 overflow-y-auto scrollbar-clean">
        <SortableContext
          id={quad.id}
          items={items.map((i) => i.id.toString())}
          strategy={verticalListSortingStrategy}
        >
          {items.length > 0 ? (
            items.map((item) => (
              <SortableCard key={item.id} item={item} renderer={renderer} />
            ))
          ) : (
            <div
              className={`h-full min-h-[120px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all ${
                isOver ? 'border-current opacity-60' : 'mix-border-border/30 opacity-40'
              }`}
            >
              <span className={`h-4 w-4 rounded-full ${quad.dot}`} aria-hidden="true" />
              <p className="text-xs font-medium italic text-muted-foreground text-center px-2">
                Drop here → {quad.label}
              </p>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ── One section of the stacked list ───────────────────────────────────────────

/**
 * A quadrant (or the unassigned tray) as a section of a vertical list. Always rendered — empty ones as a
 * slim row — so every drop target keeps its place on screen while you drag (a section that appeared
 * mid-drag would shift the list under the pointer and the drop rectangles with it).
 */
function StackSection<T extends MatrixItem>({
  id,
  title,
  desc,
  dot,
  items,
  isOver,
  droppable,
  emphasis,
  renderer,
}: {
  id: string;
  title: string;
  desc: string;
  dot: string;
  items: T[];
  isOver: boolean;
  droppable: boolean;
  /** The "to do" section — what you sort from — gets a stronger frame. */
  emphasis?: boolean;
  renderer: (item: T, isDragging?: boolean, dragHandle?: DragHandleProps) => React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id, disabled: !droppable });
  const empty = items.length === 0;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${title} (${items.length})`}
      className={`rounded-xl border-2 transition-colors ${
        isOver
          ? 'border-blue-400 bg-blue-500/10'
          : emphasis && !empty
            ? 'border-dashed border-border bg-muted'
            : 'border-border bg-card'
      }`}
    >
      <header className={`flex items-center gap-2.5 px-4 ${empty ? 'py-2.5' : 'pb-1 pt-3'}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
          {items.length}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          {empty && droppable ? 'Drop a task here' : desc}
        </span>
      </header>
      <SortableContext id={id} items={items.map((i) => i.id.toString())} strategy={verticalListSortingStrategy}>
        {!empty && (
          <div className="px-3 pb-2 pt-2">
            {items.map((item) => (
              <SortableCard key={item.id} item={item} renderer={renderer} gripOnly />
            ))}
          </div>
        )}
      </SortableContext>
    </section>
  );
}

// ── The unassigned tray as a strip (grid layout) ──────────────────────────────

function UnassignedStrip<T extends MatrixItem>({
  items,
  isOver,
  droppable,
  label,
  hint,
  renderer,
  first,
}: {
  items: T[];
  isOver: boolean;
  droppable: boolean;
  label: string;
  hint: string;
  renderer: (item: T, isDragging?: boolean, dragHandle?: DragHandleProps) => React.ReactNode;
  first: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: UNASSIGNED, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      className={`${first ? 'mb-1' : 'mt-1'} p-3 rounded-xl border border-dashed transition-colors ${
        isOver ? 'border-blue-400 bg-blue-500/10' : 'mix-border-border/50 mix-bg-muted/20'
      }`}
    >
      <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <FlatIcon name="warning" size={14} /> {label}
        <span className="bg-muted px-1.5 rounded text-xs">{items.length}</span>
        <span className="text-xs font-normal opacity-70">{hint}</span>
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-clean">
        <SortableContext id={UNASSIGNED} items={items.map((i) => i.id.toString())} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <div key={item.id} className="min-w-[200px] shrink-0">
              <SortableCard item={item} renderer={renderer} />
            </div>
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EisenhowerMatrix<T extends MatrixItem>({
  items,
  onQuadrantChange,
  showAutoSort,
  onAutoSort,
  autoSortLoading,
  itemRenderer,
  layout = 'grid',
  unassignedFirst = false,
  allowUnassign = false,
  showHeader = true,
  unassignedLabel = 'Unassigned',
  unassignedHint = '— drag to a quadrant above',
}: EisenhowerMatrixProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const categorized = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.is_top_20 && !b.is_top_20) return -1;
      if (!a.is_top_20 && b.is_top_20) return 1;
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });
    return {
      do_now:    sorted.filter((i) => i.quadrant === 'do_now'),
      schedule:  sorted.filter((i) => i.quadrant === 'schedule'),
      delegate:  sorted.filter((i) => i.quadrant === 'delegate'),
      eliminate: sorted.filter((i) => i.quadrant === 'eliminate'),
      unassigned: sorted.filter((i) => !i.quadrant),
    };
  }, [items]);

  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id.toString() === activeId) : null),
    [activeId, items],
  );

  /** Which section a dnd-kit `over.id` belongs to (null = not a place a card may be dropped). */
  const resolveTarget = (overIdStr: string): Target | null => {
    if (overIdStr === UNASSIGNED) return allowUnassign ? UNASSIGNED : null;
    // Direct quadrant drop zone
    const quad = QUADRANTS.find((q) => q.id === overIdStr);
    if (quad) return quad.id;
    // Over another item — find that item's section
    const overItem = items.find((i) => i.id.toString() === overIdStr);
    if (!overItem) return null;
    if (overItem.quadrant) return overItem.quadrant;
    return allowUnassign ? UNASSIGNED : null;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id.toString());
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? over.id.toString() : null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    if (!over || !activeItem) return;

    const target = resolveTarget(over.id.toString());
    if (!target) return;
    const targetQuadrant = target === UNASSIGNED ? null : target;

    if ((activeItem.quadrant ?? null) !== targetQuadrant) {
      // Cross-section move
      onQuadrantChange(activeItem.id, targetQuadrant);
    } else {
      // Same-section reorder
      const sectionItems = target === UNASSIGNED ? categorized.unassigned : categorized[target];
      const oldIdx = sectionItems.findIndex((i) => i.id.toString() === activeId);
      const newIdx = sectionItems.findIndex((i) => i.id.toString() === over.id.toString());
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        onQuadrantChange(activeItem.id, targetQuadrant, newIdx);
      }
    }
  };

  const overTarget = overId ? resolveTarget(overId) : null;

  const unassignedSection =
    layout === 'stack' ? (
      <StackSection
        key={UNASSIGNED}
        id={UNASSIGNED}
        title={unassignedLabel}
        desc={unassignedHint}
        dot="bg-slate-400"
        items={categorized.unassigned}
        isOver={overTarget === UNASSIGNED}
        droppable={allowUnassign}
        emphasis
        renderer={itemRenderer}
      />
    ) : categorized.unassigned.length > 0 ? (
      <UnassignedStrip
        key={UNASSIGNED}
        items={categorized.unassigned}
        isOver={overTarget === UNASSIGNED}
        droppable={allowUnassign}
        label={unassignedLabel}
        hint={unassignedHint}
        renderer={itemRenderer}
        first={unassignedFirst}
      />
    ) : null;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
            <Icon name="Squares2X2Icon" size={20} className="text-primary" /> Eisenhower Matrix
            <span className="text-xs font-normal text-muted-foreground">— drag cards between quadrants</span>
          </h2>
          {showAutoSort && (
            <button
              onClick={onAutoSort}
              disabled={autoSortLoading || items.length === 0}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-smooth flex items-center gap-1.5 disabled:opacity-50"
            >
              {autoSortLoading ? (
                <span className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : <FlatIcon name="ai" size={16} />}
              AI Auto-Sort
            </button>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {layout === 'stack' ? (
          <div className="flex flex-col gap-3">
            {unassignedFirst && unassignedSection}
            {QUADRANTS.map((quad) => (
              <StackSection
                key={quad.id}
                id={quad.id}
                title={quad.title}
                desc={quad.desc}
                dot={quad.dot}
                items={categorized[quad.id]}
                isOver={overTarget === quad.id}
                droppable
                renderer={itemRenderer}
              />
            ))}
            {!unassignedFirst && unassignedSection}
          </div>
        ) : (
          <>
            {unassignedFirst && unassignedSection}

            {/* 2×2 grid */}
            <div className="todo-stagger grid grid-cols-1 md:grid-cols-2 gap-[1.25rem] flex-1 min-h-0">
              {QUADRANTS.map((quad) => (
                <QuadrantDropZone
                  key={quad.id}
                  quad={quad}
                  items={categorized[quad.id]}
                  isOver={overTarget === quad.id}
                  renderer={itemRenderer}
                />
              ))}
            </div>

            {!unassignedFirst && unassignedSection}
          </>
        )}

        {/* Drag overlay */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
          {activeItem ? (
            <div className="rotate-1 scale-105 shadow-2xl opacity-95 pointer-events-none">
              {itemRenderer(activeItem, true)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
