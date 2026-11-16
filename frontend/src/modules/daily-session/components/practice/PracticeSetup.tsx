'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import CompanionBubble from '../../companion/CompanionBubble';
import { MOODS, SARASWATI_VANDANA, type Mood, type MoodId, type Shloka } from '../../companion/content';
import { Ring, StepLabel, clock, dayKey, difficultyTone, relativeDay, toneClass, type Tone } from '../ds';
import PlayerCard from './PlayerCard';
import Missions, { type Mission } from './Missions';
import { CATEGORY_CHIPS, DIFFICULTY_OPTIONS, QUESTION_COUNT_OPTIONS, topicLabel, type PracticeRun } from './drill';
import { AI_BONUS, COMBO_BONUS, COMBO_FROM, FINISH_XP } from './progression';

const MOOD_LOOK: Record<string, { icon: string; tone: Tone }> = {
  energised: { icon: 'FireIcon', tone: 'gold' },
  calm: { icon: 'SunIcon', tone: 'jade' },
  tired: { icon: 'MoonIcon', tone: 'indigo' },
  anxious: { icon: 'HeartIcon', tone: 'indigo' },
};

/** The most a drill of n questions can earn: every answer scored 100, the combo from the third, the finish bonus. */
const maxRunXp = (n: number) => n * (10 + AI_BONUS) + Math.max(0, n - (COMBO_FROM - 1)) * COMBO_BONUS + FINISH_XP;

export interface PendingRun {
  category: string;
  difficulty: string;
  mission: string | null;
  index: number;
  total: number;
}

interface Props {
  // Player
  xp: number;
  todayXp: number;
  goal: number;
  onGoalChange: (xp: number) => void;
  // Missions and the drill in progress
  missions: Mission[];
  onMission: (m: Mission) => void;
  pending: PendingRun | null;
  onResume: () => void;
  onDiscard: () => void;
  // Builder
  category: string;
  onCategory: (v: string) => void;
  difficulty: string;
  onDifficulty: (v: string) => void;
  count: number;
  onCount: (n: number) => void;
  answerMode: 'write' | 'chat';
  onAnswerMode: (m: 'write' | 'chat') => void;
  matchCount: (category: string) => number;
  eligible: number;
  total: number;
  onStart: () => void;
  // Companion
  mood: MoodId | null;
  onMood: (m: MoodId) => void;
  companion: { text: string; mood: Mood; speaking: boolean; onSpeak: () => void; controls: React.ReactNode; on: boolean };
  spiritual: boolean;
  shloka: Shloka;
  history: PracticeRun[];
}

