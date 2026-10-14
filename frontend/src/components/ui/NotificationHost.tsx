'use client';

import { useEffect } from 'react';
import ToastHost from '@/components/ui/ToastHost';
import { getPrefs, hasNotification, notify } from '@/lib/ui/notifications';
import { todoService } from '@/lib/services/todoService';

/**
 * Mounted once in the root layout: renders the toast host for every page and runs the
 * reminders (daily session, due tasks). Reminders are checked on load, every few minutes, and
 * whenever the tab comes back to the foreground — there is no server push, so nothing fires
 * while the app is closed. Each reminder fires at most once per day (dedupeKey).
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;

function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function checkDailySession() {
  const prefs = getPrefs();
  const today = localDate();
  const key = `daily-session:${today}`;
  if (!prefs.dailyReminder || hasNotification(key)) return;
  if (new Date().getHours() < prefs.dailyReminderHour) return;
  let startedToday = false;
  try {
    startedToday = localStorage.getItem('ninja_active_session_date') === today;
  } catch {
    /* treat as not started */
  }
  if (startedToday) return;
  notify({
    source: 'daily-session',
    tone: 'info',
    title: 'Your daily session is waiting',
    body: '10 questions, about 20 minutes. Keep your streak going.',
    href: '/daily-session',
    dedupeKey: key,
    toast: false,
  });
}

async function checkTodoDue() {
  const prefs = getPrefs();
  if (!prefs.todoDue) return;
  const today = localDate();
  const dueKey = `todo-due:${today}`;
  const overdueKey = `todo-overdue:${today}`;
  if (hasNotification(dueKey) && hasNotification(overdueKey)) return;

  let tasks;
  try {
    tasks = await todoService.fetchTasks();
  } catch {
    return;
  }
  const open = tasks.filter((t) => t.due_date && t.status !== 'done' && t.status !== 'not_done');
  const dueToday = open.filter((t) => t.due_date!.slice(0, 10) === today);
  const overdue = open.filter((t) => t.due_date!.slice(0, 10) < today);
  const names = (list: typeof open) =>
    list
      .slice(0, 2)
      .map((t) => t.title)
      .join(', ') + (list.length > 2 ? ` +${list.length - 2} more` : '');

  if (dueToday.length && !hasNotification(dueKey)) {
    notify({
      source: 'todo',
      tone: 'warning',
      title: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today`,
      body: names(dueToday),
      href: '/ai-todo',
      dedupeKey: dueKey,
      toast: false,
    });
  }
  if (overdue.length && !hasNotification(overdueKey)) {
    notify({
      source: 'todo',
      tone: 'error',
      title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
      body: names(overdue),
      href: '/ai-todo',
      dedupeKey: overdueKey,
      toast: false,
    });
  }
}

export default function NotificationHost() {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      checkDailySession();
      void checkTodoDue();
    };
    const first = setTimeout(run, 2500); // let the page settle before reading task data
    const timer = setInterval(run, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);

  return <ToastHost />;
}
