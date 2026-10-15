'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceInput } from './useVoiceInput';
import VoiceMicButton from './VoiceMicButton';

type Target = HTMLTextAreaElement;

// Code/JSON boxes opt out via spellCheck={false}; anything else can opt out with data-no-mic.
const eligible = (el: EventTarget | null): el is Target =>
  el instanceof HTMLTextAreaElement &&
  !el.readOnly &&
  !el.disabled &&
  el.spellcheck !== false &&
  !el.closest('[data-no-mic]') &&
  !el.hasAttribute('data-no-mic');

function insertAtCursor(el: Target, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const sep = before && !/\s$/.test(before) ? ' ' : '';
  const next = before + sep + text + after;
  // Native setter + input event so React-controlled textareas pick up the change.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, next);
  const pos = (before + sep + text).length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Mounted once in the root layout: floats a mic button over whichever textarea has focus
 * and dictates into it. Works with the app's existing controlled textareas unchanged.
 */
export default function GlobalVoiceInput() {
  const [target, setTarget] = useState<Target | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const targetRef = useRef<Target | null>(null);

  const { state, error, toggle, clearError } = useVoiceInput((text) => {
    if (targetRef.current && text) insertAtCursor(targetRef.current, text);
  });
  const busy = state !== 'idle';

  const reposition = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    setPos(visible ? { top: r.bottom - 36, left: r.right - 36 } : null);
  }, []);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (eligible(e.target)) {
        targetRef.current = e.target;
        setTarget(e.target);
        clearError();
        reposition();
      }
    };
    const onFocusOut = () => {
      // Keep the button while recording; otherwise hide after focus truly leaves.
      setTimeout(() => {
        if (busyRef.current) return;
        if (!eligible(document.activeElement)) {
          targetRef.current = null;
          setTarget(null);
          setPos(null);
        }
      }, 150);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    const ro = new ResizeObserver(reposition);
    const id = setInterval(reposition, 500); // catches textarea auto-grow / modal animations
    if (targetRef.current) ro.observe(targetRef.current);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      ro.disconnect();
      clearInterval(id);
    };
  }, [reposition, clearError, target]);

  const busyRef = useRef(false);
  busyRef.current = busy;

  if (!target || !pos) return null;

  return (
    <div style={{ top: pos.top, left: pos.left }} className="fixed z-[1000] flex flex-col items-end">
      {error && (
        <span className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-semibold text-rose-500 shadow-md">
          {error}
        </span>
      )}
      <VoiceMicButton state={state} onClick={toggle} size="sm" className="border border-border bg-card shadow-md" />
    </div>
  );
}
