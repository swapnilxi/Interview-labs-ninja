/**
 * Promise-based confirmation, so a call site changes from
 *   if (!confirm('Delete it?')) return;
 * to
 *   if (!(await confirmDialog({ title: 'Delete it?', confirmLabel: 'Delete', tone: 'danger' }))) return;
 *
 * A plain module (no React), like `toast.ts`; `components/ui/ConfirmHost.tsx` renders the pending
 * request. With no host mounted it falls back to the browser's `confirm()`, so a caller never silently
 * proceeds or silently cancels. Requests made while one is showing wait their turn.
 */

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: string;
  /** A softer extra line, e.g. "You already ran this today, so the result may be similar." */
  note?: string;
  /** Default "Continue". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** `danger` styles the confirm button red and puts initial focus on Cancel. */
  tone?: 'default' | 'danger';
}

export interface PendingConfirm extends ConfirmOptions {
  id: number;
}

interface Entry {
  request: PendingConfirm;
  resolve: (confirmed: boolean) => void;
}

let queue: Entry[] = [];
let counter = 0;
let hosts = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The request being shown (the head of the queue). Stable between changes, as `useSyncExternalStore` requires. */
export function getPendingConfirm(): PendingConfirm | null {
  return queue[0]?.request ?? null;
}

/**
 * A ConfirmHost registers itself while mounted. When the last one goes away (the page was left) every
 * waiting request is answered "no" — never "yes" — so no promise is left hanging.
 */
export function attachConfirmHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0 && queue.length > 0) {
      const dropped = queue;
      queue = [];
      emit();
      dropped.forEach((entry) => entry.resolve(false));
    }
  };
}

/** Answer the request with `id`. Ignored if it was already answered (a double click). */
export function resolveConfirm(id: number, confirmed: boolean): void {
  const index = queue.findIndex((entry) => entry.request.id === id);
  if (index === -1) return;
  const [entry] = queue.splice(index, 1);
  emit();
  entry.resolve(confirmed);
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (hosts === 0) {
    const text = [options.title, options.message, options.note].filter(Boolean).join('\n\n');
    return Promise.resolve(window.confirm(text));
  }
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { request: { ...options, id: ++counter }, resolve }];
    emit();
  });
}
