'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ContentCard, QuizDisplayMode, TopicMeta } from '../types';
import SwipeCardItem from './SwipeCardItem';
import EmptyDeckState from './EmptyDeckState';
import Icon from '@/components/ui/AppIcon';

export interface GeneratingState {
  count: number;
  label: string;
  /** Set for "Quiz me on this": the card the questions are about. */
  forCardId?: string;
}

interface SwipeDeckViewProps {
  /** Cards still to swipe, in order: [0] is on top. */
  remaining: ContentCard[];
  /** Cards in this deck in total (drives the progress bar). */
  total: number;
  deckLabel: string;
  topicById: (id: string) => TopicMeta | undefined;
  savedCardIds: string[];
  quizMode: QuizDisplayMode;
  onSkip: (card: ContentCard) => void;
  onSave: (card: ContentCard) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** A card that just came back through Undo, and the side it left by: it flies back in from there. */
  returning: { id: string; dir: 'left' | 'right'; n: number } | null;
  onReviewAgain: () => void;
  /** Empty deck: generate a batch with the last-used options, no sheet. */
  onQuickGenerate: () => void;
  onOpenGenerate: () => void;
  onQuizMe: (card: ContentCard) => void;
  generating: GeneratingState | null;
  hasKey: boolean;
  onOpenSettings: () => void;
}

