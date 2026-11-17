'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import type { Question } from '@/lib/services/questionsService';
import Mascot from '../../companion/Mascot';
import { MANTRAS, type Shloka } from '../../companion/content';
import type { Evaluation } from '../../coach/answerCoachService';
import { Bar, clock, toneClass } from '../ds';
import { GRADE_META, levelInfo, type Earned, type Grade } from './progression';
import type { ReviewChange } from './ResultPanel';
import { useCountUp, useSettle } from './useCountUp';

interface Props {
  set: Question[];
  grades: Record<string, Grade>;
  evals: Record<string, Evaluation>;
  earned: Record<string, Earned>;
  sessionXp: number;
  xpAtStart: number;
  seconds: number;
  bestCombo: number;
  changes: Record<string, ReviewChange>;
  streak: number;
  streakGrew: boolean;
  todayXp: number;
  goal: number;
  message: string;
  speaking: boolean;
  mascotOn: boolean;
  spiritual: boolean;
  shloka: Shloka;
  backHref: string;
  onRetryMisses: (questions: Question[]) => void;
  onNewDrill: () => void;
  onExit: () => void;
}

/** The end of a drill: XP earned, the level bar moving, the streak and goal, and how each question went. */
export default function RunSummary(p: Props) {
  const graded = p.set.filter((q) => p.grades[q.id]);
  const count = (g: Grade) => graded.filter((q) => p.grades[q.id] === g).length;
  const nailed = count('nailed');
  const accuracy = graded.length ? Math.round(((nailed + count('almost') * 0.5) / graded.length) * 100) : 0;
  const scores = p.set.map((q) => p.evals[q.id]?.overall).filter((n): n is number => typeof n === 'number');
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const headline = avgScore ?? accuracy;

  const before = levelInfo(p.xpAtStart);
  const after = levelInfo(p.xpAtStart + p.sessionXp);
  const levelUp = after.level > before.level;
  const rankUp = after.rank !== before.rank;
  const bar = useSettle(after.progress, levelUp ? 0 : before.progress);
  const xp = useCountUp(p.sessionXp, 900);

  const misses = p.set.filter((q) => p.grades[q.id] && p.grades[q.id] !== 'nailed');
  const added = Object.values(p.changes).filter((c) => c === 'added').length;
  const cleared = Object.values(p.changes).filter((c) => c === 'cleared').length;
  const goalMet = p.todayXp >= p.goal;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8 pt-3 sm:pt-4">
      <BackButton href={p.backHref} label="Back" preferHistory />
      <section className="ds-hero pm-finish ds-pop" aria-labelledby="pm-finish-title">
        <div className="relative px-5 py-[1.75rem] text-center sm:px-[2.5rem]">
          {p.mascotOn && (
            <div className="flex justify-center">
              <Mascot mood="cheer" size={88} speaking={p.speaking} />
            </div>
          )}
          <p className="ds-eyebrow mt-3">Drill complete</p>
          <h2 id="pm-finish-title" className="ds-display mt-1">
            {headline >= 80 ? 'Outstanding.' : headline >= 50 ? 'Solid work.' : 'You showed up. That counts.'}
          </h2>
          {p.message && <p className="ds-body mx-auto mt-2 max-w-[46ch]">{p.message}</p>}

          <p className="pm-finish-xp ds-num" aria-label={`${p.sessionXp} XP earned`}>
            +{xp}
            <small>XP</small>
          </p>

          <div className="pm-finish-level">
            <div className="flex items-baseline justify-between gap-3 text-left">
              <span className="text-sm font-medium ds-ink">
                Level {after.level}, {after.rank}
              </span>
              <span className="text-xs ds-faint">
                <span className="ds-num">{after.toNext}</span> XP to level {after.level + 1}
              </span>
            </div>
            <Bar value={bar} tone="gold" className="mt-2" label={`Progress to level ${after.level + 1}`} />
          </div>

          {levelUp && (
            <p className="ds-banner ds-banner-center ds-tone-gold pm-levelup mx-auto mt-4 w-fit">
              <Icon name="TrophyIcon" size={18} variant="solid" />
              <span>
                <b>Level {after.level}.</b> {rankUp ? `You are a ${after.rank} now.` : 'Keep the run going.'}
              </span>
            </p>
          )}
        </div>
      </section>

      <dl className="grid grid-cols-3 gap-2">
        <div className={`ds-stat-tile ${avgScore === null ? 'ds-tone-jade' : 'ds-tone-indigo'}`}>
          <dt>{avgScore === null ? 'Accuracy' : 'Avg score'}</dt>
          <dd className="ds-tone-text ds-num">{avgScore === null ? `${accuracy}%` : avgScore}</dd>
        </div>
        <div className="ds-stat-tile ds-tone-gold">
          <dt>Best combo</dt>
          <dd className="ds-tone-text ds-num">{p.bestCombo}</dd>
        </div>
        <div className="ds-stat-tile ds-tone-neutral">
          <dt>Time</dt>
          <dd className="ds-tone-text ds-num">{clock(p.seconds)}</dd>
        </div>
      </dl>

      <ul className="ds-list" data-icons="true" aria-label="Streak and goal">
        <li className="ds-list-row">
          <span className="ds-icon-tile ds-icon-tile-sm ds-tone-gold">
            <Icon name="FireIcon" size={16} variant="solid" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="ds-ink">{p.streak}-day streak</b>
            <span className="ds-muted">{p.streakGrew ? ', extended today' : ', already counted today'}</span>
          </span>
        </li>
        <li className="ds-list-row">
          <span className={`ds-icon-tile ds-icon-tile-sm ${goalMet ? 'ds-tone-jade' : 'ds-tone-neutral'}`}>
            <Icon name={goalMet ? 'CheckBadgeIcon' : 'FlagIcon'} size={16} variant={goalMet ? 'solid' : 'outline'} />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="ds-ink">{goalMet ? 'Daily goal reached' : `${p.goal - p.todayXp} XP to today's goal`}</b>
            <span className="ds-muted">
              , <span className="ds-num">{p.todayXp}</span> of {p.goal} XP today
            </span>
          </span>
        </li>
      </ul>

      <section className="ds-card p-5" aria-labelledby="pm-review-title">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 id="pm-review-title" className="ds-h3">
            How each question went
          </h3>
          {(added > 0 || cleared > 0) && (
            <p className="text-xs ds-faint">
              {added > 0 && `${added} added to your review list`}
              {added > 0 && cleared > 0 && ', '}
              {cleared > 0 && `${cleared} cleared from it`}
            </p>
          )}
        </div>
        <ul className="ds-divide">
          {p.set.map((q, i) => {
            const g = p.grades[q.id];
            const meta = g ? GRADE_META[g] : null;
            const ev = p.evals[q.id];
            const got = p.earned[q.id];
            const reviewable = /^\d+$/.test(q.id);
            return (
              <li key={q.id} className="flex items-start gap-3 py-3">
                <span className={`ds-icon-tile ds-icon-tile-sm ${meta ? toneClass(meta.tone) : 'ds-tone-neutral'}`}>
                  {meta ? <Icon name={meta.icon} size={15} /> : <span className="text-xs font-medium">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug ds-ink">{q.questionText}</span>
                  <span className="mt-0.5 block text-xs ds-faint">
                    {meta ? meta.label : 'Not graded'}
                    {ev ? `, scored ${ev.overall}` : meta ? ', graded by you' : ''}
                    {got ? `, +${got.base + got.combo} XP` : ''}
                  </span>
                </span>
                {reviewable && g && g !== 'nailed' && (
                  <Link href={`/question-review?id=${q.id}`} prefetch={false} className="ds-link flex-shrink-0 text-xs">
                    Study it
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {p.spiritual && (
        <div className="ds-inset p-4">
          <p className="text-xs font-medium ds-faint">Closing blessing</p>
          <p className="mt-1.5 text-sm font-medium ds-ink">{MANTRAS.Lakshmi.mantra}</p>
          <p className="mt-2 text-sm italic ds-ink">{p.shloka.sanskrit}</p>
          <p className="mt-1 text-xs ds-faint">
            {p.shloka.meaning} ({p.shloka.source})
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        {misses.length > 0 ? (
          <button type="button" onClick={() => p.onRetryMisses(misses)} className="ds-btn ds-btn-primary ds-btn-lg flex-1">
            <Icon name="ArrowPathIcon" size={18} />
            Retry the {misses.length} you missed
          </button>
        ) : (
          <button type="button" onClick={p.onNewDrill} className="ds-btn ds-btn-primary ds-btn-lg flex-1">
            <Icon name="PlayIcon" size={18} variant="solid" />
            Start another drill
          </button>
        )}
        <button type="button" onClick={p.onExit} className="ds-btn ds-btn-secondary ds-btn-lg">
          Back to Practice
        </button>
      </div>
    </div>
  );
}
