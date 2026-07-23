'use client';

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
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

export type QuadrantType = 'do_now' | 'schedule' | 'delegate' | 'eliminate';

export interface MatrixItem {
  id: string | number;
  quadrant: QuadrantType | null;
  is_top_20?: boolean;
  order_index?: number;
}

interface EisenhowerMatrixProps<T extends MatrixItem> {
  items: T[];
  onQuadrantChange: (itemId: string | number, newQuadrant: QuadrantType, newIndex?: number) => void;
  onItemClick?: (item: T) => void;
  showAutoSort?: boolean;
  onAutoSort?: () => void;
  autoSortLoading?: boolean;
  itemRenderer: (item: T, isDragging?: boolean) => React.ReactNode;
}

const QUADRANTS: { id: QuadrantType; label: string; colorClass: string; bgClass: string; borderActive: string; desc: string; emoji: string }[] = [
  { id: 'do_now',    label: 'DO NOW',    emoji: '🔴', colorClass: 'text-red-500',   bgClass: 'bg-red-500/5 border-red-500/20',   borderActive: 'border-red-500/60 bg-red-500/10',   desc: 'Urgent & Important' },
  { id: 'schedule',  label: 'SCHEDULE',  emoji: '🔵', colorClass: 'text-blue-500',  bgClass: 'bg-blue-500/5 border-blue-500/20',  borderActive: 'border-blue-500/60 bg-blue-500/10',  desc: 'Important, Not Urgent' },
  { id: 'delegate',  label: 'DELEGATE',  emoji: '🟡', colorClass: 'text-amber-500', bgClass: 'bg-amber-500/5 border-amber-500/20', borderActive: 'border-amber-500/60 bg-amber-500/10', desc: 'Urgent, Not Important' },
  { id: 'eliminate', label: 'ELIMINATE', emoji: '⚫', colorClass: 'text-gray-500',  bgClass: 'bg-gray-500/5 border-gray-500/20',  borderActive: 'border-gray-400/60 bg-gray-400/10',  desc: 'Neither' },
];

// ── Draggable card ────────────────────────────────────────────────────────────

function SortableCard<T extends MatrixItem>({
  item,
  renderer,
}: {
  item: T;
  renderer: (item: T, isDragging?: boolean) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id.toString(),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`mb-2 cursor-grab active:cursor-grabbing touch-none select-none ${item.is_top_20 ? 'ring-1 ring-amber-400 rounded-xl shadow-sm' : ''}`}
    >
      {renderer(item, isDragging)}
    </div>
  );
}

// ── Droppable quadrant container ──────────────────────────────────────────────

function QuadrantDropZone<T extends MatrixItem>({
  quad,
  items,
  isOver,
  renderer,
}: {
  quad: (typeof QUADRANTS)[number];
  items: T[];
  isOver: boolean;
  renderer: (item: T, isDragging?: boolean) => React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: quad.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-2 transition-all duration-150 overflow-hidden min-h-[220px] ${
        isOver ? quad.borderActive : quad.bgClass
      }`}
    >
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-black/[0.03] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span>{quad.emoji}</span>
          <span className={`font-bold text-xs uppercase tracking-wider ${quad.colorClass}`}>
            {quad.label}
          </span>
          <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-semibold">
            {items.length}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground opacity-70">{quad.desc}</span>
      </div>

      {/* Items */}
      <div className="flex-1 p-2 overflow-y-auto scrollbar-clean">
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
                isOver ? 'border-current opacity-60' : 'border-border/30 opacity-40'
              }`}
            >
              <span className="text-2xl">{quad.emoji}</span>
              <p className="text-[10px] font-medium italic text-muted-foreground text-center px-2">
                Drop here → {quad.label}
              </p>
            </div>
          )}
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

  /** Resolve which quadrant a dnd-kit `over.id` belongs to */
  const resolveQuadrant = (overIdStr: string): QuadrantType | null => {
    // Direct quadrant drop zone
    const quad = QUADRANTS.find((q) => q.id === overIdStr);
    if (quad) return quad.id;
    // Over another item — find that item's quadrant
    const overItem = items.find((i) => i.id.toString() === overIdStr);
    return overItem?.quadrant ?? null;
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

    const targetQuadrant = resolveQuadrant(over.id.toString());
    if (!targetQuadrant) return;

    if (activeItem.quadrant !== targetQuadrant) {
      // Cross-quadrant move
      onQuadrantChange(activeItem.id, targetQuadrant);
    } else {
      // Same-quadrant reorder
      const quadItems = categorized[targetQuadrant];
      const oldIdx = quadItems.findIndex((i) => i.id.toString() === activeId);
      const newIdx = quadItems.findIndex((i) => i.id.toString() === over.id.toString());
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        onQuadrantChange(activeItem.id, targetQuadrant, newIdx);
      }
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
          🟦 Eisenhower Matrix
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
            ) : '🤖'}
            AI Auto-Sort
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* 2×2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
          {QUADRANTS.map((quad) => {
            const isOver = overId ? resolveQuadrant(overId) === quad.id : false;
            return (
              <QuadrantDropZone
                key={quad.id}
                quad={quad}
                items={categorized[quad.id]}
                isOver={isOver}
                renderer={itemRenderer}
              />
            );
          })}
        </div>

        {/* Unassigned strip */}
        {categorized.unassigned.length > 0 && (
          <div className="mt-1 p-3 rounded-xl border border-dashed border-border/50 bg-muted/20">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              ⚠️ Unassigned
              <span className="bg-muted px-1.5 rounded text-[10px]">{categorized.unassigned.length}</span>
              <span className="text-[10px] font-normal opacity-70">— drag to a quadrant above</span>
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-clean">
              <SortableContext
                id="unassigned"
                items={categorized.unassigned.map((i) => i.id.toString())}
                strategy={verticalListSortingStrategy}
              >
                {categorized.unassigned.map((item) => (
                  <div key={item.id} className="min-w-[200px] shrink-0">
                    <SortableCard item={item} renderer={itemRenderer} />
                  </div>
                ))}
              </SortableContext>
            </div>
          </div>
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
