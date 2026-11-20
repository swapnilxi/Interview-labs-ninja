'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { ThreadItem } from '@/lib/services/agentService';
import { parseServerTime, type ActivityRun } from '@/lib/services/scheduleService';
import AssistantMarkdown from './AssistantMarkdown';
import ActionCard from './ActionCard';
import type { TimelineEntry } from './useAssistant';

/** The conversation: your messages, the Assistant's replies with what it did, and your scheduled jobs' results. */

export const SUGGESTIONS: { label: string; icon: string; items: string[] }[] = [
  {
    label: 'Ask about your work',
    icon: 'ChatBubbleLeftRightIcon',
    items: [
      'What’s overdue, and what should I do first?',
      'What did I finish this week?',
      'Summarize my projects',
    ],
  },
  {
    label: 'Schedule it',
    icon: 'CalendarDaysIcon',
    items: [
      'Every weekday at 8:30, plan my day from my tasks',
      'Every Friday at 6pm, write a weekly report of what I got done',
      'Remind me to drink water every 2 hours',
    ],
  },
  {
    label: 'From the web',
    icon: 'GlobeAltIcon',
    items: [
      'Every morning at 8, brief me on the top AI news',
      'What’s new in Next.js this month?',
      'Tomorrow at 7am, tell me the weather in my city',
    ],
  },
];

interface Props {
  timeline: TimelineEntry[];
  busy: boolean;
  speakingId: string | null;
  onSuggest: (text: string) => void;
  /** Read a message aloud in full (or stop, when it is the one being read). */
  onSpeak: (id: string, text: string) => void;
  onRetry: (id: string) => void;
  onUndo: (itemId: string, index: number) => void;
  onConfirm: (itemId: string, index: number, yes: boolean) => void;
  onEditSchedule: (id: number) => void;
  onOpenSchedule: (id: number, runId?: number) => void;
  focusRun: number | null;
}

function dayLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function AssistantThread(props: Props) {
  const { timeline, busy, onSuggest } = props;

  if (!timeline.length && !busy) {
    return (
      <div className="agt-empty">
        <h3 className="agt-empty-title">What should I take care of?</h3>
        <p className="agt-empty-sub">
          Ask about your tasks, projects and goals, get a report, look something up, or have
          something run on a schedule. Type, or talk to it.
        </p>
        <div className="agt-suggest-groups">
          {SUGGESTIONS.map((group) => (
            <div key={group.label}>
              <p className="agt-suggest-label">
                <Icon name={group.icon} size={14} />
                {group.label}
              </p>
              {group.items.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="agt-suggest"
                  onClick={() => onSuggest(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  let lastDay = '';
  return (
    <div className="agt-thread" aria-live="polite" aria-busy={busy}>
      {timeline.map((row) => {
        const day = dayLabel(row.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const key = row.kind === 'message' ? row.item.id : `run-${row.run.id}`;
        return (
          <React.Fragment key={key}>
            {showDay && <p className="agt-day">{day}</p>}
            {row.kind === 'run' ? (
              <RunResult run={row.run} at={row.at} {...props} />
            ) : row.item.role === 'user' ? (
              <>
                <p className="agt-user">{row.item.text}</p>
                {row.item.voice && (
                  <p className="agt-user-meta">
                    <Icon name="MicrophoneIcon" size={11} />
                    Said aloud
                  </p>
                )}
              </>
            ) : (
              <BotMessage item={row.item} {...props} />
            )}
          </React.Fragment>
        );
      })}
      {busy && <Thinking />}
    </div>
  );
}

function Thinking() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="agt-bot">
      <span className="agt-avatar" aria-hidden>
        <Icon name="SparklesIcon" size={15} />
      </span>
      <div className="agt-thinking" role="status">
        <span className="agt-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {slow ? 'Still working: reading your data, and the web if it needs to…' : 'Thinking…'}
      </div>
    </div>
  );
}

function SpeakButton({
  id,
  text,
  speakingId,
  onSpeak,
}: {
  id: string;
  text: string;
  speakingId: string | null;
  onSpeak: Props['onSpeak'];
}) {
  const on = speakingId === id;
  return (
    <button
      type="button"
      className="agt-tool"
      aria-pressed={on}
      aria-label={on ? 'Stop reading' : 'Read aloud'}
      title={on ? 'Stop reading' : 'Read aloud'}
      onClick={() => onSpeak(id, text)}
    >
      <Icon name={on ? 'StopIcon' : 'SpeakerWaveIcon'} size={15} />
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="agt-tool"
      aria-label={done ? 'Copied' : 'Copy'}
      title={done ? 'Copied' : 'Copy'}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          })
          .catch(() => {});
      }}
    >
      <Icon name={done ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={15} />
    </button>
  );
}

function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  if (!sources.length) return null;
  return (
    <div className="agt-sources" aria-label="Sources">
      {sources.map((s) => {
        let host = s.url;
        try {
          host = new URL(s.url).hostname.replace(/^www\./, '');
        } catch {
          /* keep the url */
        }
        return (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="agt-source"
            title={s.title}
          >
            <Icon name="GlobeAltIcon" size={12} />
            <span>{host}</span>
          </a>
        );
      })}
    </div>
  );
}

/**
 * A "Run it now" card's outcome: the status of that schedule's first run started since the message (a minute of
 * slack: the run starts while the reply is still being saved), or undefined while none shows yet.
 */
function runStatusSince(
  timeline: TimelineEntry[],
  scheduleId: number,
  since: number
): ActivityRun['status'] | undefined {
  for (const row of timeline) {
    if (row.kind !== 'run' || row.run.schedule_id !== scheduleId) continue;
    if (parseServerTime(row.run.started_at) >= since - 60_000) return row.run.status;
  }
  return undefined;
}

function BotMessage({
  item,
  timeline,
  speakingId,
  onSpeak,
  onRetry,
  onUndo,
  onConfirm,
  onEditSchedule,
}: Props & { item: ThreadItem }) {
  return (
    <div className="agt-bot" data-failed={item.failed ? 'true' : undefined}>
      <span className="agt-avatar" aria-hidden>
        <Icon name={item.failed ? 'ExclamationTriangleIcon' : 'SparklesIcon'} size={15} />
      </span>
      <div className="agt-bot-body">
        {item.searched && (
          <p className="agt-searched">
            <Icon name="MagnifyingGlassIcon" size={12} />
            Searched the web for “{item.searched}”
          </p>
        )}
        {item.text && <AssistantMarkdown text={item.text} />}
        {item.actions?.map((entry, i) => (
          <ActionCard
            key={i}
            entry={entry}
            runStatus={
              entry.action.type === 'run_schedule'
                ? runStatusSince(timeline, entry.action.id, item.at)
                : undefined
            }
            onUndo={() => onUndo(item.id, i)}
            onConfirm={(yes) => onConfirm(item.id, i, yes)}
            onEditSchedule={onEditSchedule}
          />
        ))}
        {item.notes?.map((note, i) => (
          <p key={i} className="agt-note">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </p>
        ))}
        {item.sources && <Sources sources={item.sources} />}
        <div className="agt-tools">
          {item.failed ? (
            <button type="button" className="agt-tool" onClick={() => onRetry(item.id)}>
              <Icon name="ArrowPathIcon" size={14} />
              Try again
            </button>
          ) : (
            item.text && (
              <>
                <SpeakButton
                  id={item.id}
                  text={item.text}
                  speakingId={speakingId}
                  onSpeak={onSpeak}
                />
                <CopyButton text={item.text} />
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function RunResult({
  run,
  at,
  speakingId,
  onSpeak,
  onOpenSchedule,
  focusRun,
}: Props & { run: ActivityRun; at: number }) {
  const body = run.report || run.output || '';
  const long = body.length > 900;
  const [open, setOpen] = useState(false);
  const id = `run-${run.id}`;
  const ref = React.useRef<HTMLDivElement>(null);
  const focused = focusRun === run.id;
  useEffect(() => {
    if (focused) {
      setOpen(true);
      requestAnimationFrame(() =>
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
    }
  }, [focused]);
  return (
    <div className="agt-bot" ref={ref}>
      <span className="agt-avatar" aria-hidden>
        <Icon name={run.status === 'error' ? 'ExclamationTriangleIcon' : 'ClockIcon'} size={15} />
      </span>
      <div className="agt-bot-body">
        <div className="agt-run" data-status={run.status}>
          <p className="agt-run-head">
            <span className="min-w-0 truncate">{run.schedule_title}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">
              {run.status === 'error' ? 'failed' : 'ran'} {timeOf(at)}
            </span>
          </p>
          {run.title && run.title !== run.schedule_title && (
            <p className="agt-run-title">{run.title}</p>
          )}
          <div className="agt-run-body" data-clamped={long && !open ? 'true' : undefined}>
            {run.report ? (
              <AssistantMarkdown text={run.report} />
            ) : (
              <p className="agt-md whitespace-pre-line">{run.output}</p>
            )}
          </div>
          {run.report && run.output && (
            <p className="agt-card-meta mt-2">Notification: {run.output}</p>
          )}
          {run.sources && <Sources sources={run.sources} />}
          {run.created_task_ids.length > 0 && (
            <p className="agt-card-meta mt-2">
              Added {run.created_task_ids.length} task{run.created_task_ids.length > 1 ? 's' : ''}{' '}
              to Smart To-Do
            </p>
          )}
        </div>
        <div className="agt-tools">
          {long && (
            <button
              type="button"
              className="agt-tool"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <Icon name="ChevronDownIcon" size={14} className={open ? 'rotate-180' : ''} />
              {open ? 'Show less' : 'Show all'}
            </button>
          )}
          {body && (
            <SpeakButton
              id={id}
              text={`${run.title ? `${run.title}. ` : ''}${body}`}
              speakingId={speakingId}
              onSpeak={onSpeak}
            />
          )}
          {body && <CopyButton text={body} />}
          <button
            type="button"
            className="agt-tool"
            onClick={() => onOpenSchedule(run.schedule_id, run.id)}
            title="Open this schedule"
          >
            <Icon name="ClockIcon" size={14} />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
