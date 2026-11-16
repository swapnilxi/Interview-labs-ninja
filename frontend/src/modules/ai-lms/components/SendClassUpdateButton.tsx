'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsMembership, LmsSentUpdate, LmsUpdateResult, LmsUpdateScope } from '../types';
import ClassDialog, { DIALOG_BTN, DIALOG_BTN_PRIMARY, DIALOG_FIELD } from './ClassDialog';
import { LMS_TOOLBAR_BTN } from './toolbarStyles';

interface SendClassUpdateButtonProps {
  /** The class the update is sent from (its URL slug). */
  classSlug: string;
  /** The class's display name ("AI"). Named `className` by the page that mounts this, not a CSS class. */
  className: string;
}

// Same limits and link rule as the server (backend/modules/ai_lms/updates.py, fe-apis/lms/updates.ts).
const TITLE_MAX = 120;
const BODY_MAX = 1000;
const LINK_MAX = 300;
const LINK_OK = /^\/(?!\/)[^\\\s\u0000-\u001f\u007f-\u009f]*$/;
const LINK_PROBLEM = 'The link must be a page inside LabNinja, like /ai-lms/classes/ai.';

const charCount = (value: string) => Array.from(value).length;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

function linkProblem(link: string): string | null {
  const text = link.trim();
  if (!text) return null;
  return charCount(text) > LINK_MAX || !LINK_OK.test(text) ? LINK_PROBLEM : null;
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * For instructors and admins: send an update to the people of this class, or to everyone who is in any AI LMS class.
 * It shows up in their notification centre (and as a device notification where they allowed it). The server decides
 * who may send; this button is only shown to people who can. Needs at least one person to send to: the counts come
 * from the membership endpoint, and an audience with nobody in it is switched off with the reason.
 */
export default function SendClassUpdateButton({ classSlug, className: classTitle }: SendClassUpdateButtonProps) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<LmsMembership | null>(null);
  const [recent, setRecent] = useState<LmsSentUpdate[] | null>(null);
  const [scope, setScope] = useState<LmsUpdateScope>('class');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // The link the sender typed, or null while it is simply the default for the chosen audience.
  const [linkOverride, setLinkOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LmsUpdateResult | null>(null);
  const reqId = useRef(0);

  const defaultLink = scope === 'class' ? `/ai-lms/classes/${classSlug}` : '/ai-lms';
  const link = linkOverride ?? defaultLink;
  const classAudience = counts?.audience_count ?? 0;
  const moduleAudience = counts?.module_audience_count ?? 0;

  const load = () => {
    const id = ++reqId.current;
    setCounts(null);
    setRecent(null);
    lmsService
      .getClassMembership(classSlug)
      .then((m) => {
        if (id !== reqId.current) return;
        setCounts(m);
        // Start on whichever audience has anyone in it.
        setScope(m.audience_count > 0 || m.module_audience_count === 0 ? 'class' : 'ai-lms');
      })
      .catch(() => id === reqId.current && setCounts(null));
    lmsService
      .listClassUpdates(classSlug)
      .then((list) => id === reqId.current && setRecent(list))
      .catch(() => id === reqId.current && setRecent([]));
  };

  const openDialog = () => {
    setTitle('');
    setBody('');
    setLinkOverride(null);
    setError(null);
    setResult(null);
    setScope('class');
    setOpen(true);
    load();
  };

  const audienceCount = scope === 'class' ? classAudience : moduleAudience;
  const linkError = linkProblem(link);
  const titleText = title.trim();
  const canSend = !busy && titleText.length > 0 && charCount(titleText) <= TITLE_MAX && charCount(body) <= BODY_MAX && !linkError && audienceCount > 0;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await lmsService.sendClassUpdate(classSlug, {
        title: titleText,
        body: body.trim(),
        scope,
        // The server fills in the default link; only a link the sender changed needs to travel.
        ...(link.trim() && link.trim() !== defaultLink ? { link: link.trim() } : {}),
      });
      setResult(sent);
      lmsService.listClassUpdates(classSlug).then(setRecent).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the update. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendAnother = () => {
    setResult(null);
    setTitle('');
    setBody('');
    setError(null);
    load();
  };

  const pushed = result ? result.push.web + result.push.android : 0;

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" className={LMS_TOOLBAR_BTN} title="Send an update to the people in this class">
        <Icon name="MegaphoneIcon" size={14} />
        <span>Send update</span>
      </button>

      <ClassDialog
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        icon="MegaphoneIcon"
        title="Send an update"
        subtitle={classTitle}
        footer={
          result ? (
            <>
              <button type="button" onClick={sendAnother} className={DIALOG_BTN}>
                Send another
              </button>
              <button type="button" onClick={() => setOpen(false)} className={DIALOG_BTN_PRIMARY}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className={DIALOG_BTN}>
                Cancel
              </button>
              <button type="button" onClick={() => void send()} disabled={!canSend} className={DIALOG_BTN_PRIMARY}>
                {busy ? 'Sending…' : audienceCount > 0 ? `Send to ${people(audienceCount)}` : 'Send update'}
              </button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3 text-center" role="status">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
              <Icon name={result.recipients > 0 ? 'CheckIcon' : 'InformationCircleIcon'} size={28} />
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {result.recipients > 0 ? `Sent to ${people(result.recipients)}` : 'Nobody was notified'}
            </h3>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              {result.recipients > 0
                ? `It is in their notification centre${pushed > 0 ? `, and ${pushed} ${pushed === 1 ? 'device was' : 'devices were'} pushed a notification` : ''}.`
                : 'No one has joined yet, so there was nobody to tell. The update is saved in the list of recent updates.'}
            </p>
          </div>
        ) : (
          <div className="space-y-[1.25rem]">
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-semibold text-foreground">Who gets it</legend>
              <div role="radiogroup" aria-label="Who gets it" className="space-y-2">
                <AudienceOption
                  checked={scope === 'class'}
                  disabled={busy || classAudience === 0}
                  onSelect={() => setScope('class')}
                  title={`People in ${classTitle}`}
                  detail={counts ? (classAudience > 0 ? people(classAudience) : 'No one has joined this class yet.') : 'Counting…'}
                />
                <AudienceOption
                  checked={scope === 'ai-lms'}
                  disabled={busy || moduleAudience === 0}
                  onSelect={() => setScope('ai-lms')}
                  title="Everyone in AI LMS"
                  detail={counts ? (moduleAudience > 0 ? `${people(moduleAudience)} who joined any class` : 'No one has joined a class yet.') : 'Counting…'}
                />
              </div>
              {counts && classAudience === 0 && moduleAudience === 0 && (
                <p className="text-sm text-muted-foreground">
                  Updates reach people who joined a class or turned on its practice reminders. Nobody has yet, so there is no one to send to.
                </p>
              )}
            </fieldset>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="update-title" className="text-sm font-semibold text-foreground">
                  Title
                </label>
                <span className={`text-xs tabular-nums ${charCount(title) > TITLE_MAX ? 'text-rose-500' : 'text-muted-foreground'}`}>
                  {charCount(title)}/{TITLE_MAX}
                </span>
              </div>
              <input
                id="update-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
                placeholder="Week 2 lessons are up"
                className={DIALOG_FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="update-body" className="text-sm font-semibold text-foreground">
                  Message <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <span className={`text-xs tabular-nums ${charCount(body) > BODY_MAX ? 'text-rose-500' : 'text-muted-foreground'}`}>
                  {charCount(body)}/{BODY_MAX}
                </span>
              </div>
              <textarea
                id="update-body"
                rows={4}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={busy}
                placeholder="A line or two on what changed and what to do next."
                className={`${DIALOG_FIELD} resize-y`}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="update-link" className="text-sm font-semibold text-foreground">
                Opens
              </label>
              <input
                id="update-link"
                type="text"
                inputMode="url"
                value={link}
                onChange={(event) => setLinkOverride(event.target.value)}
                disabled={busy}
                aria-invalid={linkError ? true : undefined}
                aria-describedby="update-link-help"
                className={DIALOG_FIELD}
              />
              <p id="update-link-help" className={`text-xs ${linkError ? 'text-rose-500' : 'text-muted-foreground'}`}>
                {linkError ?? 'The page that opens when someone taps the update. It has to be a page inside LabNinja.'}
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-500">
                {error}
              </p>
            )}
          </div>
        )}

        <RecentUpdates updates={recent} />
      </ClassDialog>
    </>
  );
}

function AudienceOption({
  checked,
  disabled,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'border-primary' : 'border-border hover:bg-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${checked ? 'border-primary' : 'border-border'}`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function RecentUpdates({ updates }: { updates: LmsSentUpdate[] | null }) {
  if (updates === null || updates.length === 0) return null;
  return (
    <section className="mt-[1.5rem] border-t border-border pt-[1rem]" aria-label="Recent updates">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Recent updates</h3>
      <ul className="space-y-2">
        {updates.slice(0, 5).map((update) => (
          <li key={update.id} className="rounded-lg border border-border px-3 py-2">
            <p className="break-words text-sm font-medium text-foreground">{update.title}</p>
            <p className="text-xs text-muted-foreground">
              {update.scope === 'ai-lms' ? 'All of AI LMS' : 'This class'} · {people(update.recipient_count)} · {update.sender_name} · {ago(update.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
