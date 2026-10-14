/**
 * Tiny toast store. Plain module (no React) so services can report a failed save without
 * knowing about any component; `components/ui/ToastHost.tsx` renders whatever is in here.
 * Nothing is shown unless a ToastHost is mounted (the To-Do page mounts one).
 */

export type ToastTone = 'error' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** How long it stays up, in ms. Errors default to longer than confirmations. */
  duration?: number;
  /** Optional button, e.g. "Undo". The toast dismisses itself after it is clicked. */
  action?: ToastAction;
}

export interface ToastItem {
  id: number;
  /** Bumped when an identical toast is shown again, so its dismiss timer restarts. */
  stamp: number;
  tone: ToastTone;
  message: string;
  duration: number;
  action?: ToastAction;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION: Record<ToastTone, number> = { error: 6500, success: 3500, info: 4500 };

let items: ToastItem[] = [];
let counter = 0;
let hosts = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable between changes, as `useSyncExternalStore` requires. */
export function getToasts(): ToastItem[] {
  return items;
}

/**
 * A ToastHost registers itself while mounted. With no host there is nobody to show a toast to, and
 * keeping it would make it pop up — stale — the next time a page mounts one. When the last host goes
 * away its toasts are dropped for the same reason (their timers only run while they are on screen).
 */
export function attachToastHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0 && items.length > 0) {
      items = [];
      emit();
    }
  };
}

function show(message: string, tone: ToastTone, options: ToastOptions = {}): number {
  if (hosts === 0) return -1;
  const duration = options.duration ?? DEFAULT_DURATION[tone];
  const existing = items.find((item) => item.tone === tone && item.message === message);
  if (existing) {
    // The same failure repeating (offline, three quick edits) shouldn't stack up.
    items = items.map((item) =>
      item.id === existing.id
        ? { ...item, stamp: item.stamp + 1, duration, action: options.action }
        : item
    );
    emit();
    return existing.id;
  }
  const id = ++counter;
  items = [...items, { id, stamp: 0, tone, message, duration, action: options.action }].slice(
    -MAX_VISIBLE
  );
  emit();
  return id;
}

function dismiss(id: number): void {
  if (!items.some((item) => item.id === id)) return;
  items = items.filter((item) => item.id !== id);
  emit();
}

export const toast = {
  error: (message: string, options?: ToastOptions) => show(message, 'error', options),
  success: (message: string, options?: ToastOptions) => show(message, 'success', options),
  info: (message: string, options?: ToastOptions) => show(message, 'info', options),
  dismiss,
};
