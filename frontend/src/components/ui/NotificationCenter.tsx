'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import {
  browserPermission,
  clearNotifications,
  enableBrowserNotifications,
  getNotifications,
  getPrefs,
  getServerNotifications,
  getServerPrefs,
  markAllRead,
  markRead,
  removeNotification,
  setPrefs,
  subscribeNotifications,
  unreadCount,
  type NotificationItem,
  type NotificationPrefs,
  type NotificationSource,
  type NotificationTone,
} from '@/lib/ui/notifications';

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
        label="To-Do due dates"
        hint="Tasks due today and overdue"
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
      {/* Drag-handle affordance, phones only */}
      <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
        <span className="h-1.5 w-10 rounded-full mix-bg-muted-foreground/30" />
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 pt-2 sm:px-5 sm:pt-4">
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
        <h2 id="notif-title" className="font-heading flex-1 text-lg font-semibold text-foreground">
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

          {items.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 sm:px-5">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unread === 0}
                className="h-10 rounded-lg px-3 text-[13px] font-semibold text-primary disabled:text-muted-foreground disabled:opacity-60"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={clearNotifications}
                className="h-10 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground hover:text-error"
              >
                Clear all
              </button>
            </div>
          )}
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
      backdropClassName="bg-black/40 backdrop-blur-[2px]"
      overlayClassName="flex items-end justify-center sm:items-start sm:justify-end sm:p-3 sm:pt-[68px]"
      className="notif-sheet flex w-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:w-[400px]"
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
            <Icon name="BellIcon" size={22} variant="outline" />
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
