'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { isMissingKeyError } from '@/lib/services/settingsService';
import type { AutoPlanResult } from '@/lib/services/dsaWeekPlanService';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';
import type { WeekPlanApi } from './useWeekPlan';
import { Tag } from './ui';
import {
  AUTO_PER_WEEK_OPTIONS,
  DEFAULT_AUTO_ANSWERS,
  DIFFICULTY_OPTIONS,
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  localOrganize,
  MAX_PROFILES,
  MAX_WEEKS,
  NOTES_MAX,
  patternGroups,
  patternKey,
  STYLE_OPTIONS,
  SUMMARY_MAX,
  TIMELINE_PRESETS,
  WEEK_CAP,
  weekCounts,
  weeksUntil,
  type AutoAnswers,
  type PlanTopic,
  type WeekPlan,
} from './weekPlan';
import { ChipGroup, FieldHeading, RadioCards } from './plan/ChoiceControls';
import InlineNameForm from './plan/InlineNameForm';
import PlanPreview from './plan/PlanPreview';
import {
  daysUntil,
  formatDate,
  loadWizardAnswers,
  localIsoDate,
  saveWizardAnswers,
  type TimelineMode,
} from './plan/wizardStorage';

/**
 * "Auto organize": a five-step questionnaire (timeline, you, patterns, style, review) that plans the
 * weeks with AI (POST /dsa/week-plan/auto through `weekPlan.autoOrganize`) or, without AI, with
 * `localOrganize`. An AI plan is saved straight away as a new, inactive plan profile so nothing is
 * lost; a quick plan is only kept if the learner saves it or uses it to replace the current plan.
 *
 * Closing while the AI is still thinking doesn't cancel it: the plan is saved when it arrives and a
 * toast says so (the dialog itself ignores the late result). Answers are remembered per browser.
 */

type StepId = 'timeline' | 'you' | 'patterns' | 'style' | 'review';
type Step = StepId | 'result';

const STEPS: { id: StepId; title: string; heading: string; intro: string }[] = [
  {
    id: 'timeline',
    title: 'Timeline',
    heading: 'How long do you have?',
    intro: 'Pick a number of weeks, or the date of your interview.',
  },
  {
    id: 'you',
    title: 'You',
    heading: 'Where are you starting from?',
    intro: 'Your level and goal shape the order and the mix of questions.',
  },
  {
    id: 'patterns',
    title: 'Patterns',
    heading: 'Which patterns matter most?',
    intro: 'Optional. Leave both empty to follow the lab’s learning order.',
  },
  {
    id: 'style',
    title: 'Style',
    heading: 'How should the weeks feel?',
    intro: 'Difficulty, how patterns mix inside a week, and anything else worth knowing.',
  },
  {
    id: 'review',
    title: 'Review',
    heading: 'Check your answers',
    intro: 'Plan with AI, or make a quick plan from the lab’s learning order without AI.',
  },
];

type SaveState =
  | { status: 'saving'; name: string }
  | { status: 'saved'; id: number; name: string }
  | { status: 'error'; message: string };

interface Result {
  kind: 'ai' | 'quick';
  plan: WeekPlan;
  summary: string;
  /** The AI's picks that were left out (unknown, repeated or over the weekly cap). */
  dropped: number;
  /** AI plans only: the automatic save as a new plan profile. */
  save: SaveState | null;
}

const BUSY_MESSAGE = 'Your plan is still loading. Try again in a moment.';
const LIMIT_MESSAGE = `You can keep at most ${MAX_PROFILES} plans. Delete one first.`;
const BTN = 'todo-btn justify-center px-4 py-2';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;
const labelOf = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((o) => o.value === value)?.label ?? value;

