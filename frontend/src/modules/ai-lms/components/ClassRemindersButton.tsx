'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Icon from '@/components/ui/AppIcon';
import { enableNativeReminders, isNativeApp } from '@/lib/reminders/nativeReminders';
import {
  DEFAULT_PRACTICE,
  MAX_PRACTICE_TIMES,
  OPEN_CLASS_REMINDERS_EVENT,
  defaultReminderMessage,
  isReminderSlug,
  listClassReminders,
  practiceFromSchedules,
  removeClassReminders,
  saveClassReminders,
  validatePractice,
  type PracticeRepeat,
  type PracticeSettings,
} from '@/lib/schedules/classReminders';
import { nativeSchedulerStatus } from '@/lib/schedules/nativeScheduler';
import { SCHEDULES_CHANGED_EVENT, type Schedule } from '@/lib/services/scheduleService';
import {
  browserNotificationsSupported,
  browserPermission,
  enableBrowserNotifications,
  getPrefs,
  getServerPrefs,
  subscribeNotifications,
} from '@/lib/ui/notifications';
import { toast } from '@/lib/ui/toast';
import { lmsService } from '../services/lmsService';
import ClassDialog, { DIALOG_BTN, DIALOG_BTN_PRIMARY, DIALOG_FIELD } from './ClassDialog';
import { LMS_TOOLBAR_BTN } from './toolbarStyles';

interface ClassRemindersButtonProps {
  /** The class's URL slug. */
  classSlug: string;
  /** The class's display name ("AI"). Named `className` by the page that mounts this, not a CSS class. */
  className: string;
}

