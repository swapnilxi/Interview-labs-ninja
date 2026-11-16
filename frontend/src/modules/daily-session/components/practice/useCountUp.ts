'use client';

import { useEffect, useState } from 'react';

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from `from` up to `target` once (straight to it under reduced motion). */
export function useCountUp(target: number, ms = 700, from = 0) {
  const [v, setV] = useState(() => (reducedMotion() ? target : from));
  useEffect(() => {
    if (reducedMotion()) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, from]);
  return v;
}

/**
 * A value that starts at `from` and moves to `target` on the next frame, so a CSS transition (a ring's dash offset,
 * a bar's width) animates in instead of appearing filled.
 */
export function useSettle(target: number, from = 0) {
  const [v, setV] = useState(() => (reducedMotion() ? target : from));
  useEffect(() => {
    // Two frames: the start value must be painted once, or the browser has nothing to transition from.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setV(target));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [target]);
  return v;
}
