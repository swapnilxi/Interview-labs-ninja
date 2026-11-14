'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { toast } from '@/lib/ui/toast';
import {
  browserPermission,
  enableBrowserNotifications,
  getPrefs,
  getServerPrefs,
  sendTestNotification,
  setPrefs,
  subscribeNotifications,
} from '@/lib/ui/notifications';

type DeviceKind = 'iphone-browser' | 'iphone-app' | 'android' | 'desktop';

function detectDevice(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (iOS) {
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches;
    return standalone ? 'iphone-app' : 'iphone-browser';
  }
  return /Android/i.test(ua) ? 'android' : 'desktop';
}

/**
 * "Reminders on this device": whether this phone or computer will actually pop a notification, and the one thing to
 * do if it won't. Links to the step-by-step guide (public/notification-setup.html).
 */
export default function ReminderStatusCard() {
  const prefs = useSyncExternalStore(subscribeNotifications, getPrefs, getServerPrefs);
  const [permission, setPermission] = useState<ReturnType<typeof browserPermission>>('default');
  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(browserPermission());
    setDevice(detectDevice());
  }, []);

  const on = prefs.browser && permission === 'granted';

  const turnOn = async () => {
    setBusy(true);
    const result = await enableBrowserNotifications();
    setPermission(result);
    setPrefs({ todoReminders: true });
    setBusy(false);
    if (result === 'granted') {
      const shown = await sendTestNotification();
      toast.success(shown ? 'Notifications are on. A test one was just sent.' : 'Notifications are on.');
    } else if (result === 'denied') {
      toast.error('Notifications are blocked for this site. The guide shows how to allow them.');
    }
  };

  const test = async () => {
    const shown = await sendTestNotification();
    if (!shown) toast.error('This browser didn’t show it. Check the guide for your device.');
  };

  let state: { tone: 'on' | 'off' | 'warn'; title: string; body: string };
  if (device === 'iphone-browser') {
    state = {
      tone: 'warn',
      title: 'Add to Home Screen first',
      body: 'iPhone shows web notifications only for apps on the Home Screen: tap Share → Add to Home Screen, open it from there, then turn reminders on.',
    };
  } else if (permission === 'unsupported') {
    state = { tone: 'warn', title: 'Not supported here', body: 'This browser can’t show notifications. Reminders still pop up inside the app while it is open.' };
  } else if (permission === 'denied') {
    state = { tone: 'warn', title: 'Blocked for this site', body: 'Allow notifications in the browser’s site settings, then come back.' };
  } else if (on) {
    state = { tone: 'on', title: 'On for this device', body: 'Reminders pop up here at their time while the app is open or in a background tab.' };
  } else {
    state = { tone: 'off', title: 'Off on this device', body: 'Turn on notifications so a reminder reaches you even when you are in another app or tab.' };
  }

  return (
    <div className="rem-status" data-tone={state.tone}>
      <div className="flex items-start gap-3">
        <span className="rem-status-icon" aria-hidden>
          <FlatIcon name="clock" size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Reminders</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{state.title}</p>
        </div>
        <span className="rem-status-dot ml-auto" aria-hidden />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{state.body}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!on && permission !== 'denied' && permission !== 'unsupported' && device !== 'iphone-browser' && (
          <button type="button" onClick={() => void turnOn()} disabled={busy} className="todo-btn todo-btn-primary h-10 px-3.5 text-sm">
            <Icon name="BellAlertIcon" size={16} />
            Turn on notifications
          </button>
        )}
        {on && (
          <button type="button" onClick={() => void test()} className="todo-btn todo-btn-quiet h-10 px-3 text-sm">
            <Icon name="PaperAirplaneIcon" size={15} />
            Send a test
          </button>
        )}
        <a href="/notification-setup.html" target="_blank" rel="noopener" className="todo-btn todo-btn-ghost h-10 px-3 text-sm">
          <Icon name="DevicePhoneMobileIcon" size={16} />
          Phone setup guide
        </a>
      </div>

      <div className="rem-tip">
        <FlatIcon name="calendar" size={18} />
        <p>
          <span className="font-semibold text-foreground">App closed?</span> Phones pause web apps in the background. For a must-not-miss
          reminder, open the task’s <span className="font-medium text-foreground">⋯ → Add to calendar</span> — your phone’s calendar will ring.
        </p>
      </div>

      {!prefs.todoReminders && (
        <button type="button" onClick={() => setPrefs({ todoReminders: true })} className="todo-btn todo-btn-quiet mt-3 h-10 w-full text-sm">
          Task reminders are switched off — turn them back on
        </button>
      )}
    </div>
  );
}

const NUDGE_DISMISSED = 'labninja.reminders.nudge-dismissed';

/**
 * One line under the capture card (below xl, where the side card is far down the page): shown only when there is a
 * reminder to come and this device would not show it as a notification. Dismissed for the rest of the session.
 */
export function NotificationNudge({ hasReminders }: { hasReminders: boolean }) {
  const prefs = useSyncExternalStore(subscribeNotifications, getPrefs, getServerPrefs);
  const [permission, setPermission] = useState<ReturnType<typeof browserPermission>>('default');
  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setPermission(browserPermission());
    setDevice(detectDevice());
    try {
      setDismissed(sessionStorage.getItem(NUDGE_DISMISSED) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const on = prefs.browser && permission === 'granted';
  if (!hasReminders || on || dismissed || permission === 'unsupported') return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(NUDGE_DISMISSED, '1');
    } catch {
      /* fine: hidden for this page view */
    }
  };

  const turnOn = async () => {
    const result = await enableBrowserNotifications();
    setPermission(result);
    if (result === 'granted') {
      const shown = await sendTestNotification();
      toast.success(shown ? 'Notifications are on. A test one was just sent.' : 'Notifications are on.');
    } else if (result === 'denied') {
      toast.error('Notifications are blocked for this site. The guide shows how to allow them.');
    }
  };

  return (
    <div className="rem-nudge" role="status">
      <Icon name="BellAlertIcon" size={18} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        {device === 'iphone-browser'
          ? 'On iPhone, reminders arrive as notifications once this app is on your Home Screen.'
          : permission === 'denied'
            ? 'Notifications are blocked for this site, so reminders only show inside the app.'
            : 'Get your reminders as notifications on this device.'}
      </p>
      {device === 'iphone-browser' || permission === 'denied' ? (
        <a
          href={`/notification-setup.html#${device === 'iphone-browser' ? 'iphone' : 'blocked'}`}
          target="_blank"
          rel="noopener"
          className="todo-btn todo-btn-quiet h-9 shrink-0 px-3"
        >
          Show me how
        </a>
      ) : (
        <button type="button" onClick={() => void turnOn()} className="todo-btn todo-btn-primary h-9 shrink-0 px-3">
          Turn on
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Hide this tip" className="todo-btn todo-btn-ghost h-9 w-9 shrink-0 px-0">
        <Icon name="XMarkIcon" size={16} />
      </button>
    </div>
  );
}
