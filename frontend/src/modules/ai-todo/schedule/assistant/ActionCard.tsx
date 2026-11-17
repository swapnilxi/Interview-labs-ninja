'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { ActionEntry } from '@/lib/services/agentService';
import type { ScheduleCreatePayload } from '@/lib/services/scheduleService';
import { describeRule, nextOccurrence, type ScheduleRule } from '@/lib/schedules/scheduleRules';
import { formatReminder } from '@/lib/reminders/reminderTime';

/** What the Assistant did (or wants to do) in one card: what, when, and Undo / Edit / Delete-or-keep. */

interface Props {
  entry: ActionEntry;
  onUndo: () => void;
  onConfirm: (yes: boolean) => void;
  onEditSchedule: (id: number) => void;
}

const PRIORITY_LABEL: Record<string, string> = { p1: 'Urgent', p2: 'High', p3: '', p4: 'Low' };

function whenLine(rule: ScheduleRule): string {
  const next = nextOccurrence(rule, new Date());
  return next
    ? `${describeRule(rule)} · next ${formatReminder(next.toISOString())}`
    : describeRule(rule);
}

function jobChips(
  s: Pick<
    ScheduleCreatePayload,
    'kind' | 'agent_context' | 'use_web' | 'write_report' | 'add_tasks'
  >
) {
  if (s.kind !== 'agent') return [];
  const chips: { icon: string; label: string }[] = [];
  if (s.agent_context === 'workspace')
    chips.push({ icon: 'Squares2X2Icon', label: 'Reads all of To-Do' });
  else if (s.agent_context === 'tasks')
    chips.push({ icon: 'ListBulletIcon', label: 'Reads open tasks' });
  if (s.use_web) chips.push({ icon: 'GlobeAltIcon', label: 'Searches the web' });
  if (s.write_report) chips.push({ icon: 'DocumentTextIcon', label: 'Writes a report' });
  if (s.add_tasks) chips.push({ icon: 'PlusCircleIcon', label: 'Adds tasks' });
  return chips;
}

