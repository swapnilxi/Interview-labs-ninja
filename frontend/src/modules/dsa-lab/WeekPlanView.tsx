'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { WeekPlanApi } from './useWeekPlan';
import { DoneMark } from '@/modules/common/lab/LabProgressUi';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';
import { PER_WEEK_OPTIONS, WEEK_CAP, WEEK_COUNT_OPTIONS, weekCounts, weekTheme } from './weekPlan';

interface WeekTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
}

const lcNumber = (brief: string) => brief.match(/LC\s+(#\d+)/)?.[1] ?? null;

function difficultyBadge(d: string): string {
  switch (d) {
    case 'Easy':
    case 'Easy-Medium':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'Medium':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'Medium-Hard':
      return 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30';
    default:
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
  }
}

const chip = 'text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors';
const chipOn = 'border-primary text-primary mix-bg-primary/10';
const chipOff = 'border-border text-muted-foreground hover:text-foreground hover:bg-muted';

function QuestionRow({
  topic,
  week,
  weekPlan,
  onOpen,
}: {
  topic: WeekTopic;
  week: number | null;
  weekPlan: WeekPlanApi;
  onOpen: (id: string) => void;
}) {
  const counts = weekCounts(weekPlan.plan);
  const lc = lcNumber(topic.brief);
  return (
    <li className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(topic.id)}
        className="flex-1 min-w-0 text-left group"
      >
        <span className="block text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {topic.name}
        </span>
        <span className="block text-[10px] text-muted-foreground truncate">{topic.category}</span>
      </button>
      {lc && (
        <span className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
          {lc}
        </span>
      )}
      <DoneMark lab="dsa" topicId={topic.id} />
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${difficultyBadge(topic.difficulty)}`}
      >
        {topic.difficulty}
      </span>
      <select
        aria-label={`Move ${topic.name} to another week`}
        value={week ?? 0}
        onChange={(e) => {
          const next = Number(e.target.value);
          weekPlan.move(topic.id, next === 0 ? null : next);
        }}
        className="text-[11px] rounded-md border border-border bg-card px-1.5 py-1 text-foreground focus:outline-none focus:border-primary"
      >
        {Array.from({ length: weekPlan.plan.weeks }, (_, i) => i + 1).map((w) => (
          <option key={w} value={w} disabled={w !== week && counts[w - 1] >= WEEK_CAP}>
            {`Week ${w} (${counts[w - 1]}/${WEEK_CAP})${w !== week && counts[w - 1] >= WEEK_CAP ? ' full' : ''}`}
          </option>
        ))}
        <option value={0}>Not in a week</option>
      </select>
    </li>
  );
}

function GeneratePanel({ weekPlan, onClose }: { weekPlan: WeekPlanApi; onClose: () => void }) {
  const [weeks, setWeeks] = useState<number>(
    (WEEK_COUNT_OPTIONS as readonly number[]).includes(weekPlan.plan.weeks)
      ? weekPlan.plan.weeks
      : 6
  );
  const [perWeek, setPerWeek] = useState<number>(WEEK_CAP);
  return (
    <div className="mt-4 p-4 rounded-xl border border-border mix-bg-muted/30 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2" role="group" aria-label="Number of weeks">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Weeks
          </span>
          {WEEK_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={weeks === n}
              onClick={() => setWeeks(n)}
              className={`${chip} ${weeks === n ? chipOn : chipOff}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Questions per week">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Per week
          </span>
          {PER_WEEK_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={perWeek === n}
              onClick={() => setPerWeek(n)}
              className={`${chip} ${perWeek === n ? chipOn : chipOff}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Fills {weeks} weeks in learning order with up to {perWeek} questions each (
        {Math.min(weekPlan.coreOrder.length, weeks * perWeek)} questions in all). The rest stay out
        of the plan. This replaces your current plan.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            weekPlan.generate(weeks, perWeek);
            onClose();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border mix-border-primary/25 mix-bg-primary/10 text-primary hover:mix-bg-primary/20 transition-colors"
        >
          <Icon name="SparklesIcon" size={13} /> Generate
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The Wiki's week-wise view: the plan as week cards, a move control on every question, and the rest in a collapsible pool. */
export default function WeekPlanView({
  topics,
  weekPlan,
  onOpen,
}: {
  topics: WeekTopic[];
  weekPlan: WeekPlanApi;
  onOpen: (id: string) => void;
}) {
  const [genOpen, setGenOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const { plan } = weekPlan;
  const progress = useLabProgress('dsa');
  const counts = weekCounts(plan);

  const rank = (id: string) => {
    const i = weekPlan.coreOrder.indexOf(id);
    return i === -1 ? 1000 + topics.findIndex((t) => t.id === id) : i;
  };
  const inWeek = (w: number) =>
    topics.filter((t) => plan.assignments[t.id] === w).sort((a, b) => rank(a.id) - rank(b.id));
  const pool = topics.filter((t) => !plan.assignments[t.id]);
  const planned = topics.length - pool.length;

  const poolByPattern = new Map<string, WeekTopic[]>();
  for (const t of pool)
    poolByPattern.set(t.category, [...(poolByPattern.get(t.category) ?? []), t]);

  return (
    <div className="space-y-5">
      <div className="lab-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Week-by-week plan</h2>
            <p className="text-xs text-muted-foreground">
              {plan.weeks} weeks · {planned} of {topics.length} questions planned ·{' '}
              {weekPlan.isCustom ? 'Your plan' : 'Suggested plan'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {weekPlan.isCustom && (
              <button type="button" onClick={weekPlan.reset} className={`${chip} ${chipOff}`}>
                Reset to suggested
              </button>
            )}
            <button
              type="button"
              onClick={() => setGenOpen((o) => !o)}
              aria-expanded={genOpen}
              className={`${chip} ${genOpen ? chipOn : chipOff} flex items-center gap-1.5`}
            >
              <Icon name="SparklesIcon" size={13} /> Generate plan
            </button>
          </div>
        </div>
        {genOpen && <GeneratePanel weekPlan={weekPlan} onClose={() => setGenOpen(false)} />}
        {weekPlan.error && (
          <p role="alert" className="mt-3 text-xs text-error">
            {weekPlan.error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => {
          const questions = inWeek(w);
          const full = counts[w - 1] >= WEEK_CAP;
          const doneInWeek = progress.countDone(questions.map((q) => q.id));
          return (
            <section key={w} aria-label={`Week ${w}`} className="lab-card overflow-hidden">
              <header className="px-4 py-3 border-b border-border flex items-center gap-2">
                <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider whitespace-nowrap">
                  Week {w}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {weekTheme(questions.map((q) => q.category))}
                </span>
                {doneInWeek > 0 && (
                  <span className="ml-auto text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {doneInWeek} done
                  </span>
                )}
                <span
                  className={`${doneInWeek > 0 ? '' : 'ml-auto '}text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                    full
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {counts[w - 1]}/{WEEK_CAP}
                </span>
              </header>
              {questions.length === 0 ? (
                <p className="px-4 py-5 text-xs text-muted-foreground">
                  Nothing here yet. Move a question in from another week or from “Not in a week”.
                </p>
              ) : (
                <ul>
                  {questions.map((t) => (
                    <QuestionRow
                      key={t.id}
                      topic={t}
                      week={w}
                      weekPlan={weekPlan}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {pool.length > 0 && (
        <section aria-label="Questions not in a week" className="lab-card overflow-hidden">
          <button
            type="button"
            onClick={() => setPoolOpen((o) => !o)}
            aria-expanded={poolOpen}
            className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted transition-colors"
          >
            <Icon
              name={poolOpen ? 'ChevronDownIcon' : 'ChevronRightIcon'}
              size={13}
              className="text-muted-foreground"
            />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              Not in a week
            </span>
            <span className="text-[11px] text-muted-foreground">
              {pool.length} questions. The week tag is optional; pull any of them into a week.
            </span>
          </button>
          {poolOpen &&
            [...poolByPattern.entries()].map(([pattern, items]) => (
              <div key={pattern} className="border-t border-border">
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {pattern}
                </p>
                <ul>
                  {items.map((t) => (
                    <QuestionRow
                      key={t.id}
                      topic={t}
                      week={null}
                      weekPlan={weekPlan}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
