/**
 * fe-apis/todo/quick/autoSort.ts
 *
 * Pure helpers for `POST /todo/quick-tasks/eisenhower-auto` (no AI, no database — easy to test; it
 * imports nothing on purpose). Port of backend/modules/ai_todo/quick/auto_sort.py — keep the two in sync.
 */

type Row = Record<string, any>;

/**
 * A quick task starts "unsorted": captured, not yet placed in an Eisenhower quadrant. A plain string (not
 * NULL) so every server version and the guest adapter agree on it.
 */
export const UNSORTED = 'unsorted';
export const QUADRANTS: readonly string[] = ['do_now', 'schedule', 'delegate', 'eliminate'];

/**
 * Which tasks the AI should sort: the ones still unsorted, so a quadrant you picked yourself is never
 * overwritten. Only when nothing is unsorted (an all-sorted day, or tasks from before "unsorted" existed)
 * is everything sorted again, so the button still does something.
 */
export function pickTasksToSort(undone: Row[]): Row[] {
  const unsorted = undone.filter((t) => (t.quadrant || UNSORTED) === UNSORTED);
  return unsorted.length ? unsorted : undone;
}

/**
 * Keep only what is safe to write back: ids we asked about, and real quadrants. Never lets the model
 * write "unsorted" or free text, or touch a task it was not shown. Ids are coerced to int because
 * models sometimes answer "5" for 5.
 */
export function cleanAssignments(assignments: unknown, toSort: Row[]): Row[] {
  const asked = new Set(toSort.map((t) => Number(t.id)));
  if (!Array.isArray(assignments)) return [];
  return assignments.flatMap((a): Row[] => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return [];
    const raw = (a as Row).task_id;
    const taskId =
      typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
    return Number.isInteger(taskId) && asked.has(taskId) && QUADRANTS.includes((a as Row).quadrant)
      ? [{ ...(a as Row), task_id: taskId }]
      : [];
  });
}
