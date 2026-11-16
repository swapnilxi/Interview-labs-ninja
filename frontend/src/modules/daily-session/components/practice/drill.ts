/** Practice drill data: topics, levels, the history kept in this browser, and the missions built from your data. */

import type { Question } from '@/lib/services/questionsService';
import type { Tone } from '../ds';
import type { Mission } from './Missions';

export const CATEGORY_CHIPS: { label: string; value: string; icon: string; tone: Tone }[] = [
  { label: 'Everything', value: 'All', icon: 'Squares2X2Icon', tone: 'indigo' },
  { label: 'Interview', value: 'Interview', icon: 'MicrophoneIcon', tone: 'indigo' },
  { label: 'CV skill', value: 'CV Skill', icon: 'EyeIcon', tone: 'jade' },
  { label: 'DSA', value: 'DSA', icon: 'PuzzlePieceIcon', tone: 'gold' },
  { label: 'System design', value: 'System Design', icon: 'ServerStackIcon', tone: 'indigo' },
  { label: 'Deep learning', value: 'Deep Learning Vision', icon: 'CpuChipIcon', tone: 'jade' },
  { label: 'Classical CV', value: 'Classical CV', icon: 'ViewfinderCircleIcon', tone: 'gold' },
  { label: 'Behavioral', value: 'Behavioral', icon: 'UserGroupIcon', tone: 'indigo' },
];

/** Narrow topics only: "Interview" and "CV skill" are whole categories, too broad to call a weak spot. */
const WEAK_SPOT_TOPICS = ['DSA', 'System Design', 'Deep Learning Vision', 'Classical CV', 'Behavioral'];

export const DIFFICULTY_OPTIONS = [
  { value: 'All', label: 'Mixed' },
  { value: 'Easy', label: 'Easy' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Hard', label: 'Hard' },
];
export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];

export const topicLabel = (value: string) => CATEGORY_CHIPS.find((c) => c.value === value)?.label ?? value;

/** Does a question belong in a drill of this topic and level? ('All' matches anything.) */
export function matchesDrill(q: Question, category: string, difficulty: string): boolean {
  if (category !== 'All') {
    const c = category.toLowerCase();
    const ok = q.category === category || q.subType?.toLowerCase().includes(c) || q.questionType?.toLowerCase().includes(c);
    if (!ok) return false;
  }
  return difficulty === 'All' || q.difficulty.toLowerCase() === difficulty.toLowerCase();
}

/** A question from the bank (its id is the database id), as opposed to a built-in sample. */
export const isBankQuestion = (q: Question) => /^\d+$/.test(q.id);

const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

/**
 * One-tap drills from your own data. The review list and ratings are per user on the server (both backends), so
 * these follow you between the phone and the desktop.
 */
export function buildMissions(all: Question[], reviewIds: Set<string> | null): Mission[] {
  const bank = all.filter(isBankQuestion);
  const out: Mission[] = [];

  if (reviewIds) {
    const review = bank.filter((q) => reviewIds.has(q.id));
    out.push(
      review.length > 0
        ? {
            id: 'review',
            icon: 'ArrowPathIcon',
            tone: 'rose',
            title: 'Clear your review list',
            sub: `${review.length} question${review.length === 1 ? '' : 's'} you marked to come back to`,
            questions: shuffle(review).slice(0, 10),
          }
        : {
            id: 'review',
            icon: 'CheckBadgeIcon',
            tone: 'jade',
            title: 'Your review list is clear',
            sub: 'A question you miss in a drill lands here',
            questions: [],
          }
    );
  }

  const fresh = bank.filter((q) => q.userPerformance === undefined && !q.lastReviewed);
  if (fresh.length > 0) {
    out.push({
      id: 'fresh',
      icon: 'SparklesIcon',
      tone: 'indigo',
      title: 'Try new questions',
      sub: `${fresh.length} you have not practised yet`,
      questions: shuffle(fresh).slice(0, 5),
    });
  }

  const weakest = WEAK_SPOT_TOPICS.map((value) => {
    const qs = bank.filter((q) => matchesDrill(q, value, 'All'));
    const rated = qs.filter((q) => q.userPerformance !== undefined);
    const avg = rated.length ? rated.reduce((s, q) => s + (q.userPerformance ?? 0), 0) / rated.length : 5;
    return { value, qs, rated: rated.length, avg };
  })
    .filter((t) => t.rated >= 2 && t.avg < 4)
    .sort((a, b) => a.avg - b.avg)[0];

  if (weakest) {
    out.push({
      id: 'weak',
      icon: 'ArrowTrendingUpIcon',
      tone: 'gold',
      title: `Strengthen ${topicLabel(weakest.value)}`,
      sub: `Your lowest-rated topic, ${weakest.avg.toFixed(1)} of 5 on average`,
      // Lowest-rated first, then the ones never rated.
      questions: [...weakest.qs].sort((a, b) => (a.userPerformance ?? 3.5) - (b.userPerformance ?? 3.5)).slice(0, 5),
    });
  } else {
    const hard = all.filter((q) => q.difficulty === 'Hard');
    if (hard.length > 0) {
      out.push({
        id: 'hard',
        icon: 'FireIcon',
        tone: 'rose',
        title: 'Hard five',
        sub: 'Five hard questions, for when you feel sharp',
        questions: shuffle(hard).slice(0, 5),
      });
    }
  }
  return out;
}

// ── History (this browser) ──────────────────────────────────────────────────────────────────────────────────────
export const HISTORY_KEY = 'labninja.practice.history.v1';

export interface PracticeRun {
  at: string;
  category: string;
  difficulty: string;
  total: number;
  nailed: number;
  almost: number;
  accuracy: number;
  xp: number;
  seconds: number;
  /** A mission's name, when the drill was one. */
  mission?: string;
  /** Average AI score, when at least one answer was checked. */
  avgScore?: number;
}

export const readHistory = (): PracticeRun[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const today = () => new Date().toISOString().split('T')[0];

/** Shown when the bank is empty or cannot be read, so Practice still works. */
export const SAMPLE_FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'p1',
    questionText: 'Implement a LRU Cache with O(1) time complexity for both get and put operations.',
    category: 'Interview',
    subType: 'Data Structures',
    difficulty: 'Hard',
    questionType: 'DSA',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p2',
    questionText:
      'Design a distributed rate limiter service that limits client requests to 1,000 requests per minute with low latency.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
    questionType: 'System Design',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p3',
    questionText:
      "Explain the mathematical difference between intrinsic and extrinsic camera matrices and how Zhang's calibration estimates them.",
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Hard',
    questionType: 'Camera Geometry',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p4',
    questionText:
      'How do Anchor Boxes function in Faster R-CNN detectors, and how do you optimize anchor scales with K-means clustering?',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Object Detection',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p5',
    questionText:
      'Describe how you resolved a high-stakes disagreement with product management regarding engineering technical debt.',
    category: 'Interview',
    subType: 'Behavioral',
    difficulty: 'Easy',
    questionType: 'Behavioral',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p6',
    questionText:
      'Describe quantization-aware training (QAT) vs post-training quantization (PTQ) for deploying deep vision models to mobile edge GPUs.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
    questionType: 'Quantization',
    dateEncountered: today(),
    lastReviewed: null,
  },
  {
    id: 'p7',
    questionText:
      'Design a scalable real-time video streaming architecture that supports 50,000 concurrent viewers with low jitter.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Hard',
    questionType: 'System Design',
    dateEncountered: today(),
    lastReviewed: null,
  },
];
