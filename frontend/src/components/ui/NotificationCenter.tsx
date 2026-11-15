'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { isNativeApp, sendNativeTestNotification } from '@/lib/reminders/nativeReminders';
import {
  browserPermission,
  clearNotifications,
  enableBrowserNotifications,
  sendBrowserTestNotification,
  sendTestNotification,
  getNotifications,
  getPrefs,
  getServerNotifications,
  getServerPrefs,
  markAllRead,
  markRead,
  notify,
  removeNotification,
  setPrefs,
  subscribeNotifications,
  unreadCount,
  type NotificationItem,
  type NotificationPrefs,
  type NotificationSource,
  type NotificationTone,
} from '@/lib/ui/notifications';
import { toast } from '@/lib/ui/toast';

/**
 * Bell button + notification sheet. The bell sits in the app header and in the mobile tab bar.
 * On phones the panel is a bottom sheet (thumb reach, drag-handle affordance, safe-area padding);
 * from `sm` up it is a right-aligned panel under the header.
 */

const SOURCE_META: Record<NotificationSource, { label: string; icon: string; chip: string }> = {
  'daily-session': {
    label: 'Daily Session',
    icon: 'AcademicCapIcon',
    chip: 'bg-violet-500/15 text-violet-500',
  },
  labs: { label: 'Labs', icon: 'BeakerIcon', chip: 'bg-blue-500/15 text-blue-500' },
  todo: {
    label: 'To-Do',
    icon: 'ClipboardDocumentCheckIcon',
    chip: 'bg-emerald-500/15 text-emerald-500',
  },
  system: { label: 'System', icon: 'BellIcon', chip: 'bg-amber-500/15 text-amber-500' },
};

