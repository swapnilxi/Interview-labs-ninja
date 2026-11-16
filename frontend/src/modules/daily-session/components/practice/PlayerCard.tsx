'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { Bar, Ring } from '../ds';
import { GOAL_OPTIONS, levelInfo } from './progression';

interface Props {
  xp: number;
  todayXp: number;
  goal: number;
  onGoalChange: (xp: number) => void;
}

/**
 * The top of Practice: your level on the engineering ladder and today's goal. Every number comes from the XP kept in
 * this browser (useCompanionStats); the goal is a preference (progression.ts).
 * Styles: `.pm-player*` in styles/practice.css.
 */
export default function PlayerCard({ xp, todayXp, goal, onGoalChange }: Props) {
  const lv = levelInfo(xp);
  const [goalOpen, setGoalOpen] = useState(false);
  const goalDone = todayXp >= goal;

  return (
    <section className="ds-hero pm-player" aria-labelledby="pm-player-rank">
      <div className="pm-player-main">
        <Ring value={lv.progress} size={76} stroke={6} tone="gold" label={`Level ${lv.level}, ${Math.round(lv.progress * 100)}% of the way to level ${lv.level + 1}`}>
          <span className="pm-player-level">
            <small>Level</small>
            <b className="ds-num">{lv.level}</b>
          </span>
        </Ring>
        <div className="min-w-0 flex-1">
          <h2 id="pm-player-rank" className="pm-player-rank">
            {lv.rank}
          </h2>
          <p className="pm-player-sub">
            <span className="ds-num">{lv.toNext}</span> XP to level {lv.level + 1}
            {lv.nextRank && (
              <span className="pm-player-next">. {lv.nextRank.title} at level {lv.nextRank.level}</span>
            )}
          </p>
          <Bar value={lv.progress} tone="gold" className="mt-2.5" label={`Progress to level ${lv.level + 1}`} />
        </div>
      </div>

      <button type="button" className="pm-goal" onClick={() => setGoalOpen(true)} aria-label={`Daily goal: ${todayXp} of ${goal} XP today. Change goal`}>
        <span className={`ds-icon-tile ds-icon-tile-sm ${goalDone ? 'ds-tone-jade' : 'ds-tone-gold'}`}>
          <Icon name={goalDone ? 'CheckBadgeIcon' : 'FlagIcon'} size={16} variant={goalDone ? 'solid' : 'outline'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="pm-goal-line">
            <span className="font-semibold ds-ink">{goalDone ? 'Daily goal reached' : 'Daily goal'}</span>
            <span className="ds-num ds-muted">
              {Math.min(todayXp, 9999)} of {goal} XP
            </span>
          </span>
          <Bar value={todayXp / goal} tone="jade" className="mt-1.5" />
        </span>
        <Icon name="ChevronRightIcon" size={16} className="ds-faint flex-shrink-0" />
      </button>

      <Modal
        isOpen={goalOpen}
        onClose={() => setGoalOpen(false)}
        labelledBy="pm-goal-title"
        className="lab-page ds-skin ios-sheet flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-md"
      >
        <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
          <span />
        </div>
        <div className="ios-sheet-head sm:pt-4">
          <h2 id="pm-goal-title" className="ios-sheet-title">
            Daily goal
          </h2>
          <button type="button" onClick={() => setGoalOpen(false)} className="sheet-done ds-tone-indigo ds-tone-text">
            Done
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 pb-[calc(1.25rem+var(--safe-bottom))]">
          <p className="px-1 text-sm ds-muted">XP from any drill counts. Your streak only needs one finished drill a day.</p>
          <div className="ds-list" role="radiogroup" aria-labelledby="pm-goal-title">
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.xp}
                type="button"
                role="radio"
                aria-checked={goal === o.xp}
                onClick={() => onGoalChange(o.xp)}
                className="ds-list-row w-full text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold ds-ink">
                    {o.label}, <span className="ds-num">{o.xp}</span> XP
                  </span>
                  <span className="block text-xs ds-faint">{o.sub}</span>
                </span>
                {goal === o.xp && <Icon name="CheckIcon" size={18} className="ds-tone-indigo ds-tone-text" />}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </section>
  );
}
