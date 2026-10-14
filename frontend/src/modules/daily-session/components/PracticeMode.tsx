'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';
import { notify } from '@/lib/ui/notifications';

interface PracticeModeProps {
  onSwitchTab?: (tab: 'session' | 'quick-practice' | 'progress' | 'question-bank') => void;
}

const CATEGORY_CHIPS = [
  { label: 'All Topics', value: 'All' },
  { label: 'Interview Track', value: 'Interview' },
  { label: 'CV Skill Track', value: 'CV Skill' },
  { label: 'Data Structures & Algorithms', value: 'DSA' },
  { label: 'System Design', value: 'System Design' },
  { label: 'Deep Learning Vision', value: 'Deep Learning Vision' },
  { label: 'Classical CV', value: 'Classical CV' },
  { label: 'Behavioral & Leadership', value: 'Behavioral' },
];

const DIFFICULTY_OPTIONS = ['All', 'Easy', 'Medium', 'Hard'];
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

const SAMPLE_FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'p1',
    questionText: 'Implement a LRU Cache with O(1) time complexity for both get and put operations.',
    category: 'Interview',
    subType: 'Data Structures',
    difficulty: 'Hard',
    questionType: 'DSA',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p2',
    questionText: 'Design a distributed rate limiter service that limits client requests to 1,000 requests per minute with low latency.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p3',
    questionText: 'Explain the mathematical difference between intrinsic and extrinsic camera matrices and how Zhang\'s calibration estimates them.',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Hard',
    questionType: 'Camera Geometry',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p4',
    questionText: 'How do Anchor Boxes function in Faster R-CNN detectors, and how do you optimize anchor scales with K-means clustering?',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Object Detection',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p5',
    questionText: 'Describe how you resolved a high-stakes disagreement with product management regarding engineering technical debt.',
    category: 'Interview',
    subType: 'Behavioral',
    difficulty: 'Easy',
    questionType: 'Behavioral',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p6',
    questionText: 'Describe quantization-aware training (QAT) vs post-training quantization (PTQ) for deploying deep vision models to mobile edge GPUs.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Quantization',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
  {
    id: 'p7',
    questionText: 'Design a scalable real-time video streaming architecture that supports 50,000 concurrent viewers with low jitter.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Hard',
    questionType: 'System Design',
    dateEncountered: new Date().toISOString().split('T')[0],
    lastReviewed: null,
  },
];

