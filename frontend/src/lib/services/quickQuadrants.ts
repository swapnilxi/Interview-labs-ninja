/**
 * Quadrant vocabulary for Quick Daily. A leaf module (no imports) so the guest-mode adapters and the
 * service can both use the value without an import cycle.
 *
 * A quick task starts "unsorted": captured, but not yet placed in an Eisenhower quadrant. It is a plain
 * string rather than NULL so every server version agrees on it — an older backend that only knows the
 * four quadrants still stores it, and a `null` create would be a 422 there. The matrix shows unsorted
 * tasks in its "Unassigned" tray (it maps this value to `null`).
 * Python twin: UNSORTED / QUADRANTS in backend/modules/ai_todo/quick/db.py; Next.js twin: quick/db.ts.
 */

export type QuadrantType = 'do_now' | 'schedule' | 'delegate' | 'eliminate';

export const UNSORTED = 'unsorted' as const;

export type QuickQuadrant = QuadrantType | typeof UNSORTED;

export const QUADRANT_IDS: readonly QuadrantType[] = [
  'do_now',
  'schedule',
  'delegate',
  'eliminate',
];

/** A stored quadrant → the matrix's: unsorted (and legacy null) become `null`, the "Unassigned" tray. */
export function toMatrixQuadrant(quadrant: QuickQuadrant | null | undefined): QuadrantType | null {
  return quadrant && quadrant !== UNSORTED ? quadrant : null;
}
