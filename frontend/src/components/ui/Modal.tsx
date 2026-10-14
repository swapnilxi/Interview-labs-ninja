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
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
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

    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      releaseInert();
      releaseScroll();
      popLayer(layerId);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      ref={rootRef}
      data-modal-root=""
      className={`fixed inset-0 z-[200] ${backdropClassName} ${overlayClassName}`}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
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
        {children}
      </div>
    </div>,
    document.body
  );
}
