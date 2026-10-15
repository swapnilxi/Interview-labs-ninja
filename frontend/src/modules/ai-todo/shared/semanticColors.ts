import type { TaskPriority, TaskStatus } from '@/lib/services/todoService';

/**
 * Which palette colour means what in the To-Do UI, in one place. Rows, filter chips, menus and the matrix all read
 * these, so the same state is the same colour everywhere (and never only a colour: every use sits next to a label).
 *
 *   blue   progress / active work      → in progress
 *   green  completed / success         → done
 *   coral  critical / overdue / error  → P1, not done
 *   amber  warning / intermediate      → P2 (P3 is a softer amber), delayed
 *   violet is the primary action / selected / focus colour and is not a status colour.
 *   Depth colours (L1 … L5+) are structural and live in todoService (DEPTH_COLORS); they are never used for status.
 *
 * Colours are CSS variables (set in styles/tailwind.css), not hex, so they follow the theme and still resolve inside
 * menus and dialogs that portal to <body>.
 */

const MUTED_DOT = 'color-mix(in srgb, var(--color-muted-foreground) 65%, transparent)';

/** Dot colour for a status. */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: MUTED_DOT,
  in_progress: 'var(--color-progress)',
  delayed: 'var(--color-warning)',
  done: 'var(--color-success)',
  not_done: 'var(--color-error)',
};

/** Label colour for a status. The default (backlog) stays neutral so a plain list is plain. */
export const STATUS_TEXT: Record<TaskStatus, string> = {
  backlog: 'text-muted-foreground',
  in_progress: 'mix-text-progress',
  delayed: 'text-warning',
  done: 'text-success',
  not_done: 'text-error',
};

/** Dot colour for a priority: only P1 and P2 carry a strong colour; P3 is a softer amber and P4 is neutral. */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  p1: 'var(--color-error)',
  p2: 'var(--color-warning)',
  p3: 'color-mix(in srgb, var(--color-warning) 50%, transparent)',
  p4: MUTED_DOT,
};

/** Label colour for a priority. */
export const PRIORITY_TEXT: Record<TaskPriority, string> = {
  p1: 'text-error',
  p2: 'text-warning',
  p3: 'text-muted-foreground',
  p4: 'text-muted-foreground',
};
