/**
 * Drag-and-drop plumbing for the week organizer (dnd-kit core 6 + sortable 10).
 *
 * Three kinds of ids live in one DndContext, so they are prefixed and never collide with a topic id:
 *  - containers: `queue` (the question queue) and `week:N` (a week's card list),
 *  - question cards: `card:<topic id>`,
 *  - whole weeks (reordered by their header grip): `wk:N`, in an outer SortableContext.
 * Every draggable / droppable carries `data.kind` ('card' | 'week' | 'container') so the collision
 * detection and the handlers can branch without parsing.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SortingStrategy } from '@dnd-kit/sortable';

export const QUEUE_ID = 'queue';

export type DragKind = 'card' | 'week';
export type DndKind = DragKind | 'container';

export const weekContainerId = (week: number) => `week:${week}`;
export const weekSortId = (week: number) => `wk:${week}`;
export const cardId = (topicId: string) => `card:${topicId}`;

/** Week number of a `week:N` container id (null for anything else). */
export function weekOfContainer(id: string): number | null {
  if (!id.startsWith('week:')) return null;
  const n = Number(id.slice(5));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Week number of a `wk:N` sortable id (null for anything else). */
export function weekOfSortId(id: string): number | null {
  if (!id.startsWith('wk:')) return null;
  const n = Number(id.slice(3));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Topic id of a `card:<id>` draggable id (null for anything else). */
export function topicOfCard(id: string): string | null {
  return id.startsWith('card:') ? id.slice(5) : null;
}

/** Card lists by container id (`queue`, `week:1` …), holding `card:<id>` ids. */
export type Containers = Record<string, string[]>;

/** The container an id belongs to: itself for a container id, else the container listing that card. */
export function findContainer(id: string, containers: Containers): string | null {
  if (Object.prototype.hasOwnProperty.call(containers, id)) return id;
  for (const key of Object.keys(containers)) if (containers[key].includes(id)) return key;
  return null;
}

/**
 * The queue is a bin, not a sequence (it is sorted by the panel's sort select), so its cards never
 * shift out of the way while something is dragged over them.
 */
export const noShiftStrategy: SortingStrategy = () => null;

/** True while the learner is typing somewhere (undo shortcuts and drag keys must leave that alone). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * dnd-kit's keyboard sensor reacts to Space / Enter keydowns that bubble up from anywhere inside the
 * activator, including dialogs rendered through a portal (React events bubble through portals). Only
 * start a keyboard drag when the grip itself has focus (same guard as components/ui/EisenhowerMatrix).
 */
export function guardKeyDown(
  listeners: Record<string, unknown> | undefined
): Record<string, unknown> {
  const { onKeyDown, ...rest } = (listeners ?? {}) as Record<string, unknown> & {
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  return {
    ...rest,
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) onKeyDown?.(event);
    },
  };
}
