'use client';

import React, { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import {
  dismissScheduleAlert,
  getScheduleAlerts,
  getServerScheduleAlerts,
  subscribeScheduleAlerts,
  type ScheduleAlert,
} from '@/lib/schedules/scheduleEngine';
import { scheduleHref } from '@/lib/schedules/nativeScheduler';
import { formatReminder } from '@/lib/reminders/reminderTime';

/**
 * A scheduled reminder or AI job that comes round while the app is open: a card on top of the page, in the same stack
 * as task reminders (ReminderAlerts renders both), showing the AI's answer for an AI job. In the background it is a
 * device notification instead.
 */
export function useScheduleAlerts(): ScheduleAlert[] {
  return useSyncExternalStore(subscribeScheduleAlerts, getScheduleAlerts, getServerScheduleAlerts);
}

const LABEL: Record<ScheduleAlert['state'], string> = {
  ok: '',
  late: 'Ran late',
  running: 'Running…',
  error: 'Couldn’t run',
  missed: 'Missed',
};

export function ScheduleCard({ alert }: { alert: ScheduleAlert }) {
  const router = useRouter();
  const kindLabel = alert.kind === 'agent' ? 'AI job' : 'Scheduled reminder';
  const stateLabel = LABEL[alert.state];
  const warn = alert.state === 'error' || alert.state === 'missed';
  return (
    <div
      className="rem-alert"
      role="alertdialog"
      aria-labelledby={`sch-${alert.key}`}
      aria-describedby={`sch-body-${alert.key}`}
    >
      <div className="flex items-start gap-3">
        <span className="rem-alert-icon" aria-hidden>
          {alert.kind === 'agent' ? (
            <Icon name="SparklesIcon" size={20} variant="solid" />
          ) : (
            <FlatIcon name="clock" size={20} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[12px] font-semibold ${warn ? 'text-warning' : 'lab-ink'}`}>
            {stateLabel ? `${kindLabel} · ${stateLabel}` : kindLabel}
          </p>
          <p
            id={`sch-${alert.key}`}
            className="mt-0.5 break-words text-[15px] font-semibold leading-snug text-foreground"
          >
            {alert.title}
          </p>
          <p
            id={`sch-body-${alert.key}`}
            className="mt-1 line-clamp-6 whitespace-pre-line break-words text-[13px] leading-relaxed text-muted-foreground"
          >
            {alert.body}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{formatReminder(alert.at)}</p>
        </div>
        <button
          type="button"
          onClick={() => dismissScheduleAlert(alert.key)}
          aria-label="Dismiss"
          className="todo-btn todo-btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 px-0"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>
      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            dismissScheduleAlert(alert.key);
            router.push(
              alert.href ??
                (alert.runId
                  ? `${scheduleHref(alert.scheduleId)}&run=${alert.runId}`
                  : scheduleHref(alert.scheduleId))
            );
          }}
          className="todo-btn todo-btn-quiet h-10 flex-1 text-sm"
        >
          {alert.href ? 'Open class' : 'Open in Scheduler'}
        </button>
        <button
          type="button"
          onClick={() => dismissScheduleAlert(alert.key)}
          className="todo-btn todo-btn-ghost h-10 px-3 text-sm"
        >
          OK
        </button>
      </div>
    </div>
  );
}
