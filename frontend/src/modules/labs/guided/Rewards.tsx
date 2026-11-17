'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';
import { ACHIEVEMENTS } from './constants';
import { celebrate } from './feedback';
import { usePrefs } from './prefs';
import type { GameEvent } from './types';

/** How long each kind stays: small payments pass quickly, milestones stay long enough to read. */
const SHOWN_MS: Record<GameEvent['type'], number> = {
  xp: 2600,
  streak: 3600,
  level: 5000,
  phase: 5000,
  achievement: 5500,
  boss: 6500,
};

const MAX_CARDS = 3;
/** Which banners win when more than MAX_CARDS arrive together. */
const PRIORITY: Record<GameEvent['type'], number> = {
  boss: 6,
  phase: 5,
  level: 4,
  achievement: 3,
  streak: 2,
  xp: 1,
};

/** The one tone to play for a batch of events: the biggest thing that happened. */
const CUE_ORDER: GameEvent['type'][] = ['boss', 'achievement', 'phase', 'level', 'streak', 'xp'];

interface Card {
  key: string;
  ids: string[];
  kind: GameEvent['type'];
  icon: string;
  title: string;
  detail: string;
}

/** The events as cards: every XP payment waiting is folded into one "+N XP" card. */
function toCards(events: GameEvent[]): Card[] {
  const cards: Card[] = [];
  const xp = events.filter((e): e is Extract<GameEvent, { type: 'xp' }> => e.type === 'xp');
  if (xp.length) {
    const total = xp.reduce((sum, e) => sum + e.amount, 0);
    const labels = Array.from(new Set(xp.map((e) => e.label)));
    cards.push({
      key: `xp-${xp[0].id}`,
      ids: xp.map((e) => e.id),
      kind: 'xp',
      icon: 'BoltIcon',
      title: `+${total} XP`,
      detail: labels.slice(0, 2).join(' · '),
    });
  }
  // Several level-ups in a row (a burst of completions) are one banner: the level the learner is at now.
  const lastLevel = [...events].reverse().find((e) => e.type === 'level');
  for (const e of events) {
    if (e.type === 'xp') continue;
    if (e.type === 'level' && e !== lastLevel) continue;
    if (e.type === 'level')
      cards.push({
        key: e.id,
        ids: [e.id],
        kind: 'level',
        icon: 'ArrowTrendingUpIcon',
        title: `Level ${e.level}`,
        detail: `You are now a ${e.title}`,
      });
    else if (e.type === 'phase')
      cards.push({
        key: e.id,
        ids: [e.id],
        kind: 'phase',
        icon: 'CheckBadgeIcon',
        title: 'Phase complete',
        detail: `${e.title} · +${e.bonus} XP. The next phase is open`,
      });
    else if (e.type === 'boss')
      cards.push({
        key: e.id,
        ids: [e.id],
        kind: 'boss',
        icon: 'TrophyIcon',
        title: 'Final boss defeated',
        detail: 'You finished the final challenge',
      });
    else if (e.type === 'streak')
      cards.push({
        key: e.id,
        ids: [e.id],
        kind: 'streak',
        icon: 'FireIcon',
        title: `${e.days}-day streak`,
        detail: 'Exercises passed on consecutive days',
      });
    else if (e.type === 'achievement') {
      const def = ACHIEVEMENTS.find((a) => a.id === e.achievementId);
      cards.push({
        key: e.id,
        ids: [e.id],
        kind: 'achievement',
        icon: def?.icon ?? 'TrophyIcon',
        title: def ? def.title : 'Achievement',
        detail: def?.description ?? '',
      });
    }
  }
  // A burst (a whole phase of finished work saved at once) shows the biggest moments, still in the order they happened.
  if (cards.length <= MAX_CARDS) return cards;
  const keep = cards
    .map((card, i) => ({ i, rank: PRIORITY[card.kind] }))
    .sort((a, b) => b.rank - a.rank || b.i - a.i)
    .slice(0, MAX_CARDS)
    .map((x) => x.i)
    .sort((a, b) => a - b);
  return keep.map((i) => cards[i]);
}

function RewardCard({ card, onDismiss }: { card: Card; onDismiss: (ids: string[]) => void }) {
  // The timer restarts when more XP folds into the card (its ids change), so a run of payments stays up until it is quiet.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(card.ids), SHOWN_MS[card.kind]);
    return () => clearTimeout(timer);
  }, [card.ids, card.kind, onDismiss]);

  return (
    <div className="gp-reward gp-material pointer-events-auto" data-kind={card.kind} role="status">
      <span className="gp-reward-icon">
        <Icon name={card.icon} size={18} variant="solid" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {card.kind === 'achievement' && (
          <p className="text-xs text-muted-foreground">Achievement unlocked</p>
        )}
        <p className="text-sm font-semibold leading-snug text-foreground">{card.title}</p>
        {card.detail && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{card.detail}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(card.ids)}
        aria-label="Dismiss"
        className="todo-focus -mr-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <Icon name="XMarkIcon" size={14} />
      </button>
    </div>
  );
}

/**
 * What the learner just earned, as iOS-style banners: XP, a level, a phase, an achievement, a streak, the boss. Bottom
 * centre, above the tab bar on phones. Game mode off shows nothing (the events are dropped); Celebrations off keeps the
 * game but not the banners; Sound and haptics adds a tone for the biggest event of a batch.
 */
export default function Rewards({
  events,
  onDismiss,
}: {
  events: GameEvent[];
  onDismiss: (id: string) => void;
}) {
  const prefs = usePrefs();
  const showCards = prefs.game && prefs.celebrate;
  const heard = useRef(new Set<string>());

  useEffect(() => {
    if (prefs.game && prefs.feedback) {
      const fresh = events.filter((e) => !heard.current.has(e.id));
      fresh.forEach((e) => heard.current.add(e.id));
      const top = CUE_ORDER.find((t) => fresh.some((e) => e.type === t));
      if (top) celebrate(top);
    }
    if (!showCards) events.forEach((e) => onDismiss(e.id));
  }, [events, prefs.game, prefs.feedback, showCards, onDismiss]);

  const dismiss = (ids: string[]) => ids.forEach(onDismiss);
  if (!showCards || typeof document === 'undefined') return null;
  const cards = toCards(events);
  return createPortal(
    <div
      data-overlay-safe=""
      role="region"
      aria-label="Rewards"
      className="todo-toast-host gp-accent pointer-events-none fixed inset-x-0 z-[300] flex flex-col items-center gap-2 px-4"
    >
      {cards.map((card) => (
        <RewardCard key={card.key} card={card} onDismiss={dismiss} />
      ))}
    </div>,
    document.body
  );
}
