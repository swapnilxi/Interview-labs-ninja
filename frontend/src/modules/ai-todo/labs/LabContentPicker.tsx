'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import type { LabName } from '@/lib/services/labSectionsService';
import { LAB_CATALOG, LAB_GROUPS, labsInGroup } from '@/modules/labs/common/labCatalog';
import { useLabProgress } from '@/modules/labs/common/useLabProgress';
import {
  fetchLabTopics,
  groupByCategory,
  labEntry,
  labTopicHref,
  selectionKey,
  subtopicsAreSteps,
  type LabSelection,
  type LabTopic,
} from './labContent';

interface LabContentPickerProps {
  lab: LabName;
  onLabChange: (lab: LabName) => void;
  selection: LabSelection;
  onSelectionChange: (next: LabSelection) => void;
  /** Lab pages already in the target project (see linkedLabNodes): shown as "In project" and not pickable. */
  existing?: ReadonlyMap<string, number>;
  /** `page`: a grouped lab list beside the topics on wide screens. `sheet`: lab chips on every width. */
  layout: 'page' | 'sheet';
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; topics: LabTopic[] }
  | { status: 'error'; message: string };

/**
 * Pick topics (and their lessons) from any lab. The selection is owned by the caller and may span labs; this only
 * shows one lab at a time. Used by Lab plan (Plan & Project) and by "Add from lab" in a project's Explorer.
 */