/** Resting place of the cards under the top one (the top card has no transform). */
const STACK_DEPTH = 3;

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export default function SwipeDeckView({
  remaining,
  total,
  deckLabel,
  topicById,
  savedCardIds,
  quizMode,
  onSkip,
  onSave,
  onUndo,
  canUndo,
  returning,
  onReviewAgain,
  onQuickGenerate,
  onOpenGenerate,
  onQuizMe,
  generating,
  hasKey,
  onOpenSettings,
}: SwipeDeckViewProps) {
  const top = remaining[0];
  const stack = remaining.slice(0, STACK_DEPTH);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);
  const leaveTimer = useRef<number | null>(null);
  const drag = useRef({
    active: false,
    axis: 'none' as 'none' | 'x' | 'y',
    x0: 0,
    y0: 0,
    dx: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
    moved: false,
  });

  // ── Painting (straight to the DOM, so a drag never re-renders React) ─────
  const paint = useCallback((dx: number) => {
    const el = frontRef.current;
    if (!el) return;
    const w = el.offsetWidth || 320;
    const p = Math.min(Math.abs(dx) / (w * 0.32), 1);
    el.style.transition = 'none';
    el.style.transform = `translate3d(${dx}px, ${Math.abs(dx) * 0.05}px, 0) rotate(${(dx / w) * 12}deg)`;
    el.style.setProperty('--save-o', String(dx > 0 ? p : 0));
    el.style.setProperty('--skip-o', String(dx < 0 ? p : 0));
    const back = backRef.current;
    if (back) {
      back.style.transition = 'none';
      back.style.transform = `translate3d(0, ${10 * (1 - p)}px, 0) scale(${0.95 + 0.05 * p})`;
      back.style.setProperty('--reveal', String(Math.min(Math.abs(dx) / 60, 1)));
    }
  }, []);

  /** Clear inline motion so the stylesheet's resting slots (and their transitions) apply again. */
  const settle = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.removeProperty('--save-o');
    el.style.removeProperty('--skip-o');
    el.style.removeProperty('--reveal');
  }, []);

  const snapBack = useCallback(() => {
    settle(frontRef.current);
    settle(backRef.current);
  }, [settle]);

  // A new card on top: drop whatever inline motion the previous gesture left on the promoted cards.
  const topId = top?.id;
  useLayoutEffect(() => {
    settle(frontRef.current);
    settle(backRef.current);
  }, [topId, settle]);

  // Undo: the card flies back in from the side it left by.
  const returningKey = returning ? `${returning.id}:${returning.n}` : '';
  useLayoutEffect(() => {
    const el = frontRef.current;
    if (
      !returning ||
      !el ||
      returning.id !== topId ||
      reducedMotion() ||
      typeof el.animate !== 'function'
    )
      return;
    const sign = returning.dir === 'right' ? 1 : -1;
    el.animate(
      [
        {
          transform: `translate3d(${sign * (el.offsetWidth + 80)}px, 40px, 0) rotate(${sign * 16}deg)`,
        },
        { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.05)' }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningKey]);

  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    },
    []
  );

  // ── Commit a swipe ───────────────────────────────────────────────────────
  const commit = useCallback(
    (dir: 'left' | 'right') => {
      const card = remaining[0];
      if (!card || leavingRef.current) return;
      leavingRef.current = true;
      const quick = reducedMotion();
      const el = frontRef.current;
      if (el && !quick) {
        const w = el.offsetWidth || 360;
        const x = (dir === 'right' ? 1 : -1) * (window.innerWidth / 2 + w);
        el.style.transition = 'transform 230ms cubic-bezier(0.4, 0, 0.7, 0.4)';
        el.style.transform = `translate3d(${x}px, 50px, 0) rotate(${dir === 'right' ? 18 : -18}deg)`;
        el.style.setProperty(dir === 'right' ? '--save-o' : '--skip-o', '1');
        el.style.setProperty(dir === 'right' ? '--skip-o' : '--save-o', '0');
      }
      const back = backRef.current;
      if (back && !quick) {
        back.style.transition = 'transform 230ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        back.style.transform = 'translate3d(0, 0, 0) scale(1)';
      }
      back?.style.setProperty('--reveal', '1');
      leaveTimer.current = window.setTimeout(
        () => {
          leavingRef.current = false;
          leaveTimer.current = null;
          (dir === 'right' ? onSave : onSkip)(card);
        },
        quick ? 0 : 210
      );
    },
    [remaining, onSave, onSkip]
  );

  // ── Gestures: touch (axis-locked, so a vertical drag scrolls the card) and mouse ──
  const start = (x: number, y: number) => {
    if (leavingRef.current || !top) return;
    drag.current = {
      active: true,
      axis: 'none',
      x0: x,
      y0: y,
      dx: 0,
      lastX: x,
      lastT: performance.now(),
      v: 0,
      moved: false,
    };
  };

  const move = (x: number, y: number) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = x - d.x0;
    const dy = y - d.y0;
    if (d.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (d.axis === 'y') return;
    d.moved = true;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) {
      d.v = d.v * 0.6 + ((x - d.lastX) / dt) * 0.4;
      d.lastX = x;
      d.lastT = now;
    }
    d.dx = dx;
    paint(dx);
  };

  const end = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.axis !== 'x') return;
    const w = frontRef.current?.offsetWidth || 320;
    const distance = Math.min(Math.max(w * 0.28, 70), 130);
    const flick = Math.abs(d.v) > 0.5 && Math.abs(d.dx) > 24 && Math.sign(d.v) === Math.sign(d.dx);
    if (Math.abs(d.dx) > distance || flick) commit(d.dx > 0 ? 'right' : 'left');
    else snapBack();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    start(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      end();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Keyboard: ← skip, → save, Z undo (not while a sheet is open or a field has focus) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      )
        return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        commit('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        commit('right');
      } else if ((e.key === 'z' || e.key === 'Z') && canUndo) {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit, canUndo, onUndo]);

  const done = total - remaining.length;
  const quickBusy = !!generating && !generating.forCardId;

  // ── Empty deck ───────────────────────────────────────────────────────────
  if (!top) {
    return (
      <EmptyDeckState
        fresh={total === 0}
        deckLabel={deckLabel}
        total={total}
        hasKey={hasKey}
        busy={!!generating}
        quickBusyCount={quickBusy ? generating?.count : undefined}
        onQuickGenerate={onQuickGenerate}
        onOpenGenerate={onOpenGenerate}
        onOpenSettings={onOpenSettings}
        onReviewAgain={onReviewAgain}
      />
    );
  }

  const topSaved = savedCardIds.includes(top.id);

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 min-h-0 flex-col px-3 pt-2.5 sm:px-4 sm:pt-4">
      {/* Progress through this deck */}
      <div className="mb-2.5 flex items-center gap-2.5 px-1 text-xs font-medium text-muted-foreground">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full mix-bg-muted/80"
          role="progressbar"
          aria-label={`${deckLabel} deck progress`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="swipe-progress h-full rounded-full"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        <span className="tabular-nums">
          {Math.min(done + 1, total)} / {total}
        </span>
      </div>

      {/* The stack: top card + up to two peeking underneath */}
      <div className="relative min-h-0 flex-1">
        {stack
          .map((card, slot) => ({ card, slot }))
          .reverse()
          .map(({ card, slot }) => (
            <div
              key={card.id}
              ref={slot === 0 ? frontRef : slot === 1 ? backRef : undefined}
              data-slot={slot}
              className={`swipe-stack-card absolute inset-x-0 top-0 bottom-[1.25rem] ${
                slot === 0
                  ? 'cursor-grab select-none active:cursor-grabbing'
                  : 'pointer-events-none'
              }`}
              aria-hidden={slot === 0 ? undefined : true}
              inert={slot === 0 ? undefined : true}
              onMouseDown={slot === 0 ? onMouseDown : undefined}
              onTouchStart={
                slot === 0 ? (e) => start(e.touches[0].clientX, e.touches[0].clientY) : undefined
              }
              onTouchMove={
                slot === 0 ? (e) => move(e.touches[0].clientX, e.touches[0].clientY) : undefined
              }
              onTouchEnd={slot === 0 ? end : undefined}
              onTouchCancel={slot === 0 ? snapBack : undefined}
              onClickCapture={
                slot === 0
                  ? (e) => {
                      // A drag that ends over a button must not also press it.
                      if (drag.current.moved) {
                        e.preventDefault();
                        e.stopPropagation();
                        drag.current.moved = false;
                      }
                    }
                  : undefined
              }
            >
              {slot === 0 && (
                <>
                  <span className="swipe-stamp swipe-stamp-save" aria-hidden="true">
                    <Icon name="BookmarkIcon" size={16} variant="solid" />
                    Save
                  </span>
                  <span className="swipe-stamp swipe-stamp-skip" aria-hidden="true">
                    <Icon name="XMarkIcon" size={16} />
                    Skip
                  </span>
                </>
              )}
              {slot === 2 ? (
                <div className="swipe-card h-full w-full" />
              ) : (
                <SwipeCardItem
                  card={card}
                  topic={topicById(card.topic)}
                  variant="deck"
                  quizMode={quizMode}
                  isSaved={savedCardIds.includes(card.id)}
                  onQuizMe={slot === 0 ? onQuizMe : undefined}
                  quizMeBusy={generating?.forCardId === card.id}
                  generateBusy={!!generating}
                />
              )}
            </div>
          ))}
      </div>

      {/* Actions, in thumb reach: undo · skip · save · generate */}
      <div className="flex shrink-0 items-center justify-center gap-4 pb-3 pt-1 sm:gap-5 sm:pb-4">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="swipe-act h-11 w-11"
          style={{ '--tone': '#f59e0b' } as React.CSSProperties}
          title="Undo (Z)"
          aria-label="Undo last swipe"
        >
          <Icon name="ArrowUturnLeftIcon" size={20} />
        </button>
        <button
          type="button"
          onClick={() => commit('left')}
          className="swipe-act h-[3.75rem] w-[3.75rem]"
          style={{ '--tone': 'var(--color-error)' } as React.CSSProperties}
          title="Skip (←)"
          aria-label="Skip card"
        >
          <Icon name="XMarkIcon" size={28} />
        </button>
        <button
          type="button"
          onClick={() => commit('right')}
          className="swipe-act h-[3.75rem] w-[3.75rem]"
          style={{ '--tone': 'var(--color-success)' } as React.CSSProperties}
          title="Save (→)"
          aria-label={topSaved ? 'Already saved, keep and continue' : 'Save card'}
        >
          <Icon name="BookmarkIcon" size={26} variant={topSaved ? 'solid' : 'outline'} />
        </button>
        <button
          type="button"
          onClick={onOpenGenerate}
          disabled={!!generating}
          className="swipe-act h-11 w-11"
          title="Generate new cards"
          aria-label="Generate new cards"
        >
          {generating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Icon name="SparklesIcon" size={20} />
          )}
        </button>
      </div>
    </div>
  );
}
