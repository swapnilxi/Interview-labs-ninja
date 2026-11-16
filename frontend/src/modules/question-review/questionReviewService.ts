'use client';

/**
 * Question Review: one question, the signed-in user's own answer + notes, a concept quiz and three study views.
 *
 * Every route needs a login (apiFetch attaches the token). Data calls use apiFetch with no timeout (a cold dev
 * route can take a while to compile); calls that wait on an AI provider go through backendFetch with
 * AI_TIMEOUT_MS. Twins: backend/modules/daily_session (FastAPI) and frontend/fe-apis/dailySession (nextjs-api).
 */

import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import { AI_TIMEOUT_MS, backendFetch } from '@/lib/http/backendAvailability';
import { defaultAIRequestFields } from '@/lib/services/settingsService';

/** A failed request, with the HTTP status so a caller can tell "not found" from "could not load". */
export class ReviewApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ReviewApiError';
  }
}

/** The backend's QuestionOut, with the category kept as its code (`interview` / `cv_skill`). */
export interface ReviewQuestion {
  id: number;
  questionText: string;
  category: string;
  subType: string;
  difficulty: string;
  topics: string[];
  questionDate: string | null;
  /** The caller's own rating, 1-5 (5 = mastered); null when never rated. */
  userPerformance: number | null;
  /** The caller's own last review (YYYY-MM-DD). */
  lastReviewed: string | null;
}

export interface QuestionWorkspace {
  question_id: number;
  answer: string;
  notes: string;
  updated_at: string | null;
  /** On this user's review list ("Add to review"). */
  in_review?: boolean;
}

export interface ReviewMark {
  question_id: number;
  in_review: boolean;
  added_at: string | null;
}