const TONE_DOT: Record<NotificationTone, string> = {
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

type Filter = 'all' | NotificationSource;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'daily-session', label: 'Daily' },
  { key: 'labs', label: 'Labs' },
  { key: 'todo', label: 'To-Do' },
];

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return day < 7
    ? `${day}d ago`
    : new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function useNotifications() {
  const items = useSyncExternalStore(
    subscribeNotifications,
    getNotifications,
    getServerNotifications
  );
  return { items, unread: unreadCount(items) };
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-[3rem] shrink-0 rounded-full transition-colors focus-ring ${
          checked ? 'bg-primary' : 'mix-bg-muted-foreground/30'
        }`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}

function SettingsView({ prefs }: { prefs: NotificationPrefs }) {
  const [permission, setPermission] = useState<ReturnType<typeof browserPermission>>('default');
  useEffect(() => setPermission(browserPermission()), []);

  const toggleBrowser = async (next: boolean) => {
    if (!next) return setPrefs({ browser: false });
    setPermission(await enableBrowserNotifications());
  };

  return (
    <div className="space-y-1 px-4 pb-4 sm:px-5">
      <Switch
        label="Daily session reminder"
        hint={`Nudge after ${prefs.dailyReminderHour}:00 if today's session isn't done`}
        checked={prefs.dailyReminder}
        onChange={(v) => setPrefs({ dailyReminder: v })}
      />
      {prefs.dailyReminder && (
        <div className="flex min-h-[44px] items-center justify-between gap-3 pb-1.5">
          <label htmlFor="notif-hour" className="text-sm text-muted-foreground">
            Remind me from
          </label>
          <select
            id="notif-hour"
            value={prefs.dailyReminderHour}
            onChange={(e) => setPrefs({ dailyReminderHour: Number(e.target.value) })}
            className="h-10 rounded-lg border border-border bg-input px-3 text-sm text-foreground"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {`${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`}
              </option>
            ))}
          </select>
        </div>
      )}
      <Switch
        label="Task reminders"
        hint="At the exact time you set on a task, on every page"
        checked={prefs.todoReminders}
        onChange={(v) => setPrefs({ todoReminders: v })}
      />
      <Switch
        label="To-Do due dates"
        hint="A daily summary of tasks due today and overdue"
        checked={prefs.todoDue}
        onChange={(v) => setPrefs({ todoDue: v })}
      />
      <Switch
        label="Lab updates"
        hint="Question generation and lab results"
        checked={prefs.labs}
        onChange={(v) => setPrefs({ labs: v })}
      />
      <Switch
        label="Browser notifications"
        hint={
          permission === 'unsupported'
            ? 'Not supported in this browser'
            : permission === 'denied'
              ? 'Blocked — allow notifications in your browser’s site settings'
              : 'Alert me when this tab is in the background'
        }
        checked={prefs.browser && permission === 'granted'}
        onChange={toggleBrowser}
      />
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {prefs.browser && permission === 'granted' && (
          <button
            type="button"
            onClick={() => void sendTestNotification()}
            className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            Send a test notification
          </button>
        )}
        <a
          href="/notification-setup.html"
          target="_blank"
          rel="noopener"
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted"
        >
          Phone setup guide
        </a>
      </div>
    </div>
  );
}

function Row({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const meta = SOURCE_META[item.source];
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`flex w-full items-start gap-3 px-4 py-3 pr-[3rem] text-left transition-colors hover:mix-bg-muted/60 active:bg-muted sm:px-5 ${
          item.read ? '' : 'mix-bg-primary/[0.04]'
        }`}
      >
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.chip}`}
        >
          <Icon name={meta.icon as never} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {!item.read && (
              <span
                aria-label="Unread"
                className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
              />
            )}
            <span
              className={`truncate text-sm ${item.read ? 'font-medium' : 'font-semibold'} text-foreground`}
            >
              {item.title}
            </span>
          </span>
          {item.body && (
            <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
              {item.body}
            </span>
          )}
          <span className="mt-1 block text-xs mix-text-muted-foreground/80">
            {meta.label} · {timeAgo(item.createdAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => removeNotification(item.id)}
        aria-label={`Dismiss: ${item.title}`}
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name="XMarkIcon" size={16} />
      </button>
    </li>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, unread } = useNotifications();
  const prefs = useSyncExternalStore(subscribeNotifications, getPrefs, getServerPrefs);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'settings'>('list');
  const [testing, setTesting] = useState<null | 'app' | 'browser'>(null);

  /** App notification: the in-app card, plus a real system notification when running inside the Android app. */
  const handleTestApp = async () => {
    if (testing) return;
    setTesting('app');
    try {
      notify({
        source: 'system',
        title: 'Test app notification',
        body: 'The in-app notification is working. Tap to open To-Do.',
        tone: 'success',
        href: '/ai-todo?tab=today',
        toast: true,
      });
      if (isNativeApp()) {
        const scheduled = await sendNativeTestNotification(5);
        if (scheduled) toast.success('A phone notification arrives in 5 seconds. Close the app to see it fire closed.');
        else toast.error('The phone blocked notifications. Allow them for LabNinja in the phone’s app settings.');
      }
    } catch {
      toast.error('Could not send the app test notification.');
    } finally {
      setTesting(null);
    }
  };

  /** Browser alert: only the web paths (Web Push, service worker, Notification API). Not available inside the app. */
  const handleTestBrowser = async () => {
    if (testing) return;
    setTesting('browser');
    try {
      if (isNativeApp()) {
        toast.info('Browser alerts do not exist inside the app. Use “Test app” here, or open the site in a browser.');
        return;
      }
      const perm = browserPermission();
      if (perm === 'unsupported') {
        toast.error('This browser can’t show notifications. On iPhone, add the site to the Home Screen first.');
        return;
      }
      if (perm === 'denied') {
        toast.error('Notifications are blocked. Allow them in the browser’s site settings.');
        return;
      }
      const shown = await sendBrowserTestNotification();
      if (shown) toast.success('Browser alert sent. Check your notification shade.');
      else toast.error('The browser did not show it. Check the permission and the setup guide.');
    } catch {
      toast.error('Could not send the browser test alert.');
    } finally {
      setTesting(null);
    }
  };

  const shown = filter === 'all' ? items : items.filter((n) => n.source === filter);

  const open = (item: NotificationItem) => {
    markRead(item.id);
    if (item.href) {
      onClose();
      router.push(item.href);
    }
  };

  return (
    <>
      {/* Drag handle, phones only: drag it down to dismiss (Modal wires [data-sheet-grabber]). */}
      <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
        <span />
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 pt-1 sm:px-5 sm:pt-4">
        {view === 'settings' ? (
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="Back to notifications"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Icon name="ChevronLeftIcon" size={18} />
          </button>
        ) : null}
        <h2 id="notif-title" className="ios-sheet-title flex-1">
          {view === 'settings' ? 'Notification settings' : 'Notifications'}
          {view === 'list' && unread > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </h2>
        {view === 'list' && (
          <button
            type="button"
            onClick={() => setView('settings')}
            aria-label="Notification settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name="Cog6ToothIcon" size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notifications"
          className="hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
        >
          <Icon name="XMarkIcon" size={18} />
        </button>
        <button type="button" onClick={onClose} className="sheet-done sm:hidden">
          Done
        </button>
      </div>

      {view === 'settings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SettingsView prefs={prefs} />
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Filter notifications"
            className="scrollbar-clean flex gap-2 overflow-x-auto px-4 pb-2 sm:px-5"
          >
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-[1.5rem] py-14 text-center text-muted-foreground">
                <span className="flex h-[3rem] w-[3rem] items-center justify-center rounded-full bg-muted">
                  <Icon name="BellSlashIcon" size={22} />
                </span>
                <p className="text-sm font-medium text-foreground">You’re all caught up</p>
                <p className="max-w-[16rem] text-xs">
                  Reminders, finished generations and due tasks will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((item) => (
                  <Row key={item.id} item={item} onOpen={open} />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border px-4 py-2 sm:px-5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleTestApp()}
                disabled={testing !== null}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg mix-bg-primary/10 px-3 text-xs font-semibold text-primary transition-all hover:mix-bg-primary/20 active:scale-95 disabled:opacity-50"
              >
                <Icon name="DevicePhoneMobileIcon" size={14} />
                <span>{testing === 'app' ? 'Sending…' : 'Test app notification'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleTestBrowser()}
                disabled={testing !== null}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg mix-bg-primary/10 px-3 text-xs font-semibold text-primary transition-all hover:mix-bg-primary/20 active:scale-95 disabled:opacity-50"
              >
                <Icon name="BellAlertIcon" size={14} />
                <span>{testing === 'browser' ? 'Sending…' : 'Test alert (browser)'}</span>
              </button>
            </div>
            <div className="flex items-center justify-end gap-1">
              {items.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unread === 0}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-semibold text-primary disabled:text-muted-foreground disabled:opacity-60"
                  >
                    Mark all read
                  </button>
                  <button
                    type="button"
                    onClick={clearNotifications}
                    className="h-9 rounded-lg px-2.5 text-[13px] font-semibold text-muted-foreground hover:text-error"
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function NotificationSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="notif-title"
      backdropClassName="ios-sheet-backdrop"
      overlayClassName="flex items-end justify-center sm:items-start sm:justify-end sm:p-3 sm:pt-[68px]"
      className="notif-sheet ios-sheet flex w-full flex-col overflow-hidden sm:w-[400px]"
    >
      <Panel onClose={onClose} />
    </Modal>
  );
}

/** The bell. `variant="tab"` renders the stacked icon+label form used in the mobile tab bar. */
export default function NotificationBell({ variant = 'icon' }: { variant?: 'icon' | 'tab' }) {
  const { unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const badge = unread > 99 ? '99+' : String(unread);
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <>
      {variant === 'tab' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="mobile-tab"
        >
          <span className="relative">
            <Icon name="BellIcon" size={24} variant="outline" />
            {unread > 0 && <span className="notif-badge">{badge}</span>}
          </span>
          <span>Alerts</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="theme-toggle relative"
          aria-label={label}
          aria-haspopup="dialog"
          title="Notifications"
        >
          <Icon name="BellIcon" size={18} variant="outline" />
          {unread > 0 && <span className="notif-badge">{badge}</span>}
        </button>
      )}
      <NotificationSheet isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
