'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';

const QUICK_FLASHCARD_POOL: { question: string; answer: string; category: string; subType: string; difficulty: string }[] = [
  {
    question: 'What is the time and space complexity of accessing, inserting, and deleting in a Hash Map vs a Balanced BST?',
    answer: 'Hash Map: Average O(1) time for search/insert/delete, worst case O(N) on hash collisions. Space O(N).\nBalanced BST (e.g. Red-Black / AVL): Guaranteed O(log N) worst-case time for search/insert/delete. Maintains sorted order.',
    category: 'Interview',
    subType: 'DSA',
    difficulty: 'Easy',
  },
  {
    question: 'Explain the difference between L1 and L2 regularization and why L1 produces sparse feature weights.',
    answer: 'L1 (Lasso) adds absolute value of weights |w| to the loss, creating diamond-shaped constraint boundaries that intersect axes, driving non-essential coefficients to zero (sparsity).\nL2 (Ridge) adds squared weights w^2, shrinking weights toward zero smoothly without making them exactly zero.',
    category: 'Interview',
    subType: 'ML Scenario',
    difficulty: 'Medium',
  },
  {
    question: 'How does Non-Maximum Suppression (NMS) eliminate redundant bounding boxes in object detection?',
    answer: '1. Sort all predicted boxes by confidence score.\n2. Pick the box with highest confidence and save it to results.\n3. Compute Intersection-over-Union (IoU) between this top box and remaining boxes.\n4. Discard any box with IoU > threshold (e.g., 0.5).\n5. Repeat until no boxes remain.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
  },
  {
    question: 'What is the CAP Theorem and why can a distributed system only guarantee two of Consistency, Availability, and Partition Tolerance?',
    answer: 'Network partitions (P) are inevitable in real-world distributed networks.\nWhen a partition occurs, the system must choose between:\n- Consistency (C): Return an error or block to prevent returning stale data.\n- Availability (A): Continue serving reads/writes, returning potentially stale data without cross-network synchronization.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
  },
  {
    question: 'What are Intrinsic vs Extrinsic Camera Parameters in Computer Vision?',
    answer: 'Intrinsic Parameters: Internal camera optical properties (focal lengths fx, fy, optical centers cx, cy, skew factor).\nExtrinsic Parameters: Camera position and orientation relative to world frame (3x3 Rotation matrix R, 3x1 Translation vector T).',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Medium',
  },
  {
    question: 'What is the vanishing gradient problem in Deep Neural Networks and how do Residual connections solve it?',
    answer: 'With deep chains of non-linear activations (like Sigmoid), gradients shrink exponentially during backpropagation.\nResidual connections (ResNet) provide a skip pathway: y = F(x) + x. The derivative contains dy/dx = dF/dx + 1, ensuring a gradient of at least 1 flows directly back to earlier layers.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Hard',
  },
  {
    question: 'How do you design an idempotent payment processing API endpoint?',
    answer: '1. Client generates a unique Idempotency-Key (UUID) with each transaction request.\n2. Server caches the key in Redis or ACID database before execution.\n3. If key is already processing or completed, return the cached result instead of re-charging.\n4. Use distributed locks with short TTL to handle concurrent retries.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Hard',
  },
];

