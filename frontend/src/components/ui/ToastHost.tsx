'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';
import { attachToastHost, getToasts, subscribeToasts, toast, type ToastItem } from '@/lib/ui/toast';

/**
 * Renders the toast store (`lib/ui/toast.ts`). Mount it once per page that wants toasts.
 *
 * Bottom-centre, above the safe-area inset. On phones it is lifted above the row of corner FABs
 * (see `.todo-toast-host`); on wider screens it sits between them, clear of the Copilot column.
 * Tagged `data-overlay-safe` so an open dialog doesn't make it `inert` (an error raised from
 * inside a dialog must stay readable and its Undo/dismiss buttons clickable).
 */

const NO_TOASTS: ToastItem[] = [];

const TONE_ICON: Record<ToastItem['tone'], { name: string; className: string }> = {
  error: { name: 'ExclamationCircleIcon', className: 'text-error' },
  success: { name: 'CheckCircleIcon', className: 'text-success' },
  info: { name: 'InformationCircleIcon', className: 'text-primary' },
};

function ToastView({ item }: { item: ToastItem }) {
  // Hovering or focusing a toast pauses its timer so there's time to read it / reach "Undo".
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => toast.dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.duration, item.stamp]);

  const icon = TONE_ICON[item.tone];

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      data-tone={item.tone}
      className="todo-toast pointer-events-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon
        name={icon.name}
        size={18}
        variant="solid"
        className={`mt-px shrink-0 ${icon.className}`}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 break-words leading-snug">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            toast.dismiss(item.id);
          }}
          className="todo-focus shrink-0 rounded px-1 font-semibold text-primary hover:underline"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        className="todo-focus -mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <Icon name="XMarkIcon" size={14} />
      </button>
    </div>
  );
}

export default function ToastHost() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => NO_TOASTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return attachToastHost();
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      data-overlay-safe=""
      role="region"
      aria-label="Notifications"
      className="todo-toast-host pointer-events-none fixed inset-x-0 z-[300] flex flex-col items-center gap-2 px-4"
    >
      {items.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </div>,
    document.body
  );
}
