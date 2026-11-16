'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasNotification, notify } from '@/lib/ui/notifications';
import { lmsService } from '../services/lmsService';
import type { LmsInboxItem } from '../types';

/**
 * Brings the updates an instructor or admin sent to your classes (or to all of AI LMS) into the notification
 * centre. Mounted once by NotificationHost, so it runs on every page while someone is logged in.
 *
 * It asks the server for what is new after a cursor (GET /api/lms/notifications): when you log in, every minute
 * while the tab is visible, and whenever the tab comes back to the front. Each new update becomes a centre entry
 * (source "ai-lms") with a toast and, when the tab is in the background and you allowed it, a device notification.
 * With the app closed, an update reaches a phone or browser through the server's push instead (Next.js layer only).
 *
 * The cursor is kept per user in localStorage. The very first sync on a device has no cursor and is silent: the last
 * few days land in the centre without a toast or a device notification each.
 */

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
/** Do not re-ask within this long of the last answer (a tab flicking between visible and hidden). */
const MIN_GAP_MS = 10_000;
/** More than one page is possible after a long absence; stop at this many so one sync stays small. */
const MAX_PAGES = 5;
const PAGE_SIZE = 20;

const cursorKey = (userId: number) => `labninja.lms_notif_cursor.v1:${userId}`;

function readCursor(userId: number): number | null {
  try {
    const raw = localStorage.getItem(cursorKey(userId));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function writeCursor(userId: number, cursor: number) {
  try {
    localStorage.setItem(cursorKey(userId), String(cursor));
  } catch {
    /* private mode / quota: the next sync is "first" again, which is silent and skips what is already in the centre */
  }
}

/** What the centre shows: a class update says which class it is from, a module-wide one stands on its own. */
export function updateTitle(item: Pick<LmsInboxItem, 'scope' | 'class_name' | 'title'>): string {
  return item.scope === 'class' && item.class_name ? `${item.class_name}: ${item.title}` : item.title;
}

export function useLmsNotificationSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // A pending or rejected account is refused by every LMS call: nothing to ask for.
  const allowed = userId !== null && (user?.status === undefined || user.status === 'approved');

  useEffect(() => {
    if (!allowed || userId === null) return;
    let stopped = false;
    let running = false;
    let failures = 0;
    let lastRun = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (running || stopped) return;
      running = true;
      lastRun = Date.now();
      try {
        const stored = readCursor(userId);
        const silent = stored === null;
        let after: number | undefined = stored ?? undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const inbox = await lmsService.getNotificationInbox(after, PAGE_SIZE);
          if (stopped) return;
          for (const item of inbox.items) {
            const dedupeKey = `lms-update-${item.id}`;
            // Already in the centre (the cursor was lost): leave it as it is, read or not.
            if (hasNotification(dedupeKey)) continue;
            notify({
              source: 'ai-lms',
              tone: 'info',
              title: updateTitle(item),
              body: item.body || undefined,
              href: item.link,
              dedupeKey,
              toast: !silent,
              browser: !silent,
            });
          }
          writeCursor(userId, inbox.cursor);
          // First sync is one answer (the recent days); after that, keep going while pages come back full.
          if (silent || inbox.items.length < PAGE_SIZE) break;
          after = inbox.cursor;
        }
        failures = 0;
      } catch {
        failures += 1; // never throws: an offline tab or a down server just tries again later
      } finally {
        running = false;
      }
    };

    const next = () => {
      if (stopped) return;
      const delay = failures === 0 ? POLL_MS : Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (document.visibilityState === 'visible') await sync();
      next();
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRun < MIN_GAP_MS) return;
      void sync();
    };

    // First look shortly after login, once the page has settled.
    timer = setTimeout(tick, 1500);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [allowed, userId]);
}
