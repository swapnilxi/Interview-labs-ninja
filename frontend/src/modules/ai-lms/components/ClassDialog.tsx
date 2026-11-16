'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';

/**
 * The dialog shell of the class page's own dialogs (practice reminders, send update): the look of the other AI LMS
 * modals (CreateSubjectModal, ManualLessonModal: dark overlay, `bg-card border border-border rounded-xl shadow-2xl`,
 * icon tile, close button), plus what those leave out: it is a real dialog (role, aria-modal, labelled), Escape and a
 * click on the backdrop close it, focus goes to the first field when it opens and back to the button that opened it
 * when it closes, Tab stays inside, and the page behind does not scroll. It portals to <body> so no ancestor's
 * transform can move it. On a phone it is full width and scrolls inside itself.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ClassDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Heroicon name for the tile in the header. */
  icon: string;
  /** Keeps Escape and the backdrop from closing it while something is being saved. */
  busy?: boolean;
  children: React.ReactNode;
  /** Right-aligned row under the content. */
  footer?: React.ReactNode;
}

export default function ClassDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  busy = false,
  children,
  footer,
}: ClassDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    // First field, not the close button, so typing can start at once.
    const focusFirst = () => {
      const fields = panel?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      (fields?.[0] ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl focus:outline-none sm:max-h-[90vh] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-[1.25rem] py-[1rem] sm:px-[1.5rem]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border mix-border-primary/20 mix-bg-primary/10 text-primary">
              <Icon name={icon} size={20} />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="font-heading break-words text-lg font-semibold leading-snug text-foreground">
                {title}
              </h2>
              {subtitle && <p className="break-words text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-[1.25rem] sm:px-[1.5rem]">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-[1.25rem] py-[0.875rem] [padding-bottom:max(0.875rem,env(safe-area-inset-bottom))] sm:px-[1.5rem]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The one text-field look inside these dialogs: 44px tall, the theme's input colours, a visible focus ring. */
export const DIALOG_FIELD =
  'min-h-[2.75rem] w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

/** Buttons in a dialog footer (44px tall, like the fields). */
export const DIALOG_BTN =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export const DIALOG_BTN_PRIMARY =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
