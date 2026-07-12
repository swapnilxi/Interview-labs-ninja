'use client';

import React, { useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '@/components/ui/AppIcon';

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

const QUADRANTS: { id: QuadrantType; label: string; colorClass: string; bgClass: string; desc: string }[] = [
  { id: 'do_now', label: 'DO NOW', colorClass: 'text-red-500', bgClass: 'bg-red-500/10 border-red-500/20', desc: 'Urgent & Important' },
  { id: 'schedule', label: 'SCHEDULE', colorClass: 'text-blue-500', bgClass: 'bg-blue-500/10 border-blue-500/20', desc: 'Important, Not Urgent' },
  { id: 'delegate', label: 'DELEGATE', colorClass: 'text-amber-500', bgClass: 'bg-amber-500/10 border-amber-500/20', desc: 'Urgent, Not Important' },
  { id: 'eliminate', label: 'ELIMINATE', colorClass: 'text-gray-500', bgClass: 'bg-gray-500/10 border-gray-500/20', desc: 'Neither' },
];

function SortableItem({ id, children, isTop20 }: { id: string | number; children: React.ReactNode; isTop20?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing mb-2 touch-none relative ${isTop20 ? 'ring-2 ring-amber-400 shadow-sm rounded-md' : ''}`}
    >
      {children}
    </div>
  );
}

export default function EisenhowerMatrix<T extends MatrixItem>({
  items,
  onQuadrantChange,
  showAutoSort,
  onAutoSort,
  autoSortLoading,
  itemRenderer,
}: EisenhowerMatrixProps<T>) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Memoize and sort items: Top 20% first, then by order_index
  const categorizedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.is_top_20 && !b.is_top_20) return -1;
      if (!a.is_top_20 && b.is_top_20) return 1;
      return (a.order_index || 0) - (b.order_index || 0);
    });
    
    return {
      do_now: sorted.filter((i) => i.quadrant === 'do_now'),
      schedule: sorted.filter((i) => i.quadrant === 'schedule'),
      delegate: sorted.filter((i) => i.quadrant === 'delegate'),
      eliminate: sorted.filter((i) => i.quadrant === 'eliminate'),
      unassigned: sorted.filter((i) => !i.quadrant),
    };
  }, [items]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = active.id.toString();
    const overIdStr = over.id.toString();

    const activeItem = items.find((i) => i.id.toString() === activeIdStr);
    if (!activeItem) return;

    // Check if dropping on a quadrant container directly
    const overQuadrantObj = QUADRANTS.find((q) => q.id === overIdStr);
    if (overQuadrantObj) {
      if (activeItem.quadrant !== overQuadrantObj.id) {
        onQuadrantChange(activeItem.id, overQuadrantObj.id);
      }
      return;
    }

    // Dropping on another item
    const overItem = items.find((i) => i.id.toString() === overIdStr);
    if (overItem && overItem.quadrant) {
      const activeQuadrant = activeItem.quadrant;
      const overQuadrant = overItem.quadrant;

      if (activeQuadrant !== overQuadrant) {
        // Moving to a different quadrant
        onQuadrantChange(activeItem.id, overQuadrant);
      } else {
        // Reordering in the same quadrant
        const quadItems = categorizedItems[activeQuadrant];
        const oldIndex = quadItems.findIndex((i) => i.id.toString() === activeIdStr);
        const newIndex = quadItems.findIndex((i) => i.id.toString() === overIdStr);
        if (oldIndex !== newIndex) {
          onQuadrantChange(activeItem.id, activeQuadrant, newIndex);
        }
      }
    }
  };

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return items.find((i) => i.id.toString() === activeId);
  }, [activeId, items]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold text-lg text-foreground flex items-center gap-2">
          🟦 Eisenhower Matrix
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
            Auto-Sort All
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">
          {QUADRANTS.map((quad) => {
            const quadItems = categorizedItems[quad.id];
            return (
              <div
                key={quad.id}
                className={`flex flex-col rounded-xl border ${quad.bgClass} overflow-hidden`}
              >
                {/* Quadrant Header */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-border/10 bg-black/5 dark:bg-white/5 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-xs uppercase tracking-wider ${quad.colorClass}`}>
                      {quad.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                      {quadItems.length}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground uppercase opacity-70">
                    {quad.desc}
                  </span>
                </div>

                {/* Droppable Area */}
                <div className="flex-1 p-2 overflow-y-auto scrollbar-clean min-h-[150px]">
                  <SortableContext
                    id={quad.id}
                    items={quadItems.map((i) => i.id.toString())}
                    strategy={rectSortingStrategy}
                  >
                    {quadItems.length > 0 ? (
                      quadItems.map((item) => (
                        <SortableItem key={item.id} id={item.id} isTop20={item.is_top_20}>
                          {itemRenderer(item)}
                        </SortableItem>
                      ))
                    ) : (
                      <div className="h-full flex items-center justify-center opacity-50">
                        <p className="text-xs font-medium italic text-muted-foreground text-center px-4">
                          Drag {quad.label.toLowerCase()} tasks here
                        </p>
                      </div>
                    )}
                  </SortableContext>
                </div>
              </div>
            );
          })}
        </div>

        {/* Unassigned Area (if any) */}
        {categorizedItems.unassigned.length > 0 && (
          <div className="mt-2 p-3 rounded-xl border border-dashed border-border bg-muted/30">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              ⚠️ Unassigned Tasks
              <span className="bg-muted px-1.5 rounded">{categorizedItems.unassigned.length}</span>
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-clean">
              <SortableContext
                id="unassigned"
                items={categorizedItems.unassigned.map((i) => i.id.toString())}
                strategy={rectSortingStrategy}
              >
                {categorizedItems.unassigned.map((item) => (
                  <div key={item.id} className="min-w-[200px] flex-shrink-0">
                    <SortableItem id={item.id} isTop20={item.is_top_20}>
                      {itemRenderer(item)}
                    </SortableItem>
                  </div>
                ))}
              </SortableContext>
            </div>
          </div>
        )}

        <DragOverlay>
          {activeItem ? (
            <div className={`rotate-2 scale-105 shadow-xl ${activeItem.is_top_20 ? 'ring-2 ring-amber-400 rounded-md' : ''}`}>
              {itemRenderer(activeItem, true)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