/** Practice home: your level and goal, one-tap missions, and the drill builder. */
export default function PracticeSetup(p: Props) {
  const startCount = Math.min(p.count, p.eligible || p.total);
  const level = DIFFICULTY_OPTIONS.find((d) => d.value === p.difficulty) ?? DIFFICULTY_OPTIONS[0];
  const minutes = Math.max(3, Math.round(startCount * 1.5));
  const topicName = p.category === 'All' ? 'Every topic' : topicLabel(p.category);

  const StartButton = (
    <button type="button" onClick={p.onStart} disabled={startCount === 0} className="ds-btn ds-btn-primary ds-btn-lg w-full">
      <Icon name="PlayIcon" size={18} variant="solid" />
      Start {startCount} question{startCount === 1 ? '' : 's'}
    </button>
  );

  // Deepu and the mood picker: in the flow on a phone (before the builder it sizes), in the side column on a wide screen.
  const deepu = (where: 'flow' | 'side') => (
    <section className="ds-card" aria-labelledby={`pm-mood-${where}`}>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <CompanionBubble
            text={p.companion.text}
            mood={p.companion.mood}
            speaking={p.companion.speaking}
            onSpeak={p.companion.onSpeak}
            className="min-w-0 flex-1"
          />
          {!p.companion.on && <span className="flex-1" />}
          {p.companion.controls}
        </div>
        <div className="mt-5">
          <p id={`pm-mood-${where}`} className="text-sm font-semibold ds-ink">
            How are you feeling?
          </p>
          <p className="text-xs ds-faint">Deepu sizes the drill to match.</p>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-labelledby={`pm-mood-${where}`}>
          {MOODS.map((m) => {
            const look = MOOD_LOOK[m.id];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => p.onMood(m.id)}
                aria-pressed={p.mood === m.id}
                className={`ds-option ds-option-stack ds-option-center ds-option-compact ${toneClass(look.tone)}`}
              >
                <span className="ds-icon-tile ds-icon-tile-sm">
                  <Icon name={look.icon} size={16} variant={p.mood === m.id ? 'solid' : 'outline'} />
                </span>
                <span className="text-xs font-semibold ds-ink">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );

  return (
    <div className="grid gap-5 pb-[8rem] lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-x-[1.75rem] lg:pb-8">
      <div className="min-w-0 space-y-[1.5rem]">
        {p.pending && (
          <section className="ds-card-raised flex flex-wrap items-center gap-4 p-4 ds-enter" aria-label="Drill in progress">
            <Ring value={p.pending.index / p.pending.total} size={48} tone="jade" label={`${p.pending.index} of ${p.pending.total} done`}>
              <span className="text-[11px] font-bold ds-ink ds-num">
                {p.pending.index}/{p.pending.total}
              </span>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="ds-h3">You have a drill in progress</p>
              <p className="text-sm ds-muted">
                {p.pending.mission ??
                  `${p.pending.category === 'All' ? 'Every topic' : topicLabel(p.pending.category)}, ${
                    p.pending.difficulty === 'All' ? 'mixed level' : p.pending.difficulty.toLowerCase()
                  }`}
                . Question {p.pending.index + 1} of {p.pending.total}.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={p.onDiscard} className="ds-btn ds-btn-ghost">
                Discard
              </button>
              <button type="button" onClick={p.onResume} className="ds-btn ds-btn-primary">
                Resume
              </button>
            </div>
          </section>
        )}

        <PlayerCard xp={p.xp} todayXp={p.todayXp} goal={p.goal} onGoalChange={p.onGoalChange} />

        {p.missions.length > 0 && <Missions missions={p.missions} onStart={p.onMission} />}

        <div className="lg:hidden">{deepu('flow')}</div>

        <section aria-labelledby="pm-build-title">
          <div className="ds-section-head">
            <h2 id="pm-build-title">Build your own drill</h2>
            <span>
              <span className="ds-num">{p.eligible}</span> matching
            </span>
          </div>
          <div className="ds-card pm-builder">
            <div className="pm-builder-part" role="group" aria-label="Topic">
              <StepLabel n={1}>Topic</StepLabel>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {CATEGORY_CHIPS.map((c) => {
                  const n = p.matchCount(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => p.onCategory(c.value)}
                      aria-pressed={p.category === c.value}
                      className={`ds-option ds-option-stack ${toneClass(c.tone)}`}
                    >
                      <span className="ds-icon-tile">
                        <Icon name={c.icon} size={19} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold leading-snug ds-ink">{c.label}</span>
                        <span className="block text-xs ds-faint ds-num">
                          {n} question{n === 1 ? '' : 's'}
                        </span>
                      </span>
                      <Icon name="CheckCircleIcon" size={18} variant="solid" className="ds-check" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pm-builder-part grid gap-5 md:grid-cols-2">
              <div>
                <StepLabel n={2}>Level</StepLabel>
                <div className="ds-seg" role="group" aria-label="Level">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button key={d.value} type="button" aria-pressed={p.difficulty === d.value} onClick={() => p.onDifficulty(d.value)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <StepLabel n={3} hint={`about ${minutes} min`}>
                  Length
                </StepLabel>
                <div className="ds-seg" role="group" aria-label="Number of questions">
                  {QUESTION_COUNT_OPTIONS.map((n) => (
                    <button key={n} type="button" aria-pressed={p.count === n} onClick={() => p.onCount(n)} className="ds-num">
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pm-builder-part">
              <StepLabel n={4}>How you&apos;ll answer</StepLabel>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {(
                  [
                    ['write', 'PencilSquareIcon', 'indigo', 'Write it out', 'Type or dictate, then the AI scores it.'],
                    ['chat', 'ChatBubbleLeftRightIcon', 'jade', 'Talk it through', 'Learn with the AI tutor, then get scored.'],
                  ] as const
                ).map(([m, icon, tone, title, sub]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => p.onAnswerMode(m)}
                    aria-pressed={p.answerMode === m}
                    className={`ds-option ${toneClass(tone)}`}
                  >
                    <span className="ds-icon-tile">
                      <Icon name={icon} size={19} />
                    </span>
                    <span className="min-w-0 pr-5">
                      <span className="block text-sm font-semibold ds-ink">{title}</span>
                      <span className="block text-xs leading-snug ds-faint">{sub}</span>
                    </span>
                    <Icon name="CheckCircleIcon" size={18} variant="solid" className="ds-check" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-[5.5rem] lg:self-start">
        <div className="hidden lg:block">{deepu('side')}</div>

        <section className="ds-card-raised p-5" aria-labelledby="pm-summary-title">
          <p className="ds-eyebrow">Your drill</p>
          <p id="pm-summary-title" className="ds-h2 mt-1.5">
            {startCount} question{startCount === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-sm ds-muted">{p.category === 'All' ? 'Across every topic' : `From ${topicLabel(p.category)}`}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`ds-chip ${toneClass(difficultyTone(level.value))}`}>
              <span className="ds-dot" aria-hidden="true" />
              {level.value === 'All' ? 'Mixed level' : level.label}
            </span>
            <span className="ds-chip ds-tone-neutral">
              <Icon name="ClockIcon" size={13} />
              about {minutes} min
            </span>
            <span className="ds-chip ds-tone-gold">
              <Icon name="SparklesIcon" size={13} variant="solid" />
              up to <span className="ds-num">{maxRunXp(startCount)}</span> XP
            </span>
          </div>
          {p.eligible === 0 && p.total > 0 ? (
            <p className="mt-3 text-xs ds-faint">Nothing matches exactly, so other questions are mixed in.</p>
          ) : (
            p.eligible < p.count && (
              <p className="mt-3 text-xs ds-faint">
                Only {p.eligible} question{p.eligible === 1 ? '' : 's'} match this topic and level, so the drill is shorter.
              </p>
            )
          )}
          <div className="mt-5 hidden lg:block">{StartButton}</div>
          <p className="mt-3 text-xs leading-relaxed ds-faint">
            AI-checked answers earn up to {10 + AI_BONUS} XP, self-graded ones up to 6. Three nailed in a row adds {COMBO_BONUS}.
          </p>
        </section>

        {p.spiritual && (
          <details className="ds-card ds-disclosure group p-5">
            <summary className="flex items-center gap-3">
              <span className="ds-icon-tile ds-icon-tile-sm ds-tone-gold">
                <Icon name="SunIcon" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold ds-ink">Today&apos;s thought</span>
                <span className="block text-sm italic ds-muted">{p.shloka.sanskrit}</span>
              </span>
              <Icon name="ChevronDownIcon" size={16} className="ds-caret ds-faint" />
            </summary>
            <div className="mt-3 space-y-2 pl-[2.75rem]">
              <p className="text-sm ds-ink">
                {p.shloka.meaning} <span className="ds-faint">({p.shloka.source})</span>
              </p>
              <p className="text-xs ds-faint">
                Before you start: <span className="italic">{SARASWATI_VANDANA}</span>
              </p>
            </div>
          </details>
        )}

        {p.history.length > 0 && (
          <section aria-labelledby="pm-history-title">
            <div className="ds-section-head">
              <h3 id="pm-history-title">Recent drills</h3>
              <span>Last {p.history.length}</span>
            </div>
            <ul className="ds-list" data-icons="true">
              {p.history.map((h) => {
                const score = h.avgScore ?? h.accuracy;
                return (
                  <li key={h.at} className="ds-list-row">
                    <Ring
                      value={score / 100}
                      size={34}
                      stroke={3.5}
                      tone={score >= 70 ? 'jade' : score >= 40 ? 'gold' : 'rose'}
                      label={h.avgScore !== undefined ? `Average score ${score}` : `${score}% accuracy`}
                    >
                      <span className="text-[10px] font-bold ds-muted ds-num">{score}</span>
                    </Ring>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold ds-ink">
                        {h.mission ??
                          `${h.category === 'All' ? 'Mixed topics' : topicLabel(h.category)}, ${
                            h.difficulty === 'All' ? 'any level' : h.difficulty.toLowerCase()
                          }`}
                      </span>
                      <span className="block text-xs ds-faint">
                        {relativeDay(dayKey(new Date(h.at)))}, {h.total} questions, {clock(h.seconds)}
                      </span>
                    </span>
                    <span className="ds-chip ds-tone-gold ds-num">+{h.xp}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>

      {/* Phone: the start button sits in a bar at the bottom */}
      <div className="lg:hidden">
        <div className="ds-actionbar">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold ds-ink">
                {topicName}, {level.value === 'All' ? 'mixed level' : level.label.toLowerCase()}
              </p>
              <p className="text-xs ds-faint">
                {startCount} question{startCount === 1 ? '' : 's'}, about {minutes} min
              </p>
            </div>
            <div className="w-[11.5rem]">{StartButton}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
