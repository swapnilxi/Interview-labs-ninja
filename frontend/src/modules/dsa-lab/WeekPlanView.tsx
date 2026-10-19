'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useUrlState } from '@/lib/navigation/urlState';
import { toast } from '@/lib/ui/toast';
import { DoneMark } from '@/modules/common/lab/LabProgressUi';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';
import AutoOrganizerWizard from './AutoOrganizerWizard';
import PlanProfileMenu from './PlanProfileMenu';
import type { DSATopic } from './types';
import { DifficultyTag, LcTag } from './ui';
import { useSettledSelect } from './useSettledSelect';
import type { WeekPlanApi } from './useWeekPlan';
import {
  WEEK_CAP,
  blockCount,
  blockLabel,
  blockWeeks,
  lcNumber,
  patternGroups,
  weekCounts,
  weekTheme,
} from './weekPlan';

/** Which Organize button opened the organizer: Back returns focus to it (DSALabModule finds it by `data-organize-trigger`). */
export type OrganizeTrigger = 'header' | 'toolbar';

/**
 * Where a jumped-to week lands: below the sticky toolbar (3.5rem, plus a little room) and, on phones, below the Topics bar
 * above it (7.5rem). A control focused with Tab is kept clear of the same strips by `.dsa-plan-page` in tailwind.css.
 */
const WEEK_SCROLL_MARGIN = 'scroll-mt-[7.5rem] md:scroll-mt-[4.5rem]';

/** Content-pane widths (px) at which the sticky toolbar sheds its button labels, then its plan menu. */
const TOOLBAR_LABELS_MIN = 640;
const TOOLBAR_MENU_MIN = 480;

/** "Week 3 (5/7)" options for every week (a full week can't be picked unless it is the question's own), then "Not in a week". */
function WeekSelect({
  topic,
  week,
  counts,
  onMove,
}: {
  topic: DSATopic;
  week: number | null;
  counts: number[];
  onMove: (topic: DSATopic, week: number | null, from: HTMLElement) => void;
}) {
  // An arrow key on a closed select only previews a week; Enter or leaving the select moves the question (see the hook).
  const select = useSettledSelect(String(week ?? 0), (next, from) =>
    onMove(topic, Number(next) || null, from)
  );
  return (
    <select
      aria-label={`Week for ${topic.name}`}
      {...select}
      className="todo-input todo-input-quiet h-8 w-auto max-w-[10rem] cursor-pointer px-2 text-xs"
    >
      {counts.map((count, i) => {
        const w = i + 1;
        const full = w !== week && count >= WEEK_CAP;
        return (
          <option key={w} value={w} disabled={full}>
            {`Week ${w} (${count}/${WEEK_CAP})${full ? ' · full' : ''}`}
          </option>
        );
      })}
      <option value={0}>Not in a week</option>
    </select>
  );
}

/** One question: name (opens it), pattern and LeetCode number, difficulty, done mark and the week select. */
function QuestionRow({
  topic,
  week,
  counts,
  onOpen,
  onMove,
}: {
  topic: DSATopic;
  week: number | null;
  counts: number[];
  onOpen: (id: string) => void;
  onMove: (topic: DSATopic, week: number | null, from: HTMLElement) => void;
}) {
  return (
    <li className="todo-row flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2.5">
      <div className="min-w-0 flex-1 basis-[11rem]">
        <button
          type="button"
          onClick={() => onOpen(topic.id)}
          className="todo-focus dsa-heading block max-w-full break-words rounded text-left text-sm font-medium leading-snug text-foreground transition-colors hover:lab-ink"
        >
          {topic.name}
        </button>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] font-medium leading-snug mix-text-foreground/[0.74]">
          <span className="break-words">{topic.category}</span>
          {lcNumber(topic.brief) !== null && <span aria-hidden="true">·</span>}
          <LcTag brief={topic.brief} className="flex-shrink-0" />
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <DifficultyTag difficulty={topic.difficulty} />
        <DoneMark lab="dsa" topicId={topic.id} />
        <WeekSelect topic={topic} week={week} counts={counts} onMove={onMove} />
      </div>
    </li>
  );
}

/**
 * "Jump to week": scrolls to a week and puts focus on it. Jumping moves focus out of the select, so it waits for Enter or a
 * click on an option instead of acting on every arrow key (and leaving the select without choosing does nothing).
 */