export default function ActionCard({ entry, onUndo, onConfirm, onEditSchedule }: Props) {
  const { action: a, state } = entry;
  const working = state === 'working';
  const undone = state === 'undone';

  let icon = 'SparklesIcon';
  let kicker = '';
  let title = '';
  let meta: React.ReactNode = null;
  let chips: { icon: string; label: string }[] = [];
  let body: React.ReactNode = null;
  let canUndo = state === 'done';
  let editId: number | null = null;

  switch (a.type) {
    case 'create_schedule': {
      const s = a.schedule;
      icon = s.kind === 'agent' ? 'SparklesIcon' : 'BellIcon';
      kicker = undone
        ? 'Removed'
        : s.kind === 'agent'
          ? 'Scheduled an AI job'
          : 'Scheduled a reminder';
      title = s.title;
      meta = <span>{whenLine(s.rule)}</span>;
      chips = jobChips(s);
      if (s.message && s.kind === 'agent')
        body = <p className="agt-card-meta mt-1.5 line-clamp-3">{s.message}</p>;
      editId = state === 'done' ? (entry.scheduleId ?? null) : null;
      break;
    }
    case 'update_schedule': {
      const p = a.patch;
      icon =
        p.enabled === false
          ? 'PauseCircleIcon'
          : p.enabled === true
            ? 'PlayCircleIcon'
            : 'PencilSquareIcon';
      kicker = undone
        ? 'Changed back'
        : p.enabled === false
          ? 'Paused'
          : p.enabled === true
            ? 'Resumed'
            : 'Changed';
      title = p.title && p.title !== a.title ? `${a.title} → ${p.title}` : a.title;
      // Paused: when it would have run next is beside the point.
      if (p.rule)
        meta = <span>{p.enabled === false ? describeRule(p.rule) : whenLine(p.rule)}</span>;
      else if (p.message) meta = <span className="line-clamp-2">{p.message}</span>;
      editId = state === 'done' ? a.id : null;
      break;
    }
    case 'run_schedule':
      icon = 'PlayIcon';
      kicker = 'Running now';
      title = a.title;
      meta = <span>The result shows up here when it’s done.</span>;
      canUndo = false;
      break;
    case 'delete_schedule':
      icon = 'TrashIcon';
      kicker =
        state === 'confirm'
          ? 'Delete this schedule?'
          : state === 'kept'
            ? 'Kept'
            : undone
              ? 'Restored (without its history)'
              : 'Deleted';
      title = a.title;
      canUndo = state === 'done' && !!entry.deleted;
      break;
    case 'add_tasks':
      icon = 'CheckCircleIcon';
      kicker = undone
        ? 'Removed the tasks'
        : `Added ${a.tasks.length} task${a.tasks.length > 1 ? 's' : ''} to Smart To-Do`;
      body = (
        <ul className="agt-task-list">
          {a.tasks.map((t, i) => (
            <li
              key={i}
              className={undone ? 'text-muted-foreground line-through' : 'text-foreground'}
            >
              <span className="min-w-0 break-words">
                {t.title}
                {(t.due_date || PRIORITY_LABEL[t.priority]) && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {[t.due_date, PRIORITY_LABEL[t.priority]].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      );
      break;
    case 'complete_task':
      icon = 'CheckBadgeIcon';
      kicker = undone ? 'Reopened' : 'Marked done';
      title = a.title;
      break;
  }

  return (
    <div className="agt-card" data-state={state}>
      <div className="agt-card-row">
        <span className="agt-card-icon" aria-hidden>
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="agt-card-kicker">{kicker}</p>
          {title && <p className="agt-card-title">{title}</p>}
          {meta && <p className="agt-card-meta">{meta}</p>}
          {chips.length > 0 && !undone && (
            <div className="agt-chips">
              {chips.map((c) => (
                <span key={c.label} className="agt-chip">
                  <Icon name={c.icon} size={12} />
                  {c.label}
                </span>
              ))}
            </div>
          )}
          {body}
          {entry.error && <p className="agt-note">{entry.error}</p>}

          {state === 'confirm' && (
            <div className="agt-card-actions">
              <button
                type="button"
                onClick={() => onConfirm(true)}
                className="todo-btn todo-btn-quiet h-9 px-3 text-sm text-destructive"
              >
                <Icon name="TrashIcon" size={14} />
                Delete
              </button>
              <button
                type="button"
                onClick={() => onConfirm(false)}
                className="todo-btn todo-btn-ghost h-9 px-3 text-sm"
              >
                Keep it
              </button>
            </div>
          )}

          {(canUndo || editId !== null || (a.type === 'add_tasks' && state === 'done')) && (
            <div className="agt-card-actions">
              {editId !== null && (
                <button
                  type="button"
                  onClick={() => onEditSchedule(editId!)}
                  className="todo-btn todo-btn-quiet h-9 px-3 text-sm"
                >
                  <Icon name="PencilSquareIcon" size={14} />
                  Edit
                </button>
              )}
              {a.type === 'add_tasks' && state === 'done' && (
                <Link
                  href="/ai-todo?tab=smart"
                  className="todo-btn todo-btn-ghost h-9 px-3 text-sm"
                >
                  <Icon name="ArrowTopRightOnSquareIcon" size={14} />
                  Open Smart To-Do
                </Link>
              )}
              {canUndo && (
                <button
                  type="button"
                  disabled={working}
                  onClick={onUndo}
                  className="todo-btn todo-btn-ghost h-9 px-3 text-sm"
                >
                  <Icon name="ArrowUturnLeftIcon" size={14} />
                  Undo
                </button>
              )}
            </div>
          )}
          {working && <p className="agt-card-meta mt-2">Working…</p>}
        </div>
      </div>
    </div>
  );
}
