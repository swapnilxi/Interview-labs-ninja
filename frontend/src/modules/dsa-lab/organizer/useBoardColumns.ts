'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/** Narrowest a week column may get before the board drops to fewer columns. */
const MIN_COLUMN_PX = 240;
const GAP_PX = 16;

/**
 * How many week columns fit across the board: 4 (a whole block in one row), 2 or 1. Measured from the
 * board's own width rather than the viewport, because the queue panel beside it takes 18rem (20rem from
 * `xl`): four columns of at least 15rem need about 1,010px, which a 1440px screen has next to the queue.
 */
export function useBoardColumns(ref: RefObject<HTMLElement | null>, enabled = true): 1 | 2 | 4 {
  const [columns, setColumns] = useState<1 | 2 | 4>(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const measure = () => {
      const width = el.clientWidth;
      const next =
        width >= MIN_COLUMN_PX * 4 + GAP_PX * 3 ? 4 : width >= MIN_COLUMN_PX * 2 + GAP_PX ? 2 : 1;
      setColumns((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return columns;
}
