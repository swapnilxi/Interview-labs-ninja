'use client';

import { useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';

/**
 * Props for a native `<select>` that does not act on every key press.
 *
 * Windows and Linux Chrome / Edge and Firefox change a CLOSED select's value, and fire `change`, on every ArrowUp /
 * ArrowDown (and type-ahead letter). A select that moves a question or scrolls the page on `change` therefore acts after
 * the first arrow press and, because the question's row remounts elsewhere, takes the focus with it (WCAG 3.2.2: a change
 * of context on input). Screen-reader users arrow through selects without opening them, so they hit this constantly.
 *
 * Here a change that arrives while a key is held down is only a preview: it shows in the select and is committed when the
 * learner presses Enter, or leaves the select (`commitOnBlur`, default true; Escape drops it). A change that arrives
 * without a key press is a deliberate pick and commits at once: a click on an option of the opened list, the phone's
 * native picker, an Enter inside the opened list, `selectOption` in a test.
 *
 * `value` is the committed value; `onCommit(next, select)` runs once per decision, only when `next !== value`.
 */
export function useSettledSelect(
  value: string,
  onCommit: (next: string, select: HTMLSelectElement) => void,
  { commitOnBlur = true }: { commitOnBlur?: boolean } = {}
) {
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const keyDown = useRef(false);

  const hold = (next: string | null) => {
    pendingRef.current = next;
    setPending(next);
  };
  const settle = (select: HTMLSelectElement, commit: boolean) => {
    const next = pendingRef.current;
    if (next === null) return;
    hold(null);
    if (commit && next !== value) onCommit(next, select);
  };

  return {
    value: pending ?? value,
    onChange(event: ChangeEvent<HTMLSelectElement>) {
      const next = event.currentTarget.value;
      if (keyDown.current) {
        hold(next === value ? null : next);
        return;
      }
      hold(null);
      if (next !== value) onCommit(next, event.currentTarget);
    },
    onKeyDown(event: KeyboardEvent<HTMLSelectElement>) {
      if (event.key === 'Enter') {
        keyDown.current = false;
        settle(event.currentTarget, true);
      } else if (event.key === 'Escape') {
        keyDown.current = false;
        settle(event.currentTarget, false);
      } else if (
        event.key !== 'Tab' &&
        event.key !== ' ' &&
        event.key !== 'Shift' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        keyDown.current = true; // arrows, Home / End, type-ahead: the `change` that follows is a preview
      }
    },
    onKeyUp() {
      keyDown.current = false;
    },
    onBlur(event: FocusEvent<HTMLSelectElement>) {
      keyDown.current = false;
      settle(event.currentTarget, commitOnBlur);
    },
  };
}
