'use client';

import { useCallback, useRef } from 'react';

/**
 * Drives the cursor-following spotlight on a `.glow-card` by writing
 * `--mouse-x` / `--mouse-y` / `--spotlight-opacity` straight to the DOM node
 * (no React state, so moving the pointer never triggers a re-render).
 * Only mouse/pen pointers engage it — touch leaves the card's resting
 * (non-interactive) styles untouched.
 */
export function useGlowSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const rafRef = useRef<number | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const node = ref.current;
    const point = pending.current;
    if (!node || !point) return;
    node.style.setProperty('--mouse-x', `${point.x}%`);
    node.style.setProperty('--mouse-y', `${point.y}%`);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.pointerType === 'touch') return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      pending.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const onPointerEnter = useCallback((e: React.PointerEvent<T>) => {
    if (e.pointerType === 'touch') return;
    ref.current?.style.setProperty('--spotlight-opacity', '1');
  }, []);

  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--spotlight-opacity', '0');
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  return { ref, onPointerMove, onPointerEnter, onPointerLeave };
}
