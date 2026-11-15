'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inertOthers, isTopLayer, lockScroll, popLayer, pushLayer } from '@/lib/ui/layers';

/**
 * The one dialog shell for the To-Do area (modelled on `modules/ai-lms/ui/Modal.tsx`).
 *
 * Why it exists: dialogs used to be rendered inside the task card that opened them. The card's
 * hover `transform` then became the containing block for `position: fixed`, so the "full-screen"
 * overlay shrank to the card's size and its header/close button were clipped. Rendering through a
 * portal to <body> makes that impossible.
 *
 * Handles: portal, role="dialog"/aria-modal, Escape (topmost layer only), backdrop click, focus
 * trap + restore, page-scroll lock, `inert` on the rest of the page, and keeps pointer events
 * inside the dialog from reaching ancestors such as dnd-kit draggables.
 *
 * Initial focus: an element that already took focus (React `autoFocus`) wins, then anything marked
 * `data-autofocus`, otherwise the dialog itself — so opening a details dialog on a phone doesn't
 * pop the keyboard.
 */

const EXIT_MS = 200;

/** Drag-to-dismiss for a bottom sheet (phones only). Returns a function that removes the listeners. */
function attachSheetDrag(panel: HTMLElement, close: () => void): () => void {
  const handles = Array.from(panel.querySelectorAll<HTMLElement>('[data-sheet-grabber], .ios-sheet-head'));
  if (handles.length === 0) return () => {};
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let pointer: number | null = null;

  const onDown = (event: PointerEvent) => {
    if (window.innerWidth >= 640 || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea, [role="tab"]')) return;
    pointer = event.pointerId;
    startY = event.clientY;
    startT = performance.now();
    dy = 0;
    panel.style.transition = 'none';
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    const raw = event.clientY - startY;
    // Down follows the finger; up resists (a sheet does not grow past its height).
    dy = raw > 0 ? raw : raw / 6;
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    pointer = null;
    const velocity = dy / Math.max(1, performance.now() - startT);
    panel.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
    if (dy > 110 || (dy > 24 && velocity > 0.55)) {
      panel.dataset.dragged = 'true';
      panel.style.transform = 'translateY(105%)';
      close();
    } else {
      panel.style.transform = '';
    }
  };

  for (const handle of handles) {
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }
  return () => {
    for (const handle of handles) {
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    }
    // Reopening the same sheet starts from rest.
    window.setTimeout(() => {
      delete panel.dataset.dragged;
      panel.style.transform = '';
      panel.style.transition = '';
    }, EXIT_MS + 20);
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** id of the element that names the dialog (usually its heading). */
  labelledBy?: string;
  /** aria-label, for dialogs without a visible heading to point `labelledBy` at. */
  label?: string;
  /** id of the element that describes the dialog (the question in a confirmation). */
  describedBy?: string;
  /** `alertdialog` for a question that needs an answer (see ConfirmHost); default `dialog`. */
  role?: 'dialog' | 'alertdialog';
  /** Classes for the dialog panel (the `role="dialog"` element). */
  className?: string;
  /** Layout of the full-screen wrapper. Default centres the panel with a 1rem gutter. */
  overlayClassName?: string;
  /** Backdrop dim/blur. */
  backdropClassName?: string;
  /** Turn off for forms with unsaved input, so a stray click outside can't discard it. */
  closeOnBackdrop?: boolean;
  /** Turn off while a save is in flight. */
  closeOnEscape?: boolean;
  /**
   * Phones (< 640px): present the dialog as a bottom sheet (full width, rounded top, slides up), the way iOS presents
   * forms. On by default for `dialog`; an `alertdialog` (a question) stays a centred alert. Panels that are already
   * sheets (`notif-sheet`, `vc-sheet`) are left alone.
   */
  mobileSheet?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  children,
  labelledBy,
  label,
  describedBy,
  role = 'dialog',
  className = '',
  overlayClassName = 'flex items-center justify-center p-4',
  backdropClassName = 'bg-black/60 backdrop-blur-sm',
  closeOnBackdrop = true,
  closeOnEscape = true,
  mobileSheet,
}: ModalProps) {
  const ownSheet = /\b(notif-sheet|vc-sheet)\b/.test(className);
  const asSheet = (mobileSheet ?? role === 'dialog') && !ownSheet;
  // Drag-to-dismiss only where a stray dismissal loses nothing (closeOnBackdrop is turned off for unsaved forms).
  const draggable = asSheet && closeOnBackdrop;
  const [mounted, setMounted] = useState(false);
  // Exit animation: after isOpen turns false the dialog stays on screen for EXIT_MS with data-state="closing". It
  // renders the children captured while it was open, so a parent that clears its data on close (task = null) cannot
  // make a half-closed dialog render with missing props. The layer bookkeeping below is released at once.
  const [closing, setClosing] = useState(false);
  const lastChildrenRef = useRef<React.ReactNode>(children);
  if (isOpen) lastChildrenRef.current = children;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest props, read by listeners that are only (re)subscribed when the dialog opens or closes.
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  // The element that had focus when the dialog was asked to open. It has to be read during render:
  // by the time any effect runs, React's `autoFocus` has already moved focus into the dialog, so
  // focus could never be handed back to the button that opened it.
  const openerRef = useRef<HTMLElement | null>(null);
  if (typeof document !== 'undefined') {
    if (!isOpen) openerRef.current = null;
    else if (openerRef.current === null)
      openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => setMounted(true), []);

  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      setClosing(false);
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const active = isOpen && mounted;

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    const layerId = pushLayer();
    const releaseScroll = lockScroll();
    const releaseInert = inertOthers(root);
    const previouslyFocused = openerRef.current;

    const focusFrame = requestAnimationFrame(() => {
      if (panel.contains(document.activeElement)) return; // something (autoFocus) already took focus
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? panel).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      // A popover handles (and flags) its own Escape first; only the topmost layer reacts.
      if (event.defaultPrevented || !isTopLayer(layerId)) return;

      if (event.key === 'Escape') {
        if (!closeOnEscapeRef.current || event.isComposing) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!panel.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Phones: a bottom sheet can be dragged down by its grabber / title row to dismiss it (pointer events, so the
    // same on Android and iOS). Released past a threshold, or flicked, it closes; otherwise it springs back.
    const detachDrag = panel.querySelector('[data-sheet-grabber], .ios-sheet-head')
      ? attachSheetDrag(panel, () => onCloseRef.current())
      : () => {};

    return () => {
      detachDrag();
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      releaseInert();
      releaseScroll();
      popLayer(layerId);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active]);

  if (!mounted || (!isOpen && !closing)) return null;

  return createPortal(
    <div
      ref={rootRef}
      data-modal-root=""
      data-state={isOpen ? 'open' : 'closing'}
      data-mobile-sheet={asSheet ? '' : undefined}
      aria-hidden={isOpen ? undefined : true}
      className={`fixed inset-0 z-[200] ${backdropClassName} ${overlayClassName} ${isOpen ? '' : 'pointer-events-none'}`}
      onMouseDown={(event) => {
        if (isOpen && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      // Events from a portal still bubble through the React tree to ancestors (e.g. a dnd-kit
      // draggable card that renders this dialog), which would start a drag while you type.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`ui-modal-panel relative outline-none ${className}`}
      >
        {draggable && (
          <div className="ios-sheet-grabber ui-sheet-grabber" data-sheet-grabber="" aria-hidden="true">
            <span />
          </div>
        )}
        {isOpen ? children : lastChildrenRef.current}
      </div>
    </div>,
    document.body
  );
}
