import type { QuickQuadrant } from '@/lib/services/quickQuadrants';

/** How a Quick Daily quadrant is named and coloured in the quadrant chip and its menu. */
export interface QuadrantMeta {
  label: string;
  hint: string;
  /** Tailwind background class for the little colour dot. */
  dot: string;
}

export const QUADRANT_META: Record<QuickQuadrant, QuadrantMeta> = {
  do_now: { label: 'Do now', hint: 'Urgent and important', dot: 'bg-red-500' },
  schedule: { label: 'Schedule', hint: 'Important, not urgent', dot: 'bg-blue-500' },
  delegate: { label: 'Delegate', hint: 'Urgent, not important', dot: 'bg-amber-500' },
  eliminate: { label: 'Eliminate', hint: 'Neither — consider dropping', dot: 'bg-gray-400' },
  unsorted: { label: 'Unsorted', hint: 'Decide later', dot: 'bg-slate-400' },
};

/** Menu order: the four quadrants, then "decide later". */
export const QUADRANT_ORDER: QuickQuadrant[] = [
  'do_now',
  'schedule',
  'delegate',
  'eliminate',
  'unsorted',
];