export default function PracticeMode({ onSwitchTab }: PracticeModeProps) {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Config State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');
  const [questionCount, setQuestionCount] = useState(10);
  const [timedMode, setTimedMode] = useState(true);

  // Active Session State
  const [isPracticing, setIsPracticing] = useState(false);
  const [activeSet, setActiveSet] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await questionsService.getAll();
        if (data && data.length > 0) {
          setAllQuestions(data);
        } else {
          setAllQuestions(SAMPLE_FALLBACK_QUESTIONS);
        }
      } catch (err) {
        console.error('Failed to load questions for practice mode:', err);
        setAllQuestions(SAMPLE_FALLBACK_QUESTIONS);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPracticing && !isCompleted && timedMode) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPracticing, isCompleted, timedMode]);

  // Filter pool
  const eligibleQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      if (selectedCategory !== 'All') {
        const matchCategory = q.category === selectedCategory;
        const matchSubType = q.subType?.toLowerCase().includes(selectedCategory.toLowerCase());
        const matchType = q.questionType?.toLowerCase().includes(selectedCategory.toLowerCase());
        if (!matchCategory && !matchSubType && !matchType) return false;
      }
      if (selectedDifficulty !== 'All') {
        if (q.difficulty.toLowerCase() !== selectedDifficulty.toLowerCase()) return false;
      }
      return true;
    });
  }, [allQuestions, selectedCategory, selectedDifficulty]);

  const startPractice = () => {
    const pool = eligibleQuestions.length > 0 ? eligibleQuestions : allQuestions;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));
    setActiveSet(selected);
    setCurrentIndex(0);
    setNotes({});
    setRatings({});
    setShowAnswer(false);
    setShowHint(false);
    setElapsedSeconds(0);
    setIsCompleted(false);
    setIsPracticing(true);
  };

  const handleNext = () => {
    setShowAnswer(false);
    setShowHint(false);
    if (currentIndex < activeSet.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
      notify({
        source: 'daily-session',
        tone: 'success',
        title: 'Practice Drill Completed!',
        body: `You completed ${activeSet.length} questions in practice mode.`,
      });
    }
  };

  const handlePrevious = () => {
    setShowAnswer(false);
    setShowHint(false);
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleRate = (stars: number) => {
    const q = activeSet[currentIndex];
    if (!q) return;
    setRatings((prev) => ({ ...prev, [q.id]: stars }));
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  // 1. Completion Summary Screen
  if (isCompleted) {
    const ratedCount = Object.keys(ratings).length;
    const avgScore =
      ratedCount > 0
        ? (Object.values(ratings).reduce((a, b) => a + b, 0) / ratedCount).toFixed(1)
        : 'N/A';

    return (
      <div className="mx-auto max-w-2xl animate-fade-in rounded-2xl border border-border bg-card p-6 sm:p-10 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-primary/20 text-emerald-500">
          <Icon name="CheckBadgeIcon" size={36} variant="solid" />
        </div>
        <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
          Drill Practice Completed!
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Great job reinforcing your fundamentals. Review your drill summary below:
        </p>

        <div className="my-6 grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Questions</div>
            <div className="mt-1 text-xl font-bold text-foreground">{activeSet.length}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Time Taken</div>
            <div className="mt-1 text-xl font-bold text-foreground">{formatTimer(elapsedSeconds)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Average Rating</div>
            <div className="mt-1 text-xl font-bold text-primary">{avgScore} ★</div>
          </div>
        </div>

        <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setIsPracticing(false)}
            className="flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="ArrowLeftIcon" size={16} />
            Change Filters
          </button>
          <button
            type="button"
            onClick={startPractice}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-primary/25 hover:opacity-95 transition-opacity"
          >
            <Icon name="ArrowPathIcon" size={16} />
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  // 2. Active Question Practice Card
  if (isPracticing && activeSet.length > 0) {
    const currentQuestion = activeSet[currentIndex];
    const userRating = ratings[currentQuestion.id] || 0;
    const progressPercent = Math.round(((currentIndex + 1) / activeSet.length) * 100);

    const difficultyBadgeColor =
      currentQuestion.difficulty === 'Hard'
        ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
        : currentQuestion.difficulty === 'Medium'
        ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Top Control Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <Icon name="ClockIcon" size={15} />
              {formatTimer(elapsedSeconds)}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              Question <span className="text-foreground">{currentIndex + 1}</span> of{' '}
              <span className="text-foreground">{activeSet.length}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPracticing(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Exit Practice
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-violet-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Question Card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                {currentQuestion.category}
              </span>
              <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
                {currentQuestion.subType}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${difficultyBadgeColor}`}
              >
                {currentQuestion.difficulty}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Icon name="LightBulbIcon" size={15} />
              {showHint ? 'Hide Hint' : 'Need a Hint?'}
            </button>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground leading-relaxed">
              {currentQuestion.questionText}
            </h3>
          </div>

          {/* Hint disclosure */}
          {showHint && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-foreground animate-fade-in space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                <Icon name="SparklesIcon" size={15} />
                Guiding Clue & Strategy:
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Break the problem down into inputs, edge cases, core algorithmic or architectural
                components, and discuss trade-offs (e.g. latency vs accuracy, space vs time).
              </p>
            </div>
          )}

          {/* Scratchpad Answer Notepad */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Your Draft / Key Bullet Points (Optional):</span>
              <span>{(notes[currentQuestion.id] || '').length} characters</span>
            </div>
            <textarea
              rows={4}
              value={notes[currentQuestion.id] || ''}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))
              }
              placeholder="Jot down notes, pseudo-code, architectural blocks, or bullet points..."
              className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
            />
          </div>

          {/* Model Answer Toggle */}
          <div className="border-t border-border/60 pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setShowAnswer(!showAnswer)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2">
                <Icon
                  name={showAnswer ? 'EyeSlashIcon' : 'EyeIcon'}
                  size={17}
                  className="text-primary"
                />
                {showAnswer ? 'Hide Solution & Concepts' : 'Reveal Solution & Model Concepts'}
              </span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                className={`transition-transform duration-200 ${showAnswer ? 'rotate-180' : ''}`}
              />
            </button>

            {showAnswer && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 text-sm space-y-3 animate-fade-in">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <Icon name="AcademicCapIcon" size={17} />
                  Concept Breakdown & Ideal Architecture:
                </div>
                <div className="text-muted-foreground space-y-2 text-xs sm:text-sm leading-relaxed">
                  <p>
                    <strong>Key Objective:</strong> State the problem clearly, identify data
                    structures/components, and explain computational complexity or scalability
                    implications.
                  </p>
                  <p>
                    <strong>Recommended Structure:</strong>
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>Define primary parameters and constraints up front.</li>
                    <li>
                      Explain step-by-step logic, data flow, or mathematical derivation.
                    </li>
                    <li>Address trade-offs, potential failure points, and optimizations.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Self Evaluation Rating */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span>Rate Your Grasp:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRate(star)}
                    className="p-1 hover:scale-125 transition-transform"
                    title={`${star} Star${star > 1 ? 's' : ''}`}
                  >
                    <Icon
                      name="StarIcon"
                      size={18}
                      variant={userRating >= star ? 'solid' : 'outline'}
                      className={
                        userRating >= star ? 'text-amber-400' : 'text-muted-foreground/40'
                      }
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Prev / Next buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <Icon name="ChevronLeftIcon" size={15} />
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-opacity"
              >
                {currentIndex === activeSet.length - 1 ? 'Finish Drill' : 'Next Question'}
                <Icon name="ChevronRightIcon" size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Setup / Configuration Screen
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Intro Header */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-primary/20 text-primary">
              <Icon name="SparklesIcon" size={18} />
            </div>
            Custom Practice Mode
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure targeted interview and technical drills based on topic, difficulty, and question
            pool.
          </p>
        </div>

        {/* Category Picker */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Filter by Category / Topic
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((chip) => {
              const active = selectedCategory === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setSelectedCategory(chip.value)}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-border bg-muted/40 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty Picker */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Difficulty Level
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIFFICULTY_OPTIONS.map((diff) => {
              const active = selectedDifficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setSelectedDifficulty(diff)}
                  className={`rounded-xl border py-2.5 text-center text-xs font-semibold transition-all ${
                    active
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                      : 'border-border bg-muted/40 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
                  }`}
                >
                  {diff}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Count & Timed Switch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Number of Questions
            </label>
            <div className="flex gap-2">
              {QUESTION_COUNT_OPTIONS.map((count) => {
                const active = questionCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setQuestionCount(count)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-all ${
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {count} Qs
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Timer Mode
            </label>
            <button
              type="button"
              onClick={() => setTimedMode(!timedMode)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2">
                <Icon
                  name="ClockIcon"
                  size={16}
                  className={timedMode ? 'text-primary' : 'text-muted-foreground'}
                />
                {timedMode ? 'Timed Practice (Stopwatch On)' : 'Untimed Relaxed Drill'}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  timedMode ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {timedMode ? 'ACTIVE' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* Pool Summary & Start Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border/60 pt-4">
          <div className="text-xs text-muted-foreground">
            Available pool: <span className="font-bold text-foreground">{eligibleQuestions.length}</span>{' '}
            matching questions in database
          </div>

          <button
            type="button"
            onClick={startPractice}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity"
          >
            <Icon name="PlayIcon" size={17} variant="solid" />
            Start Practice Drill ({Math.min(questionCount, eligibleQuestions.length)} Qs)
          </button>
        </div>
      </div>
    </div>
  );
}