const REPEATS: { id: PracticeRepeat; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Chosen days' },
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Suggested times for "Add a time", in the order they are offered. */
const TIME_SUGGESTIONS = ['18:00', '08:00', '12:30', '21:00'];

/** "18:00 and 08:00, every day" for the button's tooltip and the saved toast. */
function describe(settings: PracticeSettings): string {
  const when =
    settings.repeat === 'daily'
      ? 'every day'
      : settings.repeat === 'weekdays'
        ? 'on weekdays'
        : `on ${[...settings.days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(', ')}`;
  return `${[...settings.times].sort().join(' and ')}, ${when}`;
}

/**
 * "Practice reminders" for one class: up to three times a day, every day, on weekdays or on chosen days. Each time is an
 * ordinary Scheduler reminder (lib/schedules/classReminders.ts), so it runs on this device like every reminder: in an
 * open tab on the web, and as phone alarms in the Android app even when it is closed. Turning reminders on also
 * records interest in the class, which is how its instructor's updates reach you. The dialog opens from its button or
 * when another part of the page asks for it (the Join button offers "Set practice time").
 */
export default function ClassRemindersButton({ classSlug, className: classTitle }: ClassRemindersButtonProps) {
  const [saved, setSaved] = useState<Schedule[] | null>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_PRACTICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSaved(await listClassReminders(classSlug));
    } catch {
      setSaved((current) => current ?? []);
    }
  }, [classSlug]);

  useEffect(() => {
    void refresh();
    // Changed in the Scheduler tab or by another tab: pick it up.
    window.addEventListener(SCHEDULES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SCHEDULES_CHANGED_EVENT, refresh);
  }, [refresh]);

  const openDialog = useCallback(() => {
    const current = practiceFromSchedules(saved ?? [], classTitle) ?? DEFAULT_PRACTICE;
    setSettings({ ...current, times: [...current.times], days: [...current.days] });
    setError(null);
    setOpen(true);
  }, [saved, classTitle]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<{ slug?: string }>).detail?.slug === classSlug) openDialog();
    };
    window.addEventListener(OPEN_CLASS_REMINDERS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CLASS_REMINDERS_EVENT, onOpen);
  }, [classSlug, openDialog]);

  if (!isReminderSlug(classSlug)) return null;

  const isOn = (saved?.length ?? 0) > 0;
  const savedSummary = isOn ? practiceFromSchedules(saved ?? [], classTitle) : null;
  const patch = (change: Partial<PracticeSettings>) => setSettings((current) => ({ ...current, ...change }));

  const setTime = (index: number, value: string) =>
    patch({ times: settings.times.map((t, i) => (i === index ? value : t)) });
  const removeTime = (index: number) => patch({ times: settings.times.filter((_, i) => i !== index) });
  const addTime = () => {
    const next = TIME_SUGGESTIONS.find((t) => !settings.times.includes(t)) ?? '09:00';
    patch({ times: [...settings.times, next] });
  };
  const toggleDay = (day: number) =>
    patch({ days: settings.days.includes(day) ? settings.days.filter((d) => d !== day) : [...settings.days, day] });

  const save = async () => {
    const problem = validatePractice(settings);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveClassReminders(classSlug, classTitle, settings);
      // Turning reminders on shows interest in the class; being in it is how instructor updates reach you.
      try {
        const membership = await lmsService.getClassMembership(classSlug);
        if (!membership.status) await lmsService.setClassMembership(classSlug, 'interested');
      } catch {
        /* the reminders are saved; the membership is a bonus and can be set with the Join button */
      }
      await refresh();
      setOpen(false);
      toast.success(`Practice reminders set: ${describe(settings)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the reminders. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeClassReminders(classSlug);
      await refresh();
      setOpen(false);
      toast.info('Practice reminders are off for this class.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn the reminders off. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        title={savedSummary ? `Practice reminders: ${describe(savedSummary)}` : 'Set times to be reminded to practice this class'}
        className={LMS_TOOLBAR_BTN}
      >
        <Icon name={isOn ? 'BellAlertIcon' : 'BellIcon'} size={14} />
        <span>{isOn ? 'Reminders on' : 'Practice reminders'}</span>
      </button>

      <ClassDialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        icon="BellAlertIcon"
        title="Practice reminders"
        subtitle={classTitle}
        footer={
          <>
            {isOn && (
              <button
                type="button"
                onClick={() => void turnOff()}
                disabled={busy}
                className="mr-auto inline-flex min-h-[2.75rem] items-center rounded-xl px-3 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                Turn off reminders
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={DIALOG_BTN}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className={DIALOG_BTN_PRIMARY}>
              {busy ? 'Saving…' : 'Save reminders'}
            </button>
          </>
        }
      >
        <div className="space-y-[1.25rem]">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Choose when LabNinja should nudge you to practice {classTitle}. Tapping the reminder opens the class.
          </p>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-semibold text-foreground">Practice times</legend>
            {settings.times.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`practice-time-${index}`}>
                  Practice time {index + 1}
                </label>
                <input
                  id={`practice-time-${index}`}
                  type="time"
                  value={time}
                  onChange={(event) => setTime(index, event.target.value)}
                  disabled={busy}
                  className={DIALOG_FIELD}
                />
                {settings.times.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTime(index)}
                    disabled={busy}
                    aria-label={`Remove practice time ${index + 1}`}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <Icon name="TrashIcon" size={18} />
                  </button>
                )}
              </div>
            ))}
            {settings.times.length < MAX_PRACTICE_TIMES && (
              <button
                type="button"
                onClick={addTime}
                disabled={busy}
                className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-primary transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <Icon name="PlusIcon" size={16} />
                Add another time
              </button>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-semibold text-foreground">Repeat</legend>
            <div role="radiogroup" aria-label="Repeat" className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1">
              {REPEATS.map((option) => {
                const active = settings.repeat === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => patch({ repeat: option.id })}
                    disabled={busy}
                    className={`min-h-[2.5rem] rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {settings.repeat === 'weekly' && (
              <div role="group" aria-label="Days" className="grid grid-cols-7 gap-1.5">
                {DAY_LETTERS.map((letter, day) => {
                  const active = settings.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      aria-label={DAY_NAMES[day]}
                      onClick={() => toggleDay(day)}
                      disabled={busy}
                      className={`min-h-[2.75rem] rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="practice-message" className="text-sm font-semibold text-foreground">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="practice-message"
              type="text"
              value={settings.message}
              maxLength={200}
              onChange={(event) => patch({ message: event.target.value })}
              placeholder={defaultReminderMessage(classTitle)}
              disabled={busy}
              className={DIALOG_FIELD}
            />
          </div>

          <DeliveryStatus />

          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-500">
              {error}
            </p>
          )}
        </div>
      </ClassDialog>
    </>
  );
}

/**
 * Where a reminder can reach you, said plainly, with the one button that fixes it: browser notifications on the web
 * (the permission prompt must come from a tap), notification and exact-alarm permission in the Android app.
 */
function DeliveryStatus() {
  const prefs = useSyncExternalStore(subscribeNotifications, getPrefs, getServerPrefs);
  const [isApp, setIsApp] = useState(false);
  const [phone, setPhone] = useState<{ exact: boolean; notifications: boolean } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const native = isNativeApp();
    setIsApp(native);
    if (native) void nativeSchedulerStatus().then(setPhone);
  }, []);

  const permission = browserPermission();
  const webOn = prefs.browser && permission === 'granted';

  const allowOnPhone = async () => {
    setAsking(true);
    try {
      await enableNativeReminders();
      setPhone(await nativeSchedulerStatus());
    } finally {
      setAsking(false);
    }
  };
  const allowInBrowser = async () => {
    setAsking(true);
    try {
      await enableBrowserNotifications();
    } finally {
      setAsking(false);
    }
  };

  let message: string;
  let action: { label: string; run: () => void } | null = null;
  if (isApp) {
    if (phone && !phone.notifications) {
      message = 'Notifications are off for LabNinja on this phone, so a reminder cannot ring.';
      action = { label: 'Allow notifications', run: () => void allowOnPhone() };
    } else if (phone && !phone.exact) {
      message = 'Exact alarms are off, so a reminder can arrive a few minutes late.';
      action = { label: 'Allow exact alarms', run: () => void allowOnPhone() };
    } else {
      message = 'Reminders ring on this phone, even when the app is closed.';
    }
  } else if (!browserNotificationsSupported()) {
    message = 'This browser cannot show notifications here. Reminders still appear inside LabNinja while it is open.';
  } else if (webOn) {
    message = 'Browser notifications are on, so a reminder can reach you while LabNinja is in the background.';
  } else if (permission === 'denied') {
    message =
      'Notifications are blocked for this site in your browser settings. Reminders still appear inside LabNinja while it is open.';
  } else {
    message = 'Turn on notifications so a reminder can reach you while LabNinja is in the background.';
    action = { label: 'Turn on notifications', run: () => void allowInBrowser() };
  }

  return (
    <div className="rounded-xl border border-border p-[0.875rem]">
      <div className="flex items-start gap-2.5">
        <Icon name="InformationCircleIcon" size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>{message}</p>
          {action && (
            <button type="button" onClick={action.run} disabled={asking} className={DIALOG_BTN}>
              {asking ? 'One moment…' : action.label}
            </button>
          )}
          <p>Reminders show while LabNinja is open in a browser tab, and on the Android app even when it is closed.</p>
        </div>
      </div>
    </div>
  );
}
