'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { LMS_TOOLBAR_BTN } from './toolbarStyles';

type Target = 'class' | 'landing';

interface ShareClassButtonProps {
  classSlug: string;
  /** The class's display name, shown in the dialog. */
  className: string;
}

const TARGETS: { id: Target; label: string }[] = [
  { id: 'class', label: 'Class page' },
  { id: 'landing', label: 'Landing page' },
];

/** The absolute link people open. The page behind it is login-only, so a guest is sent to /login?next=<this path>. */
function shareUrl(slug: string, target: Target): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/ai-lms/classes/${encodeURIComponent(slug)}${target === 'landing' ? '/landing' : ''}`;
}

/** Clipboard API where the page is a secure context; otherwise select the field and use the old copy command. */
async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied or insecure context: fall through */
  }
  try {
    if (field) {
      field.focus();
      field.select();
      return document.execCommand('copy');
    }
  } catch {
    /* nothing left to try: the field stays selected so the person can copy by hand */
  }
  return false;
}

/**
 * Share control of the class page: a button that opens a dialog with the class link to copy (or hand to the phone's
 * share sheet). Classes are shared content, so there is nothing to switch on: every signed-in user can already open
 * the link, and a visitor who is not signed in is sent to the login screen and then back to the page.
 */
export default function ShareClassButton({ classSlug, className }: ShareClassButtonProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>('class');
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const url = shareUrl(classSlug, target);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStatus('idle');
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    // The link is the one thing to act on: focus and select it, so Ctrl/Cmd+C works at once.
    const raf = requestAnimationFrame(() => {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const handleCopy = async () => {
    const ok = await copyText(url, fieldRef.current);
    setStatus(ok ? 'copied' : 'failed');
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus('idle'), 2500);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: `${className} on LabNinja`, url });
    } catch {
      /* dismissed the share sheet: nothing to report */
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={LMS_TOOLBAR_BTN}
      >
        <Icon name="ShareIcon" size={14} />
        <span>Share</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-class-title"
            className="w-full max-w-md rounded-xl border border-border bg-card p-[1.5rem] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 text-primary mix-bg-primary/10">
                  <Icon name="ShareIcon" size={20} />
                </div>
                <div>
                  <h3
                    id="share-class-title"
                    className="font-heading text-lg font-semibold text-foreground"
                  >
                    Share this class
                  </h3>
                  <p className="text-xs text-muted-foreground">{className}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon name="XMarkIcon" size={20} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div
                role="group"
                aria-label="What the link opens"
                className="inline-flex rounded-lg border border-border bg-muted p-0.5"
              >
                {TARGETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={target === t.id}
                    onClick={() => {
                      setTarget(t.id);
                      setStatus('idle');
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      target === t.id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={fieldRef}
                  readOnly
                  value={url}
                  aria-label="Class link"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:mix-ring-primary/40"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex h-[2.625rem] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90"
                >
                  <Icon
                    name={status === 'copied' ? 'CheckIcon' : 'ClipboardDocumentIcon'}
                    size={14}
                  />
                  <span>{status === 'copied' ? 'Copied' : 'Copy link'}</span>
                </button>
              </div>

              <p
                role="status"
                aria-live="polite"
                className="min-h-[1rem] text-xs text-muted-foreground"
              >
                {status === 'failed'
                  ? 'Your browser blocked copying. The link is selected, so press Ctrl+C (Cmd+C on Mac).'
                  : ''}
              </p>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Anyone with a LabNinja account can open this link. If they are not logged in yet,
                they are asked to log in first and then land on this page.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              {canNativeShare && (
                <button type="button" onClick={handleNativeShare} className={LMS_TOOLBAR_BTN}>
                  <Icon name="ArrowUpOnSquareIcon" size={14} />
                  <span>Share to an app</span>
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