function JumpSelect({
  weeks,
  counts,
  onJump,
}: {
  weeks: number;
  counts: number[];
  onJump: (week: number) => void;
}) {
  const select = useSettledSelect(
    '',
    (next) => {
      const w = Number(next);
      if (w) onJump(w);
    },
    { commitOnBlur: false }
  );
  return (
    <select
      aria-label="Jump to week"
      {...select}
      className="todo-input todo-input-quiet h-8 w-auto max-w-[9rem] cursor-pointer px-2 text-xs"
    >
      <option value="">Jump to week</option>
      {Array.from({ length: blockCount(weeks) }, (_, b) => (
        <optgroup key={b} label={blockLabel(b, weeks)}>
          {blockWeeks(b, weeks).map((w) => (
            <option key={w} value={w}>
              {`Week ${w} (${counts[w - 1] ?? 0}/${WEEK_CAP})`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** The plan's controls: profile menu, Jump to week, Auto organize and Organize. `compact` is the sticky toolbar's version. */
function PlanActions({
  weekPlan,
  counts,
  compact = false,
  hidden = false,
  paneWidth = 0,
  onJump,
  onAuto,
  onOrganize,
}: {
  weekPlan: WeekPlanApi;
  counts: number[];
  compact?: boolean;
  /** The sticky toolbar is out of sight: its plan menu must not stay open over the header. */
  hidden?: boolean;
  /** Width of the lab's content pane (0 = not measured yet). The compact toolbar sheds labels, then the plan menu, to fit it. */
  paneWidth?: number;
  onJump: (week: number) => void;
  onAuto: () => void;
  onOrganize: (trigger: OrganizeTrigger) => void;
}) {
  const { weeks } = weekPlan.plan;
  // The compact toolbar never wraps, so it must fit the pane: below TOOLBAR_LABELS_MIN the buttons are icon-only, below
  // TOOLBAR_MENU_MIN the plan menu goes too (the header above still has it).
  const iconOnly = compact && paneWidth > 0 && paneWidth < TOOLBAR_LABELS_MIN;
  const showMenu = !compact || paneWidth === 0 || paneWidth >= TOOLBAR_MENU_MIN;
  return (
    <div className={`flex items-center gap-2 ${compact ? 'ml-auto flex-shrink-0' : 'flex-wrap'}`}>
      <div className={showMenu ? undefined : 'hidden'}>
        <PlanProfileMenu weekPlan={weekPlan} compact suspended={hidden} />
      </div>
      <JumpSelect weeks={weeks} counts={counts} onJump={onJump} />
      <button
        type="button"
        onClick={onAuto}
        className="todo-btn todo-btn-secondary h-8"
        title="Answer a few questions and let AI plan your weeks"
      >
        <Icon name="SparklesIcon" size={14} />
        <span className={iconOnly ? 'sr-only' : undefined}>Auto organize</span>
      </button>
      <button
        type="button"
        onClick={() => onOrganize(compact ? 'toolbar' : 'header')}
        data-organize-trigger={compact ? 'toolbar' : 'header'}
        className="todo-btn todo-btn-primary h-8"
        title="Open the week organizer: drag questions between weeks, add and reorder weeks"
      >
        <Icon name="ViewColumnsIcon" size={14} />
        <span className={compact && iconOnly ? 'sr-only' : undefined}>Organize</span>
      </button>
    </div>
  );
}

/** One week: "Week N", its focus label, n/7 with a capacity bar, what is done, then its questions. */
function WeekCard({
  week,
  label,
  questions,
  count,
  counts,
  doneCount,
  canFill,
  onOpen,
  onMove,
  onFill,
  onOrganize,
}: {
  week: number;
  label: string;
  questions: DSATopic[];
  count: number;
  counts: number[];
  doneCount: number;
  canFill: boolean;
  onOpen: (id: string) => void;
  onMove: (topic: DSATopic, week: number | null, from: HTMLElement) => void;
  onFill: (week: number) => void;
  onOrganize: () => void;
}) {
  const full = count >= WEEK_CAP; // a full week is the goal, so it gets no warning colour
  const focus = label || weekTheme(questions.map((q) => q.category));
  return (
    <section
      id={`week-${week}`}
      data-week-list
      tabIndex={-1}
      aria-labelledby={`week-${week}-title`}
      className={`flex flex-col rounded-lg border outline-none mix-bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring ${WEEK_SCROLL_MARGIN}`}
    >
      <header className="px-4 pb-3 pt-3.5">
        <div className="flex items-baseline gap-2">
          <h4 id={`week-${week}-title`} className="flex-shrink-0 text-sm font-semibold lab-ink">
            Week {week}
          </h4>
          {/* The week's focus is a name: it wraps instead of ending in an ellipsis. */}
          <span
            data-week-focus
            className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug mix-text-foreground/[0.74]"
            title={focus || undefined}
          >
            {focus}
          </span>
          <span
            className={`flex-shrink-0 text-xs font-semibold tabular-nums ${full ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {count}/{WEEK_CAP}
            {full && <span className="sr-only"> (full)</span>}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-1.5 flex-1 overflow-hidden rounded-full mix-bg-foreground/10"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, (count / WEEK_CAP) * 100)}%` }}
            />
          </div>
          {doneCount > 0 && (
            <span className="flex-shrink-0 text-xs font-medium tabular-nums text-success">
              {doneCount} done
            </span>
          )}
        </div>
      </header>

      {questions.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-[13px] font-medium mix-text-foreground/[0.74]">
            No questions in this week yet.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => onOrganize()}
              className="todo-focus rounded text-xs font-semibold lab-ink hover:underline"
            >
              Open the organizer
            </button>
            {canFill && (
              <button
                type="button"
                onClick={() => onFill(week)}
                className="todo-focus rounded text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
              >
                Fill with suggestions
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="px-1.5 pb-1.5">
          {questions.map((t) => (
            <QuestionRow
              key={t.id}
              topic={t}
              week={week}
              counts={counts}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The Wiki's week-wise view: the plan in blocks of four weeks, each week a card with a move select on every question,
 * and the questions in no week in a collapsible pool at the end. The organizer (?organize=1) is the drag-and-drop
 * board for the same plan; the wizard plans it from a few answers.
 */
export default function WeekPlanView({
  topics,
  weekPlan,
  onOpen,
  onBeforeOrganize,
}: {
  topics: DSATopic[];
  weekPlan: WeekPlanApi;
  onOpen: (id: string) => void;
  /** Called as the organizer opens (this view is replaced by it): the lab remembers the scroll position and the button. */
  onBeforeOrganize?: (trigger: OrganizeTrigger) => void;
}) {
  const { update } = useUrlState();
  const progress = useLabProgress('dsa');
  const [poolOpen, setPoolOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [barShown, setBarShown] = useState(false);
  const [paneWidth, setPaneWidth] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const { plan } = weekPlan;

  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const counts = weekCounts(plan);
  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1);
  const lists = weeks.map((w) =>
    weekPlan
      .weekQuestions(w)
      .map((id) => byId.get(id))
      .filter((t): t is DSATopic => !!t)
  );
  const plannedIds = lists.flat().map((t) => t.id);
  const doneTotal = progress.countDone(plannedIds);
  const pool = weekPlan.queue.map((id) => byId.get(id)).filter((t): t is DSATopic => !!t);
  const poolGroups = patternGroups(pool);
  const planName =
    weekPlan.activeProfile?.name ?? (weekPlan.isCustom ? 'Your plan' : 'Suggested plan');

  // The sticky toolbar shows once the header (and its buttons) has scrolled out of the lab's content pane.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? 0;
        setBarShown(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1);
      },
      { root: el.closest('.lab-main'), rootMargin: '-56px 0px 0px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The lab's content pane is only 400-650px wide on a small laptop with both side panels open: the toolbar adapts to it.
  useEffect(() => {
    const pane = headerRef.current?.closest<HTMLElement>('.lab-main');
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPaneWidth(pane.clientWidth));
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);

  // Move toasts offer Undo for that move only: once the plan changes again (another move, an undo, a plan switch) they go away.
  const undoToasts = useRef(new Map<number, number>()); // toast id -> plan version right after its move
  useEffect(() => {
    const version = weekPlan.getVersion();
    for (const [id, at] of undoToasts.current) {
      if (at === version) continue;
      toast.dismiss(id);
      undoToasts.current.delete(id);
    }
  });

  const openOrganizer = (trigger: OrganizeTrigger = 'header') => {
    onBeforeOrganize?.(trigger);
    update({ organize: 1 });
  };
  const openWizard = () => setWizardOpen(true);

  const jumpTo = (w: number) => {
    const el = document.getElementById(`week-${w}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  const moveTo = (t: DSATopic, week: number | null, from: HTMLElement) => {
    // The row leaves this list, taking the focused select with it: keep keyboard focus on the list it left.
    const list = from.closest<HTMLElement>('[data-week-list]');
    const message = weekPlan.move(t.id, week);
    if (message) {
      toast.error(message);
      return;
    }
    // The hook has one undo stack, so this Undo only counts while this move is still the latest change (see the effect above).
    const version = weekPlan.getVersion();
    let id = -1;
    id = toast.success(
      week ? `${t.name} moved to Week ${week}.` : `${t.name} is no longer in a week.`,
      {
        action: {
          label: 'Undo',
          onClick: () => {
            undoToasts.current.delete(id);
            if (weekPlan.getVersion() === version) weekPlan.undo();
          },
        },
      }
    );
    if (id >= 0) undoToasts.current.set(id, version);
    requestAnimationFrame(() => list?.focus({ preventScroll: true }));
  };

  const fill = (w: number) => {
    const message = weekPlan.fillWeek(w);
    if (message) {
      toast.error(message);
      return;
    }
    // The "Fill with suggestions" button is gone once the week has questions: keep keyboard focus on the week.
    requestAnimationFrame(() =>
      document.getElementById(`week-${w}`)?.focus({ preventScroll: true })
    );
  };

  const actions = {
    weekPlan,
    counts,
    onJump: jumpTo,
    onAuto: openWizard,
    onOrganize: openOrganizer,
  };

  return (
    <div className="dsa-plan-page relative">
      {/* Slim sticky toolbar with the plan's key actions, shown once the header has scrolled away. The wrapper has no
          height, so it never pushes the weeks down; its glass strip floats over them as they scroll under it. */}
      <div className="sticky top-[3.5rem] z-20 -mx-5 h-0 sm:-mx-8 md:top-0">
        <div
          inert={!barShown ? true : undefined}
          className={`dsa-glass-bar absolute inset-x-0 top-0 transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none ${
            barShown ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
          }`}
        >
          <div className="flex items-center gap-2 px-5 py-2 sm:px-8">
            <p
              title={`Week plan · ${planName}`}
              className={`min-w-0 flex-1 truncate text-[13px] font-medium mix-text-foreground/[0.74] ${paneWidth > 0 && paneWidth < TOOLBAR_MENU_MIN ? 'hidden' : ''}`}
            >
              <span className="font-semibold text-foreground">Week plan</span> · {planName}
            </p>
            <PlanActions {...actions} compact hidden={!barShown} paneWidth={paneWidth} />
          </div>
        </div>
      </div>

      {/* Header: a plain hairline card (the signature wash belongs to the wiki hero) */}
      <header ref={headerRef} className="rounded-lg border bg-card p-[1.25rem] sm:p-[1.5rem]">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-[15rem]">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
                Week-by-week plan
              </h2>
              {/* Visual only: a live region here would speak "Saving…" after every edit, on top of the toast that says what moved. */}
              <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
                {weekPlan.switching ? 'Switching plans…' : weekPlan.saving ? 'Saving…' : ''}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium tabular-nums mix-text-foreground/[0.74]">
              {weekPlan.loaded ? planName : 'Loading your plan…'} · {plan.weeks}{' '}
              {plan.weeks === 1 ? 'week' : 'weeks'} · {plannedIds.length} of {topics.length} planned
              · {doneTotal} done
            </p>
            {weekPlan.hiddenCount > 0 && (
              <p className="mt-0.5 text-[13px] font-medium mix-text-foreground/[0.74]">
                {weekPlan.hiddenCount} saved{' '}
                {weekPlan.hiddenCount === 1 ? 'question is' : 'questions are'} not in the
                lab&rsquo;s question list right now. They stay in your plan and still count toward
                each week&rsquo;s limit of {WEEK_CAP}.
              </p>
            )}
          </div>
          <PlanActions {...actions} />
        </div>
      </header>

      {weekPlan.error && (
        <div role="alert" className="todo-alert todo-alert-error mt-4">
          <Icon name="ExclamationTriangleIcon" size={16} className="mt-px flex-shrink-0" />
          <p className="min-w-0 flex-1">{weekPlan.error}</p>
          {weekPlan.loadError && (
            <button
              type="button"
              onClick={() => void weekPlan.retryLoad()}
              className="todo-btn todo-btn-secondary -my-1 h-7 flex-shrink-0 px-2.5"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={weekPlan.clearError}
            aria-label="Dismiss"
            title="Dismiss"
            className="todo-focus -my-0.5 flex-shrink-0 rounded p-0.5 transition-smooth hover:mix-bg-foreground/[0.08]"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

      {topics.length === 0 ? (
        <div
          aria-hidden="true"
          className="mt-[2rem] grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-[1.25rem]"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[9rem] rounded-lg mix-bg-foreground/[0.05] motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="mt-[2rem] space-y-[2rem]">
          {Array.from({ length: blockCount(plan.weeks) }, (_, b) => {
            const blockList = blockWeeks(b, plan.weeks);
            const ids = blockList.flatMap((w) => lists[w - 1].map((t) => t.id));
            const cap = blockList.length * WEEK_CAP;
            const done = progress.countDone(ids);
            return (
              <section
                key={b}
                aria-labelledby={`week-block-${b}`}
                className={`space-y-4 ${b > 0 ? 'border-t pt-[2rem]' : ''}`}
              >
                {/* Block header: accent dot, "WEEKS 1–4", how full and how done, and a short progress line right beside it */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-primary"
                  />
                  <h3 id={`week-block-${b}`} className="dsa-caption text-foreground">
                    {blockLabel(b, plan.weeks)}
                  </h3>
                  <span className="text-xs font-medium tabular-nums mix-text-foreground/[0.74]">
                    {ids.length} of {cap} planned · {done} done
                  </span>
                  <div
                    className="h-1.5 w-[9rem] max-w-full flex-shrink-0 overflow-hidden rounded-full mix-bg-foreground/10"
                    role="progressbar"
                    aria-label={`${blockLabel(b, plan.weeks)}: ${done} of ${ids.length} done`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(ids.length, 1)}
                    aria-valuenow={done}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
                      style={{ width: `${ids.length ? (done / ids.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {/* Columns follow the pane's width (the sidebars take a varying share of the window): two side by side when they fit. */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-[1.25rem]">
                  {blockList.map((w) => (
                    <WeekCard
                      key={w}
                      week={w}
                      label={plan.labels[String(w)] ?? ''}
                      questions={lists[w - 1]}
                      count={counts[w - 1] ?? 0}
                      counts={counts}
                      doneCount={progress.countDone(lists[w - 1].map((t) => t.id))}
                      canFill={lists[w - 1].length === 0 && pool.length > 0}
                      onOpen={onOpen}
                      onMove={moveTo}
                      onFill={fill}
                      onOrganize={() => openOrganizer(barShown ? 'toolbar' : 'header')}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Questions in no week, grouped by pattern in learning order */}
          {pool.length > 0 && (
            <section
              data-week-list
              tabIndex={-1}
              aria-labelledby="week-pool-title"
              className="rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h3 id="week-pool-title">
                <button
                  type="button"
                  onClick={() => setPoolOpen((o) => !o)}
                  aria-expanded={poolOpen}
                  aria-controls="week-pool"
                  className="todo-focus flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-4 py-3.5 text-left transition-smooth hover:mix-bg-foreground/[0.04]"
                >
                  <Icon
                    name={poolOpen ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                    size={14}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                  <span className="dsa-caption text-foreground">Not in a week</span>
                  <span className="text-xs font-medium tabular-nums mix-text-foreground/[0.74]">
                    {pool.length} {pool.length === 1 ? 'question' : 'questions'}
                  </span>
                  <span className="ml-auto hidden text-[13px] font-medium mix-text-foreground/[0.74] sm:inline">
                    Optional: pull any of them into a week
                  </span>
                </button>
              </h3>
              {poolOpen && (
                <div id="week-pool" className="border-t px-1.5 pb-2">
                  {poolGroups.map((group) => (
                    <div key={group.key}>
                      <p className="dsa-caption px-2.5 pb-1 pt-4 mix-text-foreground/[0.74]">
                        {group.name} <span className="tabular-nums">· {group.ids.length}</span>
                      </p>
                      <ul>
                        {group.ids.map((id) => {
                          const t = byId.get(id);
                          return t ? (
                            <QuestionRow
                              key={id}
                              topic={t}
                              week={null}
                              counts={counts}
                              onOpen={onOpen}
                              onMove={moveTo}
                            />
                          ) : null;
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <AutoOrganizerWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        topics={topics}
        weekPlan={weekPlan}
      />
    </div>
  );
}