export default function QuickPractice() {
  const [cards, setCards] = useState(QUICK_FLASHCARD_POOL);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Interview' | 'CV Skill'>('All');

  // Blitz Score
  const [streak, setStreak] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  // Try to load additional cards from backend
  useEffect(() => {
    async function loadDbQuestions() {
      try {
        const dbQs = await questionsService.getAll();
        if (dbQs && dbQs.length > 0) {
          const mapped = dbQs.map((q) => ({
            question: q.questionText,
            answer: `Category: ${q.category} (${q.subType})\nDifficulty: ${q.difficulty}.\n\nFormulate your core approach, list the key data structures or architectural blocks, discuss trade-offs, and double check edge cases.`,
            category: q.category,
            subType: q.subType,
            difficulty: q.difficulty,
          }));
          // Combine with our rich prompt cards
          setCards([...QUICK_FLASHCARD_POOL, ...mapped]);
        }
      } catch (e) {
        // Fallback remains active
      }
    }
    loadDbQuestions();
  }, []);

  const filteredCards = cards.filter((c) => {
    if (categoryFilter === 'All') return true;
    return c.category === categoryFilter;
  });

  const currentCard = filteredCards[currentIndex % filteredCards.length] || QUICK_FLASHCARD_POOL[0];

  const handleNext = () => {
    setIsRevealed(false);
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const handleShuffle = () => {
    setIsRevealed(false);
    const randomIndex = Math.floor(Math.random() * filteredCards.length);
    setCurrentIndex(randomIndex);
  };

  const handleGotIt = () => {
    setMasteredCount((prev) => prev + 1);
    setStreak((prev) => prev + 1);
    handleNext();
  };

  const handleNeedsReview = () => {
    setReviewCount((prev) => prev + 1);
    setStreak(0);
    handleNext();
  };

  const difficultyColor =
    currentCard.difficulty === 'Hard'
      ? 'text-rose-500 bg-rose-500/10 border-rose-500/30'
      : currentCard.difficulty === 'Medium'
      ? 'text-amber-500 bg-amber-500/10 border-amber-500/30'
      : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* Top Blitz Scoreboard */}
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 font-bold">
            <Icon name="FireIcon" size={20} variant="solid" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Streak
            </div>
            <div className="text-lg font-bold text-foreground">{streak} 🔥</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-x border-border/60 px-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 font-bold">
            <Icon name="CheckCircleIcon" size={20} variant="solid" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Mastered
            </div>
            <div className="text-lg font-bold text-foreground">{masteredCount}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 pl-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500 font-bold">
            <Icon name="ArrowPathIcon" size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Review
            </div>
            <div className="text-lg font-bold text-foreground">{reviewCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Shuffle Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
          {(['All', 'Interview', 'CV Skill'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategoryFilter(cat);
                setCurrentIndex(0);
                setIsRevealed(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                categoryFilter === cat
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat === 'All' ? 'All Questions' : cat}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleShuffle}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-sm"
        >
          <Icon name="ArrowPathIcon" size={14} />
          Random Shuffle
        </button>
      </div>

      {/* Main Flashcard Container */}
      <div className="relative min-h-[340px] rounded-3xl border border-border bg-card p-6 sm:p-10 shadow-md flex flex-col justify-between overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-violet-500 to-emerald-500" />

        {/* Card Header Meta */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {currentCard.category}
              </span>
              <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
                {currentCard.subType}
              </span>
              <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${difficultyColor}`}>
                {currentCard.difficulty}
              </span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Card {currentIndex + 1} of {filteredCards.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="my-6">
            <h3 className="font-heading text-lg sm:text-2xl font-bold text-foreground leading-relaxed">
              {currentCard.question}
            </h3>
          </div>
        </div>

        {/* Revealed Answer Box */}
        {isRevealed ? (
          <div className="my-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 animate-fade-in space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
              <Icon name="CheckCircleIcon" size={18} variant="solid" />
              Model Answer & Key Takeaway:
            </div>
            <div className="text-xs sm:text-sm text-foreground/90 whitespace-pre-line leading-relaxed font-body">
              {currentCard.answer}
            </div>
          </div>
        ) : (
          <div className="my-6 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setIsRevealed(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-violet-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              <Icon name="EyeIcon" size={18} variant="solid" />
              Reveal Answer
            </button>
          </div>
        )}

        {/* Card Footer Actions */}
        <div className="border-t border-border/60 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {isRevealed ? (
            <>
              <div className="text-xs font-medium text-muted-foreground">
                How did you do on this question?
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleNeedsReview}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/20 transition-colors"
                >
                  <Icon name="XMarkIcon" size={15} />
                  Needs Review
                </button>
                <button
                  type="button"
                  onClick={handleGotIt}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  <Icon name="CheckIcon" size={15} />
                  Nailed It!
                </button>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Take 30 seconds to formulate your answer mentally before revealing.
              </span>
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Skip Question
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