export default function AutoOrganizerWizard({
  isOpen,
  onClose,
  topics,
  weekPlan,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** The lab's questions (DSATopic fits), in any order. */
  topics: readonly PlanTopic[];
  weekPlan: WeekPlanApi;
}) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const stepTextId = `${uid}-step`;
  const timelineNoteId = `${uid}-timeline-note`;
  const dateId = `${uid}-date`;
  const notesId = `${uid}-notes`;
  const notesCountId = `${uid}-notes-count`;
  const progress = useLabProgress('dsa');

  const [step, setStep] = useState<Step>('timeline');
  const [answers, setAnswers] = useState<AutoAnswers>(DEFAULT_AUTO_ANSWERS);
  const [timeline, setTimeline] = useState<TimelineMode>('weeks');
  const [date, setDate] = useState('');
  const [weeksText, setWeeksText] = useState(String(DEFAULT_AUTO_ANSWERS.weeks));
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [panel, setPanel] = useState<'rename' | 'save' | null>(null);
  const [switchingTo, setSwitchingTo] = useState(false);

  // Latest hook object for code that runs after an await (or after the dialog closed).
  const wpRef = useRef(weekPlan);
  wpRef.current = weekPlan;
  const mountedRef = useRef(false);
  /** Bumped on every run and on close: a request whose number is stale only saves and toasts. */
  const runRef = useRef(0);
  const hydrated = useRef(false);
  const touched = useRef(false);
  const reachedReview = useRef(false);
  const stepMoved = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Timeline ────────────────────────────────────────────────────────────────────────────────
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localIsoDate(tomorrowDate);
  const dateDays = timeline === 'date' ? daysUntil(date) : null;
  const typedWeeks = /^\d{1,2}$/.test(weeksText.trim()) ? Number(weeksText.trim()) : NaN;
  const weeksValid =
    timeline === 'weeks'
      ? typedWeeks >= 1 && typedWeeks <= MAX_WEEKS
      : dateDays !== null && dateDays > 0;
  const effectiveWeeks = !weeksValid
    ? answers.weeks
    : timeline === 'weeks'
      ? typedWeeks
      : (weeksUntil(date) ?? answers.weeks);
  const timelineError = weeksValid
    ? null
    : timeline === 'weeks'
      ? `Enter a whole number of weeks from 1 to ${MAX_WEEKS}.`
      : date
        ? 'Pick a date after today.'
        : 'Pick the date of your interview.';
  const timelineNote =
    timeline === 'weeks'
      ? `A plan can run from 1 to ${MAX_WEEKS} weeks.`
      : `${formatDate(date)} is ${plural(dateDays ?? 0, 'day')} away, so the plan has ${plural(
          effectiveWeeks,
          'week'
        )}.${Math.ceil((dateDays ?? 0) / 7) > MAX_WEEKS ? ` Plans go up to ${MAX_WEEKS} weeks.` : ''}`;

  // ── Patterns and counts ─────────────────────────────────────────────────────────────────────
  const groups = useMemo(() => patternGroups(topics), [topics]);
  const chipItems = useMemo(
    () => groups.map((g) => ({ key: g.key, name: g.name, count: g.ids.length })),
    [groups]
  );
  const focusKeys = useMemo(() => new Set(answers.focus.map(patternKey)), [answers.focus]);
  const weakKeys = useMemo(() => new Set(answers.weak.map(patternKey)), [answers.weak]);
  /** Pattern names as this lab spells them (saved answers may use another spelling). */
  const namesFor = (keys: ReadonlySet<string>) =>
    groups.filter((g) => keys.has(g.key)).map((g) => g.name);
  const focusNames = groups.length ? namesFor(focusKeys) : answers.focus;
  const weakNames = groups.length ? namesFor(weakKeys) : answers.weak;

  const allIds = useMemo(() => topics.map((t) => t.id), [topics]);
  const solved = progress.countDone(allIds);
  const available = answers.includeDone ? topics.length : topics.length - solved;
  const capacity = effectiveWeeks * answers.perWeek;

  const finalAnswers: AutoAnswers = {
    ...answers,
    weeks: effectiveWeeks,
    focus: focusNames,
    weak: weakNames,
  };

  // ── Remembered answers ──────────────────────────────────────────────────────────────────────
  // (Declared before the restore effect: on the opening render this sees hydrated = false.)
  useEffect(() => {
    if (!hydrated.current || !touched.current) return;
    saveWizardAnswers({ answers: { ...answers, weeks: effectiveWeeks }, timeline, date });
  }, [answers, effectiveWeeks, timeline, date]);

  // The first time it opens: restore last time's answers and start on the review step.
  useEffect(() => {
    if (!isOpen || hydrated.current) return;
    hydrated.current = true;
    const saved = loadWizardAnswers();
    if (!saved) return;
    setAnswers(saved.answers);
    setWeeksText(String(saved.answers.weeks));
    setTimeline(saved.timeline);
    setDate(saved.date);
    setRestored(true);
    const staleDate = saved.timeline === 'date' && !((daysUntil(saved.date) ?? 0) > 0);
    reachedReview.current = !staleDate;
    setStep(staleDate ? 'timeline' : 'review');
  }, [isOpen]);

  // Moving between steps puts focus on the new step's heading (and scrolls back to the top).
  useEffect(() => {
    if (!stepMoved.current) return;
    stepMoved.current = false;
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const patch = (changes: Partial<AutoAnswers>) => {
    touched.current = true;
    setAnswers((a) => ({ ...a, ...changes }));
  };
  const go = (next: Step) => {
    if (next === 'review') reachedReview.current = true;
    stepMoved.current = true;
    setStep(next);
  };
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const next = () => {
    if (stepIndex < 0 || stepIndex >= STEPS.length - 1) return;
    if (step === 'timeline' && !weeksValid) return;
    go(STEPS[stepIndex + 1].id);
  };
  const back = () => {
    if (stepIndex > 0) go(STEPS[stepIndex - 1].id);
  };

  const setWeeks = (weeks: number) => {
    touched.current = true;
    setWeeksText(String(weeks));
    setAnswers((a) => ({ ...a, weeks }));
  };
  const toggleChip = (field: 'focus' | 'weak', key: string) => {
    const keys = new Set(field === 'focus' ? focusKeys : weakKeys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    const names = namesFor(keys);
    patch(field === 'focus' ? { focus: names } : { weak: names });
  };

  // ── Closing ─────────────────────────────────────────────────────────────────────────────────
  const close = () => {
    if (busy) toast.info('Still planning. The AI plan is saved to your plans when it is ready.');
    runRef.current++; // a request still running finishes in the background
    setBusy(false);
    setError(null);
    setResult(null);
    setPanel(null);
    setSwitchingTo(false);
    setStep(reachedReview.current ? 'review' : 'timeline');
    onClose();
  };

  // ── Planning ────────────────────────────────────────────────────────────────────────────────
  const attached = (run: number) => mountedRef.current && run === runRef.current;
  const switchAction = (id: number) => ({
    label: 'Switch to it',
    onClick: () => void wpRef.current.switchProfile(id),
  });

  /** Saves an AI plan as a new inactive profile ("AI plan", "AI plan 2" …). */
  const saveAiPlan = async (run: number, plan: WeekPlan, summary: string) => {
    const wp = wpRef.current;
    const name = wp.nextProfileName('AI plan');
    if (attached(run)) setResult((r) => r && { ...r, save: { status: 'saving', name } });
    try {
      const saved = await wp.saveAsProfile(name, {
        plan,
        summary: summary.trim().slice(0, SUMMARY_MAX),
        activate: false,
      });
      if (attached(run))
        setResult((r) => r && { ...r, save: { status: 'saved', id: saved.id, name: saved.name } });
      else
        toast.success(`AI plan ready: saved as ${saved.name}`, {
          action: switchAction(saved.id),
        });
    } catch (e) {
      const message = errorText(e, 'Could not save the plan.');
      if (attached(run)) setResult((r) => r && { ...r, save: { status: 'error', message } });
      else toast.error(`Your AI plan could not be saved: ${message}`);
    }
  };

  const planWithAi = async () => {
    if (busy || !weeksValid) return;
    const run = ++runRef.current;
    setBusy(true);
    setError(null);
    let res: AutoPlanResult;
    try {
      res = await wpRef.current.autoOrganize(finalAnswers);
    } catch (e) {
      const message = errorText(e, 'The planner did not answer. Try again.');
      if (attached(run)) {
        setError(message);
        setBusy(false);
      } else toast.error(`Auto organize failed: ${message}`);
      return;
    }
    if (attached(run)) {
      setBusy(false);
      setPanel(null);
      setResult({
        kind: 'ai',
        plan: res.plan,
        summary: res.summary,
        dropped: res.stats.dropped,
        save: null,
      });
      go('result');
    }
    await saveAiPlan(run, res.plan, res.summary);
  };

  const quickPlan = () => {
    if (busy || !weeksValid) return;
    if (!topics.length) {
      setError('The questions are still loading. Try again in a moment.');
      return;
    }
    const { plan, summary } = localOrganize({
      topics,
      coreOrder: weekPlan.coreOrder,
      answers: finalAnswers,
      isDone: (id) => progress.isDone(id),
    });
    if (!Object.keys(plan.assignments).length) {
      setError(
        'Every question is already marked complete. Include solved questions to plan a review.'
      );
      return;
    }
    setError(null);
    setPanel(null);
    setResult({ kind: 'quick', plan, summary, dropped: 0, save: null });
    go('result');
  };

  const replaceCurrent = (plan: WeekPlan) => {
    const wp = wpRef.current;
    if (!wp.loaded || wp.switching) {
      toast.error(BUSY_MESSAGE);
      return;
    }
    wp.apply(plan);
    toast.success('Week plan replaced', {
      action: { label: 'Undo', onClick: () => wpRef.current.undo() },
    });
    close();
  };

  const switchToSaved = async (id: number) => {
    setSwitchingTo(true);
    await wpRef.current.switchProfile(id); // a failure shows in the week view's error line
    if (mountedRef.current) close();
  };

  const nameTaken = (name: string, exceptId?: number): string | null => {
    const key = name.trim().toLowerCase();
    return wpRef.current.profiles.some(
      (p) => p.id !== exceptId && p.name.trim().toLowerCase() === key
    )
      ? `You already have a plan named '${name.trim()}'.`
      : null;
  };

  // ── Rendering ───────────────────────────────────────────────────────────────────────────────
  const current = stepIndex >= 0 ? STEPS[stepIndex] : null;
  const indicator = current
    ? `Step ${stepIndex + 1} of ${STEPS.length} · ${current.title}`
    : 'Plan ready';
  const heading =
    current?.heading ?? (result?.kind === 'ai' ? 'Your AI plan is ready' : 'Your quick plan');
  const intro =
    current?.intro ??
    (result?.kind === 'ai'
      ? 'It is kept as a new plan. Switch to it now, or keep your current plan and switch later from the plan menu.'
      : 'Nothing is saved yet. Keep it as a new plan, or let it replace your current plan (you can undo that).');

  const timelineSummary =
    timeline === 'date' && weeksValid
      ? `${plural(effectiveWeeks, 'week')}, until ${formatDate(date)}`
      : plural(effectiveWeeks, 'week');
  const reviewGroups: { step: StepId; title: string; rows: [string, string][] }[] = [
    {
      step: 'timeline',
      title: 'Timeline',
      rows: [
        ['Length', weeksValid ? timelineSummary : 'Not set'],
        ['Per week', `Up to ${answers.perWeek}, room for ${capacity} questions`],
      ],
    },
    {
      step: 'you',
      title: 'You',
      rows: [
        ['Level', labelOf(LEVEL_OPTIONS, answers.level)],
        ['Goal', labelOf(GOAL_OPTIONS, answers.goal)],
      ],
    },
    {
      step: 'patterns',
      title: 'Patterns',
      rows: [
        ['Emphasise', focusNames.join(', ') || 'Nothing in particular'],
        ['Find hard', weakNames.join(', ') || 'None given'],
      ],
    },
    {
      step: 'style',
      title: 'Style',
      rows: [
        [
          'Difficulty',
          `${labelOf(DIFFICULTY_OPTIONS, answers.difficulty)}, ${labelOf(STYLE_OPTIONS, answers.style).toLowerCase()}`,
        ],
        ['Solved questions', answers.includeDone ? 'Included, for review' : 'Left out'],
        ['Notes', answers.notes.trim() || 'None'],
      ],
    },
  ];

  const capacityNote = (
    <p className="rounded-lg px-4 py-3 leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74] mix-bg-foreground/[0.03]">
      Room for up to <span className="font-semibold tabular-nums text-foreground">{capacity}</span>{' '}
      questions over {plural(effectiveWeeks, 'week')}. The lab has{' '}
      <span className="tabular-nums">{plural(topics.length, 'question')}</span>
      {solved > 0 ? `, ${solved} already solved` : ''}.{' '}
      {available > capacity
        ? 'The planner picks the ones that fit best; the rest stay in the queue.'
        : 'Everything can fit.'}
    </p>
  );

  let body: React.ReactNode = null;
  if (step === 'timeline') {
    body = (
      <div className="space-y-[1.75rem]">
        <div>
          <div
            role="group"
            aria-label="Timeline type"
            className="todo-segmented todo-segmented-quiet todo-segmented-accent"
          >
            <button
              type="button"
              aria-pressed={timeline === 'weeks'}
              onClick={() => {
                touched.current = true;
                setTimeline('weeks');
              }}
              className="todo-segment"
            >
              <Icon name="ClockIcon" size={14} />
              Number of weeks
            </button>
            <button
              type="button"
              aria-pressed={timeline === 'date'}
              onClick={() => {
                touched.current = true;
                setTimeline('date');
              }}
              className="todo-segment"
            >
              <Icon name="CalendarDaysIcon" size={14} />
              Interview date
            </button>
          </div>

          {timeline === 'weeks' ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div
                role="group"
                aria-label="Common timelines"
                className="todo-segmented todo-segmented-quiet todo-segmented-accent"
              >
                {TIMELINE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={weeksText.trim() === String(p)}
                    aria-label={`${p} weeks`}
                    onClick={() => setWeeks(p)}
                    className="todo-segment tabular-nums"
                  >
                    {/* One text node from sm up: the segment's flex gap would otherwise split "4" and "weeks". */}
                    <span className="sm:hidden">{p}</span>
                    <span className="hidden sm:inline">{p} weeks</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Custom</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_WEEKS}
                  step={1}
                  value={weeksText}
                  aria-invalid={timelineError ? true : undefined}
                  aria-describedby={timelineNoteId}
                  onChange={(e) => {
                    touched.current = true;
                    const text = e.target.value;
                    setWeeksText(text);
                    const n = Number(text);
                    if (Number.isInteger(n) && n >= 1 && n <= MAX_WEEKS)
                      setAnswers((a) => ({ ...a, weeks: n }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    next();
                  }}
                  className="todo-input todo-input-quiet h-9 w-[4.5rem] px-2.5 text-sm tabular-nums"
                />
                <span>weeks</span>
              </label>
            </div>
          ) : (
            <div className="mt-4">
              <label
                htmlFor={dateId}
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Interview date
              </label>
              <input
                id={dateId}
                type="date"
                min={tomorrow}
                value={date}
                aria-invalid={timelineError && date ? true : undefined}
                aria-describedby={timelineNoteId}
                onChange={(e) => {
                  touched.current = true;
                  setDate(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  next();
                }}
                className="todo-input h-9 w-auto max-w-full px-3 text-sm"
              />
            </div>
          )}
          <p
            id={timelineNoteId}
            aria-live="polite"
            className={`mt-2.5 text-xs leading-relaxed ${
              timelineError && (timeline === 'weeks' || date)
                ? 'text-error'
                : 'text-muted-foreground'
            }`}
          >
            {timelineError ?? timelineNote}
          </p>
        </div>

        <fieldset>
          <FieldHeading
            title="Questions per week"
            hint={`${WEEK_CAP} per week maximum. A week can hold fewer.`}
          />
          <div className="mt-3 todo-segmented todo-segmented-quiet todo-segmented-accent">
            {AUTO_PER_WEEK_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={answers.perWeek === n}
                aria-label={`${n} questions per week`}
                onClick={() => patch({ perWeek: n })}
                className="todo-segment min-w-[2.75rem] justify-center tabular-nums"
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        {capacityNote}
      </div>
    );
  } else if (step === 'you') {
    body = (
      <div className="space-y-[1.75rem]">
        <RadioCards
          legend="Your level"
          name={`${uid}-level`}
          options={LEVEL_OPTIONS}
          value={answers.level}
          onChange={(level) => patch({ level })}
          columns="sm:grid-cols-3"
        />
        <RadioCards
          legend="What you are preparing for"
          name={`${uid}-goal`}
          options={GOAL_OPTIONS}
          value={answers.goal}
          onChange={(goal) => patch({ goal })}
          columns="sm:grid-cols-2"
        />
      </div>
    );
  } else if (step === 'patterns') {
    body = chipItems.length ? (
      <div className="space-y-[1.75rem]">
        <ChipGroup
          legend="Emphasise"
          hint="These patterns get extra questions."
          items={chipItems}
          selected={focusKeys}
          onToggle={(key) => toggleChip('focus', key)}
          onClear={() => patch({ focus: [] })}
        />
        <ChipGroup
          legend="Find hard"
          hint="Extra practice, and a review in a later week."
          items={chipItems}
          selected={weakKeys}
          onToggle={(key) => toggleChip('weak', key)}
          onClear={() => patch({ weak: [] })}
          blocked={focusKeys}
          blockedReason="Already chosen under Emphasise."
        />
      </div>
    ) : (
      <p role="status" className="text-sm text-muted-foreground">
        The patterns are still loading.
      </p>
    );
  } else if (step === 'style') {
    const notesNearLimit = answers.notes.length > NOTES_MAX - 40;
    body = (
      <div className="space-y-[1.75rem]">
        <RadioCards
          legend="Difficulty"
          name={`${uid}-difficulty`}
          options={DIFFICULTY_OPTIONS}
          value={answers.difficulty}
          onChange={(difficulty) => patch({ difficulty })}
          columns="sm:grid-cols-3"
        />
        <RadioCards
          legend="Week style"
          name={`${uid}-style`}
          options={STYLE_OPTIONS}
          value={answers.style}
          onChange={(style) => patch({ style })}
          columns="sm:grid-cols-2"
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors mix-bg-foreground/[0.02] hover:mix-bg-foreground/[0.05]">
          <input
            type="checkbox"
            checked={answers.includeDone}
            onChange={(e) => patch({ includeDone: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Include questions you have solved
            </span>
            <span className="mt-0.5 block leading-snug text-[13px] font-medium mix-text-foreground/[0.74]">
              {solved > 0
                ? `${plural(solved, 'question')} solved so far. They are used sparingly, for review.`
                : 'Nothing is marked solved yet.'}
            </span>
          </span>
        </label>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={notesId} className="text-sm font-semibold text-foreground">
              Anything else?{' '}
              <span className="font-medium mix-text-foreground/[0.74]">(optional)</span>
            </label>
            <span
              id={notesCountId}
              className={`text-xs tabular-nums ${notesNearLimit ? 'text-warning' : 'text-muted-foreground'}`}
            >
              {answers.notes.length}/{NOTES_MAX}
            </span>
          </div>
          <textarea
            id={notesId}
            rows={3}
            maxLength={NOTES_MAX}
            value={answers.notes}
            aria-describedby={notesCountId}
            onChange={(e) => patch({ notes: e.target.value.slice(0, NOTES_MAX) })}
            placeholder="For example: onsite in six weeks, recursion still feels shaky, little time on weekends."
            className="todo-input resize-none px-3 py-2 text-sm leading-relaxed"
          />
          <p className="mt-1.5 text-[13px] font-medium mix-text-foreground/[0.74]">
            Only the AI planner reads this.
          </p>
        </div>
      </div>
    );
  } else if (step === 'review') {
    body = (
      <div className="space-y-5">
        {restored && (
          <p className="text-[13px] font-medium mix-text-foreground/[0.74]">
            These are your answers from last time.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {reviewGroups.map((g) => (
            <section
              key={g.step}
              aria-labelledby={`${uid}-review-${g.step}`}
              className="rounded-lg border px-4 py-3 mix-bg-foreground/[0.02]"
            >
              <div className="flex items-center justify-between gap-3">
                <h4
                  id={`${uid}-review-${g.step}`}
                  className="dsa-caption mix-text-foreground/[0.74]"
                >
                  {g.title}
                </h4>
                <button
                  type="button"
                  onClick={() => go(g.step)}
                  disabled={busy}
                  aria-label={`Edit ${g.title.toLowerCase()}`}
                  className="todo-btn todo-btn-ghost -mr-2 px-2 py-1"
                >
                  <Icon name="PencilSquareIcon" size={12} />
                  Edit
                </button>
              </div>
              <dl className="mt-1.5 space-y-1.5">
                {g.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium mix-text-foreground/[0.74]">{label}</dt>
                    <dd className="break-words text-sm leading-snug text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        {timelineError && (
          <div role="alert" className="todo-alert todo-alert-warning">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">
              {timeline === 'date' && date
                ? 'Your interview date has passed. Edit the timeline to pick a new one.'
                : timelineError}
            </p>
          </div>
        )}

        {busy ? (
          <div role="status" className="flex items-start gap-3 rounded-lg px-4 py-3.5 lab-tint">
            <Icon
              name="ArrowPathIcon"
              size={18}
              className="mt-0.5 shrink-0 text-primary motion-safe:animate-spin"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Planning your weeks…</p>
              <p className="mt-0.5 leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74]">
                This can take up to a minute. You can close this window: the plan is saved to your
                plans when it is ready.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 border-t pt-4 text-[13px] font-medium leading-relaxed mix-text-foreground/[0.74]">
            <p>
              <span className="font-semibold text-foreground">Plan with AI</span> uses your AI key
              from Config. The result is kept as a new plan, so your current plan is not touched.
            </p>
            <p>
              <span className="font-semibold text-foreground">Quick plan (no AI)</span> is instant,
              from the lab’s learning order. You decide whether to keep it.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="todo-alert todo-alert-error">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">
              {error}
              {isMissingKeyError(error) && (
                <>
                  {' '}
                  <Link
                    href="/config"
                    className="font-semibold underline underline-offset-2 hover:opacity-80"
                  >
                    Add a key in Config
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    );
  } else if (result) {
    const placed = Object.keys(result.plan.assignments).length;
    const emptyWeeks = weekCounts(result.plan).filter((n) => n === 0).length;
    const stats = [`Placed ${plural(placed, 'question')} in ${plural(result.plan.weeks, 'week')}`];
    if (result.dropped > 0)
      stats.push(
        `${result.dropped} of the AI’s picks did not fit and ${result.dropped === 1 ? 'was' : 'were'} left out`
      );
    if (emptyWeeks > 0) stats.push(`${plural(emptyWeeks, 'week')} left empty`);
    const save = result.save;

    body = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Tag tone="accent" className="gap-1.5">
            <Icon name={result.kind === 'ai' ? 'SparklesIcon' : 'BoltIcon'} size={12} />
            {result.kind === 'ai' ? 'AI plan' : 'Quick plan'}
          </Tag>
          {result.kind === 'ai' && (
            <span role="status" className="inline-flex min-w-0 items-center gap-1.5 text-xs">
              {(!save || save.status === 'saving') && (
                <>
                  <Icon
                    name="ArrowPathIcon"
                    size={12}
                    className="shrink-0 text-muted-foreground motion-safe:animate-spin"
                  />
                  <span className="min-w-0 break-words text-muted-foreground">
                    Saving{save?.status === 'saving' ? ` as ${save.name}` : ''}…
                  </span>
                </>
              )}
              {save?.status === 'saved' && (
                <>
                  <Icon
                    name="CheckCircleIcon"
                    variant="solid"
                    size={14}
                    className="shrink-0 text-success"
                  />
                  <span className="min-w-0 break-words font-medium text-success">
                    Saved as {save.name}
                  </span>
                </>
              )}
            </span>
          )}
        </div>

        {save?.status === 'error' && (
          <div role="alert" className="todo-alert todo-alert-error">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">
              The plan could not be kept as a new plan: {save.message}{' '}
              <button
                type="button"
                onClick={() => void saveAiPlan(runRef.current, result.plan, result.summary)}
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                Try again
              </button>
            </p>
          </div>
        )}

        {panel === 'rename' && save?.status === 'saved' && (
          <InlineNameForm
            label="Plan name"
            initialName={save.name}
            submitLabel="Rename"
            busyLabel="Renaming…"
            validate={(name) => nameTaken(name, save.id)}
            onCancel={() => setPanel(null)}
            onSubmit={async (name) => {
              if (name !== save.name) await wpRef.current.renameProfile(save.id, name);
              if (!mountedRef.current) return;
              setResult(
                (r) => r && (r.save?.status === 'saved' ? { ...r, save: { ...r.save, name } } : r)
              );
              setPanel(null);
            }}
          />
        )}

        {panel === 'save' && result.kind === 'quick' && (
          <InlineNameForm
            label="Name for the new plan"
            initialName={weekPlan.nextProfileName()}
            submitLabel="Save plan"
            busyLabel="Saving…"
            switchDefault
            validate={(name) =>
              nameTaken(name) ??
              (wpRef.current.profiles.length >= MAX_PROFILES ? LIMIT_MESSAGE : null)
            }
            onCancel={() => setPanel(null)}
            onSubmit={async (name, switchTo) => {
              const saved = await wpRef.current.saveAsProfile(name, {
                plan: result.plan,
                summary: result.summary.trim().slice(0, SUMMARY_MAX),
                activate: switchTo,
              });
              if (switchTo) toast.success(`Saved as ${saved.name} and switched to it`);
              else toast.success(`Saved as ${saved.name}`, { action: switchAction(saved.id) });
              if (mountedRef.current) close();
            }}
          />
        )}

        {result.summary && (
          <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>
        )}
        <p className="leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74]">
          {stats.join(' · ')}
        </p>
        <PlanPreview plan={result.plan} topics={topics} rank={weekPlan.rank} />
      </div>
    );
  }

  let footer: React.ReactNode = null;
  if (current && step !== 'review') {
    footer = (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={stepIndex === 0 ? close : back}
          className={`${BTN} todo-btn-ghost`}
        >
          {stepIndex === 0 ? (
            'Cancel'
          ) : (
            <>
              <Icon name="ArrowLeftIcon" size={14} />
              Back
            </>
          )}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={step === 'timeline' && !weeksValid}
          className={`${BTN} todo-btn-primary`}
        >
          Next
          <Icon name="ArrowRightIcon" size={14} />
        </button>
      </div>
    );
  } else if (step === 'review') {
    footer = (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={back} disabled={busy} className={`${BTN} todo-btn-ghost`}>
          <Icon name="ArrowLeftIcon" size={14} />
          Back
        </button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={quickPlan}
            disabled={busy || !weeksValid}
            className={`${BTN} todo-btn-secondary`}
          >
            <Icon name="BoltIcon" size={14} />
            Quick plan (no AI)
          </button>
          <button
            type="button"
            onClick={() => void planWithAi()}
            disabled={busy || !weeksValid}
            aria-busy={busy || undefined}
            className={`${BTN} todo-btn-primary`}
          >
            <Icon
              name={busy ? 'ArrowPathIcon' : 'SparklesIcon'}
              size={14}
              className={busy ? 'motion-safe:animate-spin' : ''}
            />
            {busy ? 'Planning your weeks…' : 'Plan with AI'}
          </button>
        </div>
      </div>
    );
  } else if (result) {
    const save = result.save;
    const adjust = (
      <button
        type="button"
        onClick={() => {
          runRef.current++; // a save still running reports through a toast instead
          setResult(null);
          setPanel(null);
          go('review');
        }}
        disabled={switchingTo}
        className={`${BTN} todo-btn-ghost`}
      >
        <Icon name="ArrowLeftIcon" size={14} />
        Adjust answers
      </button>
    );
    footer = (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {adjust}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {result.kind === 'ai' ? (
            <>
              <button
                type="button"
                onClick={close}
                disabled={switchingTo}
                className={`${BTN} todo-btn-secondary`}
              >
                Keep current plan
              </button>
              {save?.status === 'saved' && (
                <button
                  type="button"
                  onClick={() => setPanel((p) => (p === 'rename' ? null : 'rename'))}
                  aria-expanded={panel === 'rename'}
                  disabled={switchingTo}
                  className={`${BTN} todo-btn-quiet`}
                >
                  <Icon name="PencilSquareIcon" size={14} />
                  Rename
                </button>
              )}
              {save?.status === 'error' ? (
                <button
                  type="button"
                  onClick={() => replaceCurrent(result.plan)}
                  className={`${BTN} todo-btn-primary`}
                >
                  Replace current plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => save?.status === 'saved' && void switchToSaved(save.id)}
                  disabled={save?.status !== 'saved' || switchingTo || weekPlan.switching}
                  className={`${BTN} todo-btn-primary`}
                >
                  {switchingTo && (
                    <Icon name="ArrowPathIcon" size={14} className="motion-safe:animate-spin" />
                  )}
                  {switchingTo ? 'Switching…' : 'Switch to this plan'}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPanel((p) => (p === 'save' ? null : 'save'))}
                aria-expanded={panel === 'save'}
                className={`${BTN} todo-btn-secondary`}
              >
                <Icon name="BookmarkIcon" size={14} />
                Save as new plan
              </button>
              <button
                type="button"
                onClick={() => replaceCurrent(result.plan)}
                className={`${BTN} todo-btn-primary`}
              >
                Replace current plan
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      labelledBy={titleId}
      describedBy={stepTextId}
      closeOnBackdrop={!result && !busy}
      backdropClassName="bg-black/45"
      // A solid panel, like the plan name dialog (a translucent one over a dark backdrop looked muddy). The height is fixed
      // so the Back / Next buttons stay put from step to step; the body scrolls.
      className="dsa-type flex h-[min(42rem,90dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
    >
      <div className="shrink-0 px-[1.25rem] pt-5 sm:px-[1.5rem]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg lab-tint lab-ink"
          >
            <Icon name="SparklesIcon" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-heading text-lg font-semibold leading-tight text-foreground"
            >
              Auto organize
            </h2>
            <p
              id={stepTextId}
              className="mt-0.5 text-[13px] font-medium mix-text-foreground/[0.74]"
            >
              {indicator}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="todo-btn todo-btn-ghost -mr-1.5 h-8 w-8 shrink-0 px-0"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        <div aria-hidden className="mt-4 grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 rounded-full transition-colors ${
                !current || i <= stepIndex ? 'bg-primary' : 'mix-bg-foreground/10'
              }`}
            />
          ))}
        </div>
      </div>

      <div
        ref={bodyRef}
        aria-busy={busy || undefined}
        className="min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-5 scrollbar-clean sm:px-[1.5rem]"
      >
        <h3
          ref={headingRef}
          tabIndex={-1}
          data-autofocus
          className="font-heading text-base font-semibold leading-snug text-foreground outline-none"
        >
          {heading}
        </h3>
        <p className="mt-1 text-sm font-medium leading-relaxed mix-text-foreground/[0.74]">
          {intro}
        </p>
        <div className="mt-5">{body}</div>
      </div>

      {footer && (
        <div className="shrink-0 border-t px-[1.25rem] py-3.5 sm:px-[1.5rem]">{footer}</div>
      )}
    </Modal>
  );
}
