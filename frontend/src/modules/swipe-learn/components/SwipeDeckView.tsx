'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ContentCard, QuizDisplayMode } from '../types';
import SwipeCardItem from './SwipeCardItem';
import Icon from '@/components/ui/AppIcon';

interface SwipeDeckViewProps {
  cards: ContentCard[];
  currentIndex: number;
  savedCardIds: string[];
  quizMode?: QuizDisplayMode;
  onSwipeLeft: (card: ContentCard) => void;
  onSwipeRight: (card: ContentCard) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onResetDeck: () => void;
  onReinforceQuiz?: (card: ContentCard) => void;
}

export default function SwipeDeckView({
  cards,
  currentIndex,
  savedCardIds,
  quizMode = 'quiz',
  onSwipeLeft,
  onSwipeRight,
  onUndo,
  canUndo = false,
  onResetDeck,
  onReinforceQuiz,
}: SwipeDeckViewProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

  const startPosRef = useRef({ x: 0, y: 0 });
  const currentCard = cards[currentIndex];
  const nextCard = cards[currentIndex + 1];

  // Reset local drag offset whenever index changes
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
    setExitDirection(null);
  }, [currentIndex]);

  const triggerSkip = useCallback(() => {
    if (!currentCard || exitDirection) return;
    setExitDirection('left');
    setTimeout(() => {
      onSwipeLeft(currentCard);
    }, 250);
  }, [currentCard, exitDirection, onSwipeLeft]);

  const triggerSave = useCallback(() => {
    if (!currentCard || exitDirection) return;
    setExitDirection('right');
    setTimeout(() => {
      onSwipeRight(currentCard);
    }, 250);
  }, [currentCard, exitDirection, onSwipeRight]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        triggerSkip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        triggerSave();
      } else if ((e.key === 'z' || e.key === 'Z') && canUndo && onUndo) {
        e.preventDefault();
        onUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerSkip, triggerSave, canUndo, onUndo]);

  // Pointer drag logic
  const handlePointerDown = (clientX: number, clientY: number) => {
    if (exitDirection) return;
    setIsDragging(true);
    startPosRef.current = { x: clientX, y: clientY };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging || exitDirection) return;
    const deltaX = clientX - startPosRef.current.x;
    const deltaY = clientY - startPosRef.current.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handlePointerUp = () => {
    if (!isDragging || exitDirection) return;
    setIsDragging(false);

    const threshold = 90;
    if (dragOffset.x > threshold) {
      triggerSave();
    } else if (dragOffset.x < -threshold) {
      triggerSkip();
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  if (!currentCard) {
    return (
      <div className="w-full max-w-[440px] mx-auto py-16 px-6 text-center space-y-5 animate-fadeIn">
        <div className="w-18 h-18 mx-auto rounded-3xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <Icon name="CheckBadgeIcon" size={44} variant="solid" />
        </div>
        <div>
          <h3 className="text-2xl font-bold text-foreground font-heading">
            All Caught Up!
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            You reviewed all cards in this topic. Generate fresh cards or restart this deck anytime.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onResetDeck}
            className="px-6 py-2.5 rounded-2xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            Review Again
          </button>
        </div>
      </div>
    );
  }

  const rotationDeg = dragOffset.x * 0.08;
  const rightOpacity = Math.min(Math.max(dragOffset.x / 80, 0), 1);
  const leftOpacity = Math.min(Math.max(-dragOffset.x / 80, 0), 1);

  let transformStyle = '';
  let transitionStyle = isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.25s ease';

  if (exitDirection === 'right') {
    transformStyle = 'translate3d(120vw, 30px, 0) rotate(22deg)';
    transitionStyle = 'transform 0.25s ease-in, opacity 0.25s ease-in';
  } else if (exitDirection === 'left') {
    transformStyle = 'translate3d(-120vw, 30px, 0) rotate(-22deg)';
    transitionStyle = 'transform 0.25s ease-in, opacity 0.25s ease-in';
  } else if (isDragging) {
    transformStyle = `translate3d(${dragOffset.x}px, ${dragOffset.y * 0.3}px, 0) rotate(${rotationDeg}deg)`;
  }

  const isSaved = savedCardIds.includes(currentCard.id);

  return (
    <div className="w-full max-w-[460px] mx-auto px-3 sm:px-4 flex flex-col items-center select-none pt-2 pb-8">
      {/* Card Stack Container */}
      <div className="relative w-full min-h-[460px]">
        {/* Behind Card (Stack Effect) */}
        {nextCard && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 top-3 left-2 right-2 rounded-3xl bg-card border border-border/60 shadow-md -z-10 scale-[0.97] opacity-60 transition-transform duration-300 transform translate-y-2"
          />
        )}

        {/* Top Active Card */}
        <div
          className="w-full relative touch-pan-y cursor-grab active:cursor-grabbing"
          style={{
            transform: transformStyle,
            transition: transitionStyle,
            opacity: exitDirection ? 0.2 : 1,
          }}
          onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
          onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={(e) => handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handlePointerUp}
        >
          {/* Dynamic Gesture Feedback Badges */}
          <div
            style={{ opacity: rightOpacity }}
            className="pointer-events-none absolute top-6 left-6 z-50 rounded-2xl border-2 border-emerald-500 bg-emerald-500/20 px-4 py-2 backdrop-blur-md shadow-lg transform -rotate-12 transition-opacity"
          >
            <span className="flex items-center gap-1.5 text-base font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400">
              <Icon name="CheckCircleIcon" size={20} variant="solid" />
              SAVE
            </span>
          </div>

          <div
            style={{ opacity: leftOpacity }}
            className="pointer-events-none absolute top-6 right-6 z-50 rounded-2xl border-2 border-rose-500 bg-rose-500/20 px-4 py-2 backdrop-blur-md shadow-lg transform rotate-12 transition-opacity"
          >
            <span className="flex items-center gap-1.5 text-base font-extrabold tracking-wider text-rose-600 dark:text-rose-400">
              <Icon name="XCircleIcon" size={20} variant="solid" />
              SKIP
            </span>
          </div>

          <SwipeCardItem
            card={currentCard}
            mode="deck"
            quizMode={quizMode}
            isSaved={isSaved}
            onReinforceQuiz={onReinforceQuiz}
          />
        </div>
      </div>

      {/* Floating Bottom Action Pod matching input_file_0.png */}
      <div className="mt-7 flex items-center justify-center gap-5 sm:gap-6">
        {/* Red ✕ (Skip) */}
        <button
          type="button"
          onClick={triggerSkip}
          className="w-15 h-15 rounded-full bg-card hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-border/80 text-rose-500 shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 group"
          title="Skip card (Swipe Left or ←)"
          aria-label="Skip card"
        >
          <svg className="w-7 h-7 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Amber ↻ (Undo / Refresh) */}
        <button
          type="button"
          onClick={onUndo || onResetDeck}
          disabled={!canUndo && !onUndo}
          className="w-11 h-11 rounded-full bg-card hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-border/80 text-amber-500 shadow-lg flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 disabled:opacity-40"
          title={canUndo ? 'Undo last swipe (Z)' : 'Refresh deck'}
          aria-label="Undo or refresh"
        >
          <Icon name="ArrowPathIcon" size={20} />
        </button>

        {/* Green ✓ (Save) */}
        <button
          type="button"
          onClick={triggerSave}
          className="w-15 h-15 rounded-full bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-border/80 text-emerald-600 dark:text-emerald-400 shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 group"
          title="Save card (Swipe Right or →)"
          aria-label="Save card"
        >
          <svg className="w-7 h-7 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