export interface QuestionQuizItem {
  id: number;
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface QuickReview {
  kind: 'quick';
  title: string;
  read_minutes: number;
  summary: string;
  key_points: string[];
  remember: string;
  pitfalls: string[];
  updated_at: string | null;
}

export interface BreakdownChunk {
  title: string;
  /** Markdown. */
  body: string;
  /** A self-check question for the chunk. */
  check: string;
}

export interface Breakdown {
  kind: 'breakdown';
  chunks: BreakdownChunk[];
  /** Indexes of the chunks marked as read. */
  done: number[];
  updated_at: string | null;
}

export interface DeepSection {
  heading: string;
  /** Markdown. */
  body: string;
  /** 1-3; at 3 a section cannot go deeper. */
  depth: number;
}

export interface DeepDive {
  kind: 'deep';
  sections: DeepSection[];
  further: string[];
  updated_at: string | null;
}

export type StudyKind = 'quick' | 'breakdown' | 'deep';
export interface StudyItems {
  quick: QuickReview | null;
  breakdown: Breakdown | null;
  deep: DeepDive | null;
}
export type StudyItem<K extends StudyKind> = K extends 'quick'
  ? QuickReview
  : K extends 'breakdown'
    ? Breakdown
    : DeepDive;

/** The most quiz items one question keeps (the server refuses more). */
export const MAX_QUIZ_ITEMS = 40;
/** The written answer a quiz or study request may send along. */
const MAX_ANSWER_CHARS = 4000;
/** A deep-dive section stops going deeper here. */
export const MAX_DEEP_DEPTH = 3;
/** Wrong quiz stems sent back with the next generate. */
const MAX_MISSED = 8;
const MAX_MISSED_CHARS = 300;
const LIST_TTL_MS = 60_000;
let listCache: { at: number; promise: Promise<ReviewQuestion[]> } | null = null;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [];

export function mapQuestion(raw: Record<string, unknown>): ReviewQuestion {
  const perf = raw.user_performance;
  return {
    id: Number(raw.id),
    questionText: str(raw.question_text),
    category: str(raw.category) || 'interview',
    subType: str(raw.sub_type),
    difficulty: str(raw.difficulty) || 'medium',
    topics: strList(raw.topics),
    questionDate: str(raw.question_date) || null,
    userPerformance: typeof perf === 'number' ? perf : null,
    lastReviewed: str(raw.last_reviewed) || null,
  };
}

/** The server's message: FastAPI sends a 422's `detail` as a list of {msg}, fe-apis as a string. */
async function errorText(res: Response): Promise<string> {
  if (res.status === 422) {
    try {
      const data = await res.clone().json();
      if (Array.isArray(data?.detail)) {
        const msgs = data.detail
          .map((d: { msg?: unknown }) => (typeof d?.msg === 'string' ? d.msg : ''))
          .filter(Boolean);
        if (msgs.length) return msgs.join('; ');
      }
    } catch {
      /* not JSON: parseApiError words it */
    }
  }
  return parseApiError(res);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ReviewApiError(await errorText(res), res.status);
  return (await res.json()) as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** An AI call: the user's model settings ride along, and it may take minutes. */
const ai = (path: string, body: Record<string, unknown>) =>
  backendFetch(path, {
    method: 'POST',
    body: JSON.stringify({ ...body, ...defaultAIRequestFields() }),
    timeoutMs: AI_TIMEOUT_MS,
  });

const clipAnswer = (answer: string) => {
  const a = answer.trim();
  return a ? a.slice(0, MAX_ANSWER_CHARS) : undefined;
};

export const questionReviewService = {
  async getQuestion(id: number): Promise<ReviewQuestion> {
    return mapQuestion(await json<Record<string, unknown>>(await apiFetch(`/questions/${id}`)));
  },

  /**
   * Every question in the bank, in the server's order (related questions, previous / next). Kept for a minute, so
   * stepping from question to question does not fetch the whole bank again.
   */
  listQuestions(): Promise<ReviewQuestion[]> {
    if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.promise;
    const promise = apiFetch('/questions')
      .then((res) => json<unknown>(res))
      .then((data) =>
        Array.isArray(data) ? data.map((r) => mapQuestion(r as Record<string, unknown>)) : []
      );
    listCache = { at: Date.now(), promise };
    promise.catch(() => {
      if (listCache?.promise === promise) listCache = null;
    });
    return promise;
  },

  /** This user's review list, newest first. */
  async getReviewList(): Promise<{ question_id: number; added_at: string }[]> {
    const data = await json<{ items?: { question_id: number; added_at: string }[] }>(
      await apiFetch('/questions/review-list')
    );
    return Array.isArray(data.items) ? data.items : [];
  },

  async setInReview(id: number, inReview: boolean): Promise<ReviewMark> {
    return json(await apiFetch(`/questions/${id}/review`, send(inReview ? 'PUT' : 'DELETE')));
  },

  /** Rate the question for this user (5 = mastered). */
  async setPerformance(id: number, value: number): Promise<void> {
    await json(
      await apiFetch(`/questions/${id}/performance`, send('PATCH', { user_performance: value }))
    );
  },

  async getWorkspace(id: number): Promise<QuestionWorkspace> {
    return json(await apiFetch(`/questions/${id}/workspace`));
  },

  /** Partial upsert: only the fields given are changed. */
  async saveWorkspace(
    id: number,
    patch: { answer?: string; notes?: string }
  ): Promise<QuestionWorkspace> {
    return json(await apiFetch(`/questions/${id}/workspace`, send('PUT', patch)));
  },

  async getQuiz(id: number): Promise<QuestionQuizItem[]> {
    return (
      (await json<{ questions: QuestionQuizItem[] }>(await apiFetch(`/questions/${id}/quiz`)))
        .questions ?? []
    );
  },

  /**
   * Adds up to `count` new items, aimed partly at gaps in `answer` and at the stems the user just got wrong
   * (`missed`, at most 8); resolves to the FULL list.
   */
  async generateQuiz(
    id: number,
    count: number,
    answer: string,
    missed: string[] = []
  ): Promise<QuestionQuizItem[]> {
    const res = await ai(`/questions/${id}/quiz/generate`, {
      count,
      answer: clipAnswer(answer),
      missed: missed.length
        ? missed.slice(-MAX_MISSED).map((m) => m.slice(0, MAX_MISSED_CHARS))
        : undefined,
    });
    return (await json<{ questions: QuestionQuizItem[] }>(res)).questions ?? [];
  },

  async resetQuiz(id: number): Promise<void> {
    await json(await apiFetch(`/questions/${id}/quiz`, send('DELETE')));
  },

  async getStudy(id: number): Promise<StudyItems> {
    const data = await json<Partial<StudyItems>>(await apiFetch(`/questions/${id}/study`));
    return {
      quick: data.quick ?? null,
      breakdown: data.breakdown ?? null,
      deep: data.deep ?? null,
    };
  },

  /** Writes the item when it is not stored yet; `refresh` writes a new one. */
  async generateStudy<K extends StudyKind>(
    id: number,
    kind: K,
    opts: { refresh?: boolean; answer?: string } = {}
  ): Promise<StudyItem<K>> {
    const res = await ai(`/questions/${id}/study/${kind}`, {
      refresh: opts.refresh || undefined,
      answer: clipAnswer(opts.answer ?? ''),
    });
    return json(res);
  },

  /** One section of the deep dive, one level deeper; resolves to the whole updated deep dive. */
  async expandDeep(id: number, section: number): Promise<DeepDive> {
    return json(await ai(`/questions/${id}/study/deep/expand`, { section }));
  },

  async saveBreakdownProgress(id: number, done: number[]): Promise<Breakdown> {
    return json(await apiFetch(`/questions/${id}/study/breakdown/progress`, send('PUT', { done })));
  },
};

/** "Hard", "Mixed": the backend stores difficulty in lower case. */
export function difficultyLabel(d: string): string {
  const v = d.trim().toLowerCase();
  return v ? v[0].toUpperCase() + v.slice(1) : 'Mixed';
}

/**
 * The Question Bank's default order (its "Date added", newest first; a stable sort over the server's order), which
 * previous / next follows when the review page was not opened from the review list.
 */
export function bankOrder(list: ReviewQuestion[]): number[] {
  return [...list]
    .sort((a, b) => {
      const x = a.questionDate ?? '';
      const y = b.questionDate ?? '';
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .map((q) => q.id);
}

export function categoryLabel(code: string): string {
  return code === 'cv_skill' ? 'CV skill' : 'Interview';
}

/**
 * Sentence case for a short label: "System Design (Mid-Scale)" -> "System design (mid-scale)". Acronyms ("LRU",
 * "CV") keep their capitals; only Title-case words after the first are lowered.
 */
export function sentenceCase(s: string): string {
  const words = s.trim().split(/(\s+|[-(/)])/);
  let first = true;
  return words
    .map((w) => {
      if (!/[A-Za-z]/.test(w)) return w;
      if (first) {
        first = false;
        return w[0].toUpperCase() + w.slice(1);
      }
      return /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w;
    })
    .join('');
}

/** The label a SwipeLearn deck gets: the question's first specific topic, else its type (40 characters at most). */
export function swipeLabel(q: Pick<ReviewQuestion, 'topics' | 'subType'>): string {
  const generic = new Set([
    q.subType.toLowerCase(),
    'dsa',
    'cv',
    'behavioral',
    'system design',
    'debugging',
  ]);
  const specific = q.topics.find((t) => !generic.has(t.trim().toLowerCase()));
  const label = sentenceCase(specific || q.subType || q.topics[0] || 'Interview question');
  return label.length > 40 ? `${label.slice(0, 39).trimEnd()}…` : label;
}

/** The SwipeLearn link that turns this question into quick-read cards. */
export function swipeLearnHref(q: ReviewQuestion): string {
  const focus =
    q.questionText.length > 300 ? `${q.questionText.slice(0, 299).trimEnd()}…` : q.questionText;
  const params = new URLSearchParams({
    from: 'question',
    qid: String(q.id),
    label: swipeLabel(q),
    focus,
  });
  return `/swipe-learn?${params.toString()}`;
}
