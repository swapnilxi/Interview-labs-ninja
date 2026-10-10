/**
 * Shared motion constants and helpers so every animated ai-bootcamp component
 * uses the same easing family and honours the user's reduced-motion
 * preference. Ported verbatim from AI-Bootcamp-reference's `lib/motion.ts`.
 */

/** Expo-style ease-out used across Framer Motion transitions (matches `--ab-ease-out` in CSS). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** True when the visitor asked the OS for less motion. Safe to call during SSR. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** True for mouse/trackpad users, where hover-driven effects make sense. */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(FINE_POINTER_QUERY).matches;
}