export default function LabContentPicker({
  lab,
  onLabChange,
  selection,
  onSelectionChange,
  existing,
  layout,
}: LabContentPickerProps) {
  const entry = labEntry(lab);
  const steps = subtopicsAreSteps(lab);
  const progress = useLabProgress(lab);
  // The token lives in localStorage: read it after mount, so the server render (no token) matches the first client one.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => setSignedIn(isLoggedIn()), []);

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    setLoad({ status: 'loading' });
    fetchLabTopics(lab, { fresh: reloadKey > 0 })
      .then((topics) => live && setLoad({ status: 'ready', topics }))
      .catch(
        (err) =>
          live &&
          setLoad({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load the lab.',
          })
      );
    return () => {
      live = false;
    };
  }, [lab, reloadKey, signedIn]);

  // A different lab starts with its own search and disclosure state.
  useEffect(() => {
    setQuery('');
    setExpanded(new Set());
  }, [lab]);

  const topics = useMemo(() => (load.status === 'ready' ? load.topics : []), [load]);
  const doneCount = progress.loaded ? progress.countDone(topics.map((t) => t.id)) : 0;

  const q = query.trim().toLowerCase();
  const subMatches = useCallback(
    (t: LabTopic) => (q ? t.subtopics.filter((s) => s.name.toLowerCase().includes(q)) : []),
    [q]
  );
  const groups = useMemo(() => {
    const visible = topics.filter((t) => {
      if (hideDone && progress.isDone(t.id)) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.brief.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (steps && t.subtopics.some((s) => s.name.toLowerCase().includes(q)))
      );
    });
    return groupByCategory(visible);
  }, [topics, hideDone, progress, q, steps]);

  const isAdded = (topicId: string, subId?: string) =>
    !!existing?.has(labTopicHref(lab, topicId, subId));

  const countForLab = (l: LabName) => {
    let n = 0;
    selection.forEach((p) => {
      if (p.lab === l) n += 1;
    });
    return n;
  };

  /* ── selection ── */
  const toggleTopic = (t: LabTopic) => {
    const key = selectionKey(lab, t.id);
    const next = new Map(selection);
    if (next.has(key)) next.delete(key);
    else
      next.set(key, {
        lab,
        topic: t,
        subtopicIds: steps ? t.subtopics.filter((s) => !isAdded(t.id, s.id)).map((s) => s.id) : [],
      });
    onSelectionChange(next);
  };

  const toggleSub = (t: LabTopic, subId: string) => {
    const key = selectionKey(lab, t.id);
    const next = new Map(selection);
    const cur = next.get(key);
    if (!cur) {
      next.set(key, { lab, topic: t, subtopicIds: [subId] });
    } else {
      const picked = new Set(cur.subtopicIds);
      if (picked.has(subId)) picked.delete(subId);
      else picked.add(subId);
      // Keep the lab's own order, whatever order they were ticked in.
      next.set(key, {
        ...cur,
        subtopicIds: t.subtopics.filter((s) => picked.has(s.id)).map((s) => s.id),
      });
    }
    onSelectionChange(next);
  };

  const setGroup = (list: LabTopic[], on: boolean) => {
    const next = new Map(selection);
    for (const t of list) {
      if (isAdded(t.id)) continue;
      const key = selectionKey(lab, t.id);
      if (!on) next.delete(key);
      else if (!next.has(key))
        next.set(key, {
          lab,
          topic: t,
          subtopicIds: steps
            ? t.subtopics.filter((s) => !isAdded(t.id, s.id)).map((s) => s.id)
            : [],
        });
    }
    onSelectionChange(next);
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ── pieces ── */
  const chips = (
    <div
      className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0 ${layout === 'page' ? 'lg:hidden' : ''}`}
      role="group"
      aria-label="Labs"
    >
      {LAB_CATALOG.map((l) => {
        const n = countForLab(l.key);
        return (
          <button
            key={l.key}
            type="button"
            className="lp-chip"
            aria-pressed={l.key === lab}
            onClick={() => onLabChange(l.key)}
          >
            <Icon name={l.icon} size={15} variant={l.key === lab ? 'solid' : 'outline'} />
            {l.label.replace(/ Lab$/, '')}
            {n > 0 && <span className="lp-chip-count">{n}</span>}
          </button>
        );
      })}
    </div>
  );

  const labList = layout === 'page' && (
    <nav className="hidden lg:block" aria-label="Labs">
      <div className="sticky top-0 space-y-4">
        {LAB_GROUPS.map((g) => (
          <div key={g.id}>
            <p className="lp-group-head">{g.label}</p>
            <div className="drawer-group border" style={{ borderColor: 'var(--color-separator)' }}>
              {labsInGroup(g.id).map((l) => {
                const n = countForLab(l.key);
                return (
                  <button
                    key={l.key}
                    type="button"
                    className="lp-lab-row"
                    aria-pressed={l.key === lab}
                    onClick={() => onLabChange(l.key)}
                  >
                    <span className="drawer-icon drawer-icon-sm">
                      <Icon name={l.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">{l.label}</span>
                    {n > 0 && <span className="drawer-badge">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );

  const body =
    signedIn === false ? (
      <div className="todo-glass flex flex-col items-center gap-3 px-[1.5rem] py-[2.5rem] text-center">
        <span className="todo-icon-chip h-[3rem] w-[3rem] rounded-[14px]">
          <Icon name="BeakerIcon" size={24} />
        </span>
        <div>
          <p className="text-[15px] font-medium text-foreground">
            Sign in to plan from your labs
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Lab topics and your progress are saved to your account.
          </p>
        </div>
        <Link href="/login" className="todo-btn todo-btn-primary mt-1 px-4 py-2">
          Sign in
        </Link>
      </div>
    ) : signedIn === null || load.status === 'loading' ? (
      <div
        className="drawer-group border"
        style={{ borderColor: 'var(--color-separator)' }}
        role="status"
        aria-label={`Loading ${entry.label}`}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="lp-row">
            <span className="skeleton h-[1.375rem] w-[1.375rem] rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-3.5 w-2/5 rounded" />
              <span className="skeleton block h-3 w-4/5 rounded" />
            </span>
          </div>
        ))}
      </div>
    ) : load.status === 'error' ? (
      <div className="todo-alert todo-alert-error" role="alert">
        <Icon name="ExclamationTriangleIcon" size={16} className="mt-px" />
        <p className="flex-1 text-[13px] leading-relaxed text-inherit">{load.message}</p>
        <button type="button" className="lp-text-btn" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </button>
      </div>
    ) : groups.length === 0 ? (
      <p className="px-4 py-[2rem] text-center text-[14px] text-muted-foreground">
        {q ? (
          <>
            No {entry.noun} match &ldquo;{query.trim()}&rdquo;.
          </>
        ) : (
          `Every ${entry.noun.replace(/s$/, '')} here is done.`
        )}
      </p>
    ) : (
      <div className="space-y-5">
        {groups.map((g) => {
          const pickable = g.topics.filter((t) => !isAdded(t.id));
          const allOn =
            pickable.length > 0 && pickable.every((t) => selection.has(selectionKey(lab, t.id)));
          return (
            <section key={g.category} aria-label={g.category}>
              <div className="lp-group-head">
                <span className="min-w-0">
                  {g.category}
                  <span className="ml-1.5 font-normal">{g.topics.length}</span>
                </span>
                <button
                  type="button"
                  className="lp-text-btn"
                  disabled={pickable.length === 0}
                  onClick={() => setGroup(pickable, !allOn)}
                >
                  {allOn ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div
                className="drawer-group border"
                style={{ borderColor: 'var(--color-separator)' }}
              >
                {g.topics.map((t) => {
                  const pick = selection.get(selectionKey(lab, t.id));
                  const added = isAdded(t.id);
                  const done = progress.isDone(t.id);
                  const subs = steps ? t.subtopics : [];
                  const matched = subMatches(t);
                  const open =
                    subs.length > 0 &&
                    (expanded.has(t.id) || (q !== '' && steps && matched.length > 0));
                  const partial =
                    !!pick &&
                    subs.length > 0 &&
                    pick.subtopicIds.length < subs.filter((s) => !isAdded(t.id, s.id)).length;
                  const inputId = `lp-${lab}-${t.id}`;
                  return (
                    <Fragment key={t.id}>
                      <div className="lp-row" data-disabled={added}>
                        <label htmlFor={inputId} className="lp-pick">
                          <input
                            id={inputId}
                            type="checkbox"
                            className="sr-only"
                            checked={!!pick || added}
                            disabled={added}
                            onChange={() => toggleTopic(t)}
                          />
                          <span
                            className="lp-check"
                            data-checked={!!pick && !partial}
                            data-partial={partial}
                            data-disabled={added}
                            aria-hidden="true"
                          >
                            <Icon
                              name={partial ? 'MinusIcon' : 'CheckIcon'}
                              size={14}
                              strokeWidth={3}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium leading-snug text-foreground">
                              {t.name}
                            </span>
                            {t.brief && (
                              <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
                                {t.brief}
                              </span>
                            )}
                            {(t.difficulty || done || added) && (
                              <span className="mt-1.5 flex flex-wrap gap-1.5">
                                {added && (
                                  <span className="lp-tag lp-tag-added">
                                    <Icon name="CheckIcon" size={11} /> In project
                                  </span>
                                )}
                                {done && (
                                  <span className="lp-tag lp-tag-done">
                                    <Icon name="CheckCircleIcon" size={11} variant="solid" /> Done
                                  </span>
                                )}
                                {t.difficulty && <span className="lp-tag">{t.difficulty}</span>}
                              </span>
                            )}
                          </span>
                        </label>
                        {subs.length > 0 && (
                          <button
                            type="button"
                            className="lp-disclose"
                            aria-expanded={open}
                            aria-controls={`${inputId}-subs`}
                            aria-label={`${open ? 'Hide' : 'Show'} the ${subs.length} lessons in ${t.name}`}
                            onClick={() => toggleExpanded(t.id)}
                          >
                            {pick ? `${pick.subtopicIds.length}/${subs.length}` : subs.length}
                            <Icon name="ChevronRightIcon" size={13} />
                          </button>
                        )}
                      </div>
                      {open && (
                        <div
                          id={`${inputId}-subs`}
                          className="lp-subs"
                          role="group"
                          aria-label={`Lessons in ${t.name}`}
                        >
                          {subs.map((s) => {
                            const subAdded = isAdded(t.id, s.id);
                            const on = !!pick?.subtopicIds.includes(s.id);
                            const subId = `${inputId}-${s.id}`;
                            return (
                              <div key={s.id} className="lp-row" data-disabled={subAdded}>
                                <label htmlFor={subId} className="lp-pick">
                                  <input
                                    id={subId}
                                    type="checkbox"
                                    className="sr-only"
                                    checked={on || subAdded}
                                    disabled={subAdded}
                                    onChange={() => toggleSub(t, s.id)}
                                  />
                                  <span
                                    className="lp-check lp-check-sm"
                                    data-checked={on}
                                    data-disabled={subAdded}
                                    aria-hidden="true"
                                  >
                                    <Icon name="CheckIcon" size={12} strokeWidth={3} />
                                  </span>
                                  <span className="min-w-0 flex-1 text-[14px] leading-snug text-foreground">
                                    {s.name}
                                    {subAdded && (
                                      <span className="lp-tag lp-tag-added ml-2 align-middle">
                                        In project
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );

  return (
    <div
      className={
        layout === 'page'
          ? 'grid gap-[1.25rem] lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-[2rem]'
          : 'flex flex-col gap-3'
      }
    >
      {labList}
      <div className="flex min-w-0 flex-col gap-3">
        {chips}

        {/* The lab: what it is, how far along you are, and a way into it */}
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[17px] font-medium leading-tight text-foreground">{entry.label}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              {load.status === 'ready'
                ? progress.loaded && doneCount > 0
                  ? `${doneCount} of ${topics.length} ${entry.noun} done`
                  : `${topics.length} ${entry.noun}`
                : entry.hint}
              {!steps && load.status === 'ready' && ' · each one is added as a single task'}
            </p>
          </div>
          <Link
            href={entry.path}
            className="todo-btn todo-btn-ghost -mr-2 shrink-0 px-2.5 py-1.5"
            target="_blank"
            rel="noopener"
          >
            Open lab <Icon name="ArrowUpRightIcon" size={13} />
          </Link>
        </div>

        {signedIn && load.status === 'ready' && topics.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="lp-search flex-1">
              <Icon name="MagnifyingGlassIcon" size={16} />
              <span className="sr-only">Search {entry.label}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${entry.noun}`}
                enterKeyHint="search"
              />
            </label>
            {doneCount > 0 && (
              <button
                type="button"
                className="lp-chip"
                aria-pressed={hideDone}
                onClick={() => setHideDone((v) => !v)}
              >
                Hide done
              </button>
            )}
          </div>
        )}

        {body}
      </div>
    </div>
  );
}
