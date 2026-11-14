'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { toast } from '@/lib/ui/toast';
import { todoService } from '@/lib/services/todoService';
import {
  dismissReminderAlert,
  getReminderAlerts,
  getServerReminderAlerts,
  subscribeReminderAlerts,
  taskHref,
  type ReminderAlert,
} from '@/lib/reminders/reminderEngine';
import { formatClock, formatReminder, snoozeOptions } from '@/lib/reminders/reminderTime';

/**
 * The reminder that goes off while the app is open: a card on top of whatever page you are on, with Done, Snooze and
 * Open. (In the background the same reminder is a device notification; see reminderEngine.ts.)
 */
export default function ReminderAlerts() {
  const alerts = useSyncExternalStore(subscribeReminderAlerts, getReminderAlerts, getServerReminderAlerts);
  if (!alerts.length) return null;
  return (
    <div className="rem-alerts" role="region" aria-label="Reminders">
      {alerts.map((alert) => (
        <ReminderCard key={alert.key} alert={alert} />
      ))}
    </div>
  );
}

function ReminderCard({ alert }: { alert: ReminderAlert }) {
  const router = useRouter();
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    setBusy(true);
    const saved = await todoService.updateTask(alert.taskId, { status: 'done' });
    setBusy(false);
    if (saved) {
      dismissReminderAlert(alert.key);
      toast.success(`Done: ${alert.title}`);
    }
  };

  const snooze = async (iso: string) => {
    setBusy(true);
    const saved = await todoService.updateTask(alert.taskId, { remind_at: iso });
    setBusy(false);
    if (saved) {
      dismissReminderAlert(alert.key);
      toast.info(`Snoozed until ${formatClock(new Date(iso))}`);
    }
  };

  return (
    <div className="rem-alert" role="alertdialog" aria-labelledby={`rem-${alert.key}`} aria-describedby={`rem-when-${alert.key}`}>
      <div className="flex items-start gap-3">
        <span className="rem-alert-icon" aria-hidden>
          <FlatIcon name="clock" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {alert.missed ? 'Missed reminder' : 'Reminder'}
          </p>
          <p id={`rem-${alert.key}`} className="mt-0.5 break-words text-[15px] font-semibold leading-snug text-foreground">
            {alert.title}
          </p>
          <p id={`rem-when-${alert.key}`} className="mt-0.5 text-xs text-muted-foreground">
            {formatReminder(alert.remindAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dismissReminderAlert(alert.key)}
          aria-label="Dismiss reminder"
          className="todo-btn todo-btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 px-0"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {snoozing ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Snooze for">
          {snoozeOptions().map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              onClick={() => void snooze(option.iso)}
              className="todo-btn todo-btn-quiet h-11 flex-col gap-0 px-1 text-xs"
            >
              <span>{option.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex gap-1.5">
          <button type="button" disabled={busy} onClick={() => void done()} className="todo-btn todo-btn-primary h-10 flex-1 text-sm">
            <Icon name="CheckIcon" size={16} />
            Done
          </button>
          <button type="button" disabled={busy} onClick={() => setSnoozing(true)} className="todo-btn todo-btn-quiet h-10 flex-1 text-sm">
            <Icon name="ClockIcon" size={16} />
            Snooze
          </button>
          <button
            type="button"
            onClick={() => {
              dismissReminderAlert(alert.key);
              router.push(taskHref(alert.taskId));
            }}
            className="todo-btn todo-btn-ghost h-10 px-3 text-sm"
          >
            Open
          </button>
        </div>
      )}
    </div>
  );
}
