/**
 * Bookkeeping for stacked overlays (modals, popovers). Client-side only.
 *
 *  - Only the topmost layer reacts to Escape / Tab, so closing a menu that sits on a dialog
 *    doesn't also close the dialog.
 *  - The "rest of the page is inert" state and the body scroll lock are reference-counted, so a
 *    nested overlay closing doesn't undo what the outer one still needs.
 */

let counter = 0;
const stack: number[] = [];

export function pushLayer(): number {
  const id = ++counter;
  stack.push(id);
  return id;
}

export function popLayer(id: number): void {
  const index = stack.indexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

export function isTopLayer(id: number): boolean {
  return stack[stack.length - 1] === id;
}

// ── Page inertness ────────────────────────────────────────────────────────────

const inertCounts = new WeakMap<Element, number>();

/**
 * Marks every top-level child of <body> except `keep` (and anything tagged
 * `data-overlay-safe`, e.g. the toast host) as `inert`, so focus and clicks stay inside the
 * overlay and assistive tech ignores the page behind it. Returns a function that undoes it.
 */
export function inertOthers(keep: Element): () => void {
  const touched: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el === keep || el.hasAttribute('data-overlay-safe')) continue;
    const count = inertCounts.get(el) ?? 0;
    inertCounts.set(el, count + 1);
    if (count === 0) el.setAttribute('inert', '');
    touched.push(el);
  }
  return () => {
    for (const el of touched) {
      const count = (inertCounts.get(el) ?? 1) - 1;
      if (count <= 0) {
        inertCounts.delete(el);
        el.removeAttribute('inert');
      } else {
        inertCounts.set(el, count);
      }
    }
  };
}

// ── Scroll lock ───────────────────────────────────────────────────────────────

let scrollLocks = 0;
let previousOverflow = '';

/** Locks page scroll while an overlay is open (reference-counted). Returns the unlock function. */
export function lockScroll(): () => void {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}
