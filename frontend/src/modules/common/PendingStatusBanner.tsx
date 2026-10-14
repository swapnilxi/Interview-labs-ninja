'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Rendered app-wide (see frontend/src/app/layout.tsx) so a pending/rejected account can't miss why every action is 403ing — the backend blocks everything except /auth/me for
 * these two states (see backend/modules/auth/dependencies.py: get_current_active_user).
 *
 * Layout: a strip fixed directly under the 60px app header (it used to sit in the page flow at the
 * very top, where the fixed header drew over it and every `h-screen` page was pushed down and
 * clipped). Its height is published as `--app-banner-h` on <html>; `body` pads by that much
 * (tailwind.css), so normal pages start below the strip, and full-height shells (`.h-app-screen`,
 * `.lab-shell`) subtract it. With no banner the variable is unset and nothing changes.
 */
export default function PendingStatusBanner() {
  const { user } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const status = user?.status;
  const visible = !!status && status !== 'approved';

  useEffect(() => {
    if (!visible) return;
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--app-banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish); // wraps to more lines on narrow screens
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--app-banner-h');
    };
  }, [visible]);

  if (!visible) return null;

  const isPending = status === 'pending';

  return (
    <div
      ref={ref}
      role="alert"
      className={`app-banner ${isPending ? 'app-banner-warning' : 'app-banner-error'}`}
    >
      {isPending
        ? 'Your account is pending admin approval. You can look around, but most actions are disabled until an admin approves it.'
        : 'Your account was not approved. Contact an admin if you believe this is a mistake.'}
    </div>
  );
}
