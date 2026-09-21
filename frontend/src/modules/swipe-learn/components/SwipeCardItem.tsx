'use client';

import React, { useState } from 'react';
import { ContentCard, TopicType, QuizDisplayMode } from '../types';
import Icon from '@/components/ui/AppIcon';

interface SwipeCardItemProps {
  card: ContentCard;
  mode?: 'deck' | 'feed';
  quizMode?: QuizDisplayMode;
  isSaved?: boolean;
  onSave?: () => void;
  onSkip?: () => void;
  onReinforceQuiz?: (card: ContentCard) => void;
}

export default function SwipeCardItem({
  card,
  mode = 'deck',
  quizMode = 'quiz',
  isSaved = false,
  onSave,
  onSkip,
  onReinforceQuiz,
}: SwipeCardItemProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDeeperDepth, setShowDeeperDepth] = useState(false);
  const [isFlippedFlashcard, setIsFlippedFlashcard] = useState(false);

  // Topic theme configuration
  const getTopicTheme = (topic: TopicType) => {
    switch (topic) {
      case 'python':
        return {
          label: 'Python',
          emoji: '🐍',
          bg: 'bg-[#10957d]',
          badgeBg: 'bg-white/20',
        };
      case 'computer-vision':
        return {
          label: 'CV',
          emoji: '👁️',
          bg: 'bg-[#0284c7]',
          badgeBg: 'bg-white/20',
        };
      case 'finance':
        return {
          label: 'Finance',
          emoji: '💰',
          bg: 'bg-[#2563eb]',
          badgeBg: 'bg-white/20',
        };
      case 'ai':
        return {
          label: 'AI',
          emoji: '🤖',
          bg: 'bg-[#7c3aed]',
          badgeBg: 'bg-white/20',
        };
      case 'genai':
        return {
          label: 'GenAI',
          emoji: '⚡',
          bg: 'bg-pink-600',
          badgeBg: 'bg-white/20',
        };
      case 'interview':
        return {
          label: 'Interview',
          emoji: '🧠',
          bg: 'bg-[#d97706]',
          badgeBg: 'bg-white/20',
        };
      case 'quiz':
        return {
          label: 'Quiz',
          emoji: '❓',
          bg: 'bg-[#e11d48]',
          badgeBg: 'bg-white/20',
        };
      default:
        return {
          label: topic.charAt(0).toUpperCase() + topic.slice(1),
          emoji: '💡',
          bg: 'bg-indigo-600',
          badgeBg: 'bg-white/20',
        };
    }
  };

  const theme = getTopicTheme(card.topic);

  const formatDifficulty = (diff?: string) => {
    if (!diff) return 'Beginner';
    return diff.charAt(0).toUpperCase() + diff.slice(1);
  };

  const formatTypeLabel = (type: string) => {
    switch (type) {
      case 'code':
        return 'Code Snippet';
      case 'quiz':
        return 'Quiz';
      case 'concept':
        return 'Concept';
      case 'tip':
        return 'Pro Tip';
      case 'fact':
        return 'Fact';
      case 'case-study':
        return 'Case Study';
      default:
        return 'Insight';
    }
  };

  const handleSelectOption = (index: number) => {
    setSelectedOption(index);
    setShowExplanation(true);
  };

  const hasDepth =
    card.depth &&
    (card.depth.howItWorks ||
      card.depth.architecture ||
      card.depth.example ||
      card.depth.commonMistakes ||
      card.depth.interviewQuestion);

  return (
    <div className="w-full bg-card rounded-3xl border border-border/70 shadow-lg overflow-hidden flex flex-col transition-all select-none">
      {/* 1. Header Banner */}
      <div className={`${theme.bg} px-5 py-3.5 flex items-center justify-between text-white`}>
        {/* Left: Topic with Emoji */}
        <div className="flex items-center gap-2 font-bold text-sm sm:text-base tracking-wide">
          <span className="text-base">{theme.emoji}</span>
          <span>{theme.label}</span>
          {card.subCategory && (
            <span className="text-[11px] font-normal opacity-90 px-1.5 py-0.5 rounded-md bg-black/15">
              {card.subCategory}
            </span>
          )}
        </div>

        {/* Right: Tag Pills */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`${theme.badgeBg} px-2.5 py-0.5 rounded-full flex items-center gap-1`}>
            {card.type === 'code' ? (
              <span className="font-mono text-[11px]">&lt;/&gt;</span>
            ) : card.type === 'quiz' ? (
              <span>?</span>
            ) : (
              <span>💡</span>
            )}
            <span>{formatTypeLabel(card.type)}</span>
          </span>

          <span className={`${theme.badgeBg} px-2.5 py-0.5 rounded-full`}>
            {formatDifficulty(card.difficulty)}
          </span>
        </div>
      </div>

      {/* 2. Card Body */}
      <div className="p-5 sm:p-7 flex-1 flex flex-col">
        {/* Optional Hook (<= 100 chars) */}
        {card.hook && (
          <span className="text-xs font-bold uppercase tracking-wider text-primary mb-1 block">
            {card.hook.slice(0, 100)}
          </span>
        )}

        {/* Title (<= 60 chars) */}
        <h2 className="text-xl sm:text-2xl font-bold text-foreground font-heading tracking-tight leading-snug">
          {card.title.slice(0, 60)}
        </h2>

        {/* Main Content (<= 300 chars, concise for fast consumption) */}
        <p className="text-sm sm:text-base text-foreground/85 font-normal mt-2 leading-relaxed">
          {card.content.slice(0, 300)}
        </p>

        {/* Structured Code Block (<= 15 lines) */}
        {card.code?.code && (
          <div className="mt-4 space-y-2">
            <div className="rounded-2xl bg-[#0f172a] text-slate-100 p-4 sm:p-5 font-mono text-xs sm:text-sm overflow-x-auto shadow-inner border border-slate-800/80 leading-relaxed">
              <pre>{card.code.code.split('\n').slice(0, 15).join('\n')}</pre>
            </div>
            {card.code.explanation && (
              <p className="text-xs text-muted-foreground italic px-1">
                {card.code.explanation}
              </p>
            )}
          </div>
        )}

        {/* Structured Quiz Display: Flashcard Mode vs Multiple-Choice Quiz Mode */}
        {card.quiz && quizMode === 'flashcard' ? (
          /* Flashcard Flip View */
          <div className="mt-4 p-4 rounded-2xl border border-dashed border-border bg-muted/30 text-center space-y-3">
            {!isFlippedFlashcard ? (
              <div className="py-3">
                <span className="text-xs text-muted-foreground block mb-2">
                  🎴 Flashcard Question
                </span>
                <p className="font-semibold text-sm text-foreground">
                  {card.quiz.question}
                </p>
                <button
                  type="button"
                  onClick={() => setIsFlippedFlashcard(true)}
                  className="mt-3 px-4 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                >
                  Reveal Answer 🔄
                </button>
              </div>
            ) : (
              <div className="py-3 text-left space-y-2 animate-fadeIn">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  ✓ Answer & Explanation
                </span>
                <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                  <strong>Correct:</strong> {card.quiz.options[card.quiz.correctAnswer]}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {card.quiz.explanation}
                </p>
                <button
                  type="button"
                  onClick={() => setIsFlippedFlashcard(false)}
                  className="text-xs text-primary hover:underline font-semibold block pt-1"
                >
                  Flip back
                </button>
              </div>
            )}
          </div>
        ) : card.quiz ? (
          /* Multiple Choice Interactive Quiz */
          <div className="mt-4 space-y-2.5">
            {card.quiz.options?.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === card.quiz?.correctAnswer;
              let optStyle =
                'bg-muted/50 border-border/80 text-foreground hover:bg-muted hover:border-primary/40';

              if (selectedOption !== null) {
                if (isCorrect) {
                  optStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold';
                } else if (isSelected) {
                  optStyle = 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300 font-bold';
                } else {
                  optStyle = 'opacity-50 border-border/40 text-muted-foreground';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border text-xs sm:text-sm flex items-center justify-between transition-all ${optStyle}`}
                >
                  <span>{opt}</span>
                  {selectedOption !== null && isCorrect && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                  )}
                  {selectedOption !== null && isSelected && !isCorrect && (
                    <span className="text-rose-600 font-bold">✕</span>
                  )}
                </button>
              );
            })}

            {/* Answer Explanation */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowExplanation((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-primary hover:underline transition-all py-0.5"
              >
                <Icon name={showExplanation ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                <span>{showExplanation ? 'Hide answer' : 'Show answer'}</span>
              </button>

              {showExplanation && (
                <div className="mt-2 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 p-4 text-xs sm:text-sm text-sky-950 dark:text-sky-200 leading-relaxed animate-fadeIn">
                  <p>
                    <strong className="font-bold">Answer:</strong> {card.quiz.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* 3. EXPANDABLE DEPTH: "↓ Explain deeper" */}
        {hasDepth && (
          <div className="mt-4 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowDeeperDepth((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors py-1 px-3 rounded-xl bg-primary/10 hover:bg-primary/15"
            >
              <Icon
                name="ChevronDownIcon"
                size={14}
                className={`transition-transform duration-300 ${showDeeperDepth ? 'rotate-180' : ''}`}
              />
              <span>{showDeeperDepth ? 'Hide deeper breakdown' : '↓ Explain deeper'}</span>
            </button>

            {showDeeperDepth && card.depth && (
              <div className="mt-3 space-y-3 p-4 sm:p-5 rounded-2xl bg-muted/40 border border-border/80 text-xs sm:text-sm animate-fadeIn">
                {card.depth.howItWorks && (
                  <div>
                    <span className="font-bold text-foreground block mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      ⚙️ How it works
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      {card.depth.howItWorks}
                    </p>
                  </div>
                )}

                {card.depth.architecture && (
                  <div>
                    <span className="font-bold text-foreground block mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      🏛️ Architecture
                    </span>
                    <div className="p-2.5 rounded-xl bg-card border border-border font-mono text-[11px] text-foreground/90 overflow-x-auto">
                      {card.depth.architecture}
                    </div>
                  </div>
                )}

                {card.depth.example && (
                  <div>
                    <span className="font-bold text-foreground block mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      💡 Real-World Example
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      {card.depth.example}
                    </p>
                  </div>
                )}

                {card.depth.commonMistakes && (
                  <div>
                    <span className="font-bold text-rose-600 dark:text-rose-400 block mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      ⚠️ Common Mistakes
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      {card.depth.commonMistakes}
                    </p>
                  </div>
                )}

                {card.depth.interviewQuestion && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="font-bold text-amber-600 dark:text-amber-400 block mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      🎯 Interview Question
                    </span>
                    <p className="text-foreground font-medium leading-relaxed">
                      {card.depth.interviewQuestion}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. LEARN → TEST → REINFORCE PROMPT */}
        {card.type !== 'quiz' && onReinforceQuiz && (
          <div className="mt-3 pt-2">
            <button
              type="button"
              onClick={() => onReinforceQuiz(card)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors group"
            >
              <span>Test your understanding on this</span>
              <span className="group-hover:translate-x-0.5 transition-transform text-primary">→</span>
            </button>
          </div>
        )}

        {/* 5. Metadata Bar (Read Time, Difficulty, Tags) */}
        <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-1.5">
            {card.tags?.slice(0, 3).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-mono">
                #{tag}
              </span>
            ))}
          </div>
          {card.estimatedReadTime && (
            <span className="font-mono text-muted-foreground/75">
              ⏱️ {card.estimatedReadTime}s read
            </span>
          )}
        </div>

        {/* 6. Card Footer */}
        {mode === 'deck' ? (
          /* Swipe Deck Footer */
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1 text-rose-500/80">
              <span>✕</span>
              <span>Swipe left to skip</span>
            </span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span>✓</span>
              <span>Swipe right to save</span>
            </span>
          </div>
        ) : (
          /* Mixed Vertical Feed Footer */
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onSkip}
              className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-semibold transition-colors py-1 px-2 rounded-lg hover:bg-rose-500/10"
            >
              <span className="text-sm leading-none">✕</span>
              <span>Skip</span>
            </button>

            <span className="text-[11px] text-muted-foreground/60 hidden xs:inline">
              swipe to dismiss
            </span>

            <button
              type="button"
              onClick={onSave}
              className={`flex items-center gap-1.5 font-semibold transition-colors py-1 px-2.5 rounded-lg ${
                isSaved
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon name="BookmarkIcon" size={15} variant={isSaved ? 'solid' : 'outline'} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
