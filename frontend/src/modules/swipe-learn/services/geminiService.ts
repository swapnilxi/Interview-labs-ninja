'use client';

/**
 * SwipeLearn card generation: one Gemini call from the browser returns a batch of cards.
 *
 * Which key: SwipeLearn's own key (its Settings sheet) wins; otherwise the Gemini key saved on the Config page
 * is used, so someone who set Gemini up once for the app does not paste it again. Either way the key stays in
 * this browser's localStorage and goes straight to Google; nothing passes through our backend, which is why
 * guests can generate too.
 *
 * There is no offline "fallback" card: a failed call throws a SwipeGenerateError the UI can explain (no key,
 * bad key, quota, network). The old template filler cards looked real but taught nothing.
 */

import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type {
  CardContentType,
  CardDepth,
  ContentCard,
  DifficultyLevel,
  GenerateFormat,
} from '../types';

const KEY_STORAGE = 'swipelearn_gemini_api_key_v1';
const MODEL_STORAGE = 'swipelearn_gemini_model_v1';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

export const GEMINI_MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'gemini-flash-latest', label: 'Flash, latest (recommended)' },
  { id: 'gemini-2.5-flash', label: 'Flash 2.5' },
  { id: 'gemini-2.5-flash-lite', label: 'Flash-Lite 2.5 (cheapest)' },
  { id: 'gemini-pro-latest', label: 'Pro, latest (slower, deeper)' },
  { id: 'gemini-2.5-pro', label: 'Pro 2.5' },
];

/** Models Google has shut down; a browser that saved one of them gets the default instead of a 404. */
const RETIRED_MODEL = /^gemini-(1\.|2\.0|pro$|pro-vision)/;

// ── Stored settings ─────────────────────────────────────────────────────────

function readLocal(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the setting just doesn't stick */
  }
}

/** SwipeLearn's own key ('' when none). */
export function getStoredGeminiKey(): string {
  return readLocal(KEY_STORAGE).trim();
}

export function saveStoredGeminiKey(key: string): void {
  writeLocal(KEY_STORAGE, key.trim() || null);
}

export function clearStoredGeminiKey(): void {
  writeLocal(KEY_STORAGE, null);
}

/** The Gemini key saved on the Config page ('' when none). */
export function getConfigGeminiKey(): string {
  try {
    return (defaultAIRequestFields().geminiKey || '').trim();
  } catch {
    return '';
  }
}

/** SwipeLearn's explicitly chosen model ('' = not chosen, follow Config / the default). */
export function getStoredGeminiModel(): string {
  const model = readLocal(MODEL_STORAGE).trim();
  return model && !RETIRED_MODEL.test(model) ? model : '';
}

export function saveStoredGeminiModel(model: string): void {
  writeLocal(MODEL_STORAGE, model.trim() || null);
}

export type GeminiKeySource = 'swipelearn' | 'config' | 'none';

export interface ResolvedGemini {
  apiKey: string;
  source: GeminiKeySource;
  model: string;
}

/** The key and model a generate call will use right now. */
export function resolveGemini(): ResolvedGemini {
  const own = getStoredGeminiKey();
  const fromConfig = own ? '' : getConfigGeminiKey();
  let model = getStoredGeminiModel();
  if (!model) {
    // Config's main model, when it is a Gemini one, so the whole app talks to the same model.
    let configModel = '';
    try {
      configModel = defaultAIRequestFields().model || '';
    } catch {
      configModel = '';
    }
    model =
      configModel.startsWith('gemini') && !RETIRED_MODEL.test(configModel)
        ? configModel
        : DEFAULT_GEMINI_MODEL;
  }
  return {
    apiKey: own || fromConfig,
    source: own ? 'swipelearn' : fromConfig ? 'config' : 'none',
    model,
  };
}

export function hasGeminiKey(): boolean {
  return resolveGemini().source !== 'none';
}

// ── Errors ──────────────────────────────────────────────────────────────────

export type GenerateErrorKind =
  'no-key' | 'auth' | 'quota' | 'model' | 'network' | 'bad-output' | 'api';

export class SwipeGenerateError extends Error {
  readonly kind: GenerateErrorKind;

  constructor(message: string, kind: GenerateErrorKind) {
    super(message);
    this.name = 'SwipeGenerateError';
    this.kind = kind;
  }
}

/** Errors whose fix is in the Settings sheet (the UI offers a button for it). */
export function isSettingsFixable(error: unknown): boolean {
  return error instanceof SwipeGenerateError && ['no-key', 'auth', 'model'].includes(error.kind);
}

// ── The Gemini call ─────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: 0.9,
  };
  // 2.5 Flash spends hidden "thinking" tokens by default, which made short cards slow (and, with the old
  // 800-token cap, cut the JSON off mid-card). These cards don't need it; Flash accepts a budget of 0.
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  let res: Response;
  try {
    res = await fetch(geminiUrl(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new SwipeGenerateError(
      'Could not reach Gemini. Check your connection and try again.',
      'network'
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail: string = body?.error?.message || res.statusText || 'request failed';
    if (
      res.status === 401 ||
      res.status === 403 ||
      (res.status === 400 && /api key/i.test(detail))
    ) {
      throw new SwipeGenerateError('Gemini rejected the API key. Check it in Settings.', 'auth');
    }
    if (res.status === 429) {
      throw new SwipeGenerateError(
        'Gemini rate limit or free-tier quota reached. Wait a minute, or pick a lighter model in Settings.',
        'quota'
      );
    }
    if (res.status === 404) {
      throw new SwipeGenerateError(
        `The model "${model}" isn't available for this key. Pick another in Settings.`,
        'model'
      );
    }
    if (res.status >= 500) {
      throw new SwipeGenerateError(
        `Gemini is busy right now (HTTP ${res.status}). Try again in a moment.`,
        'api'
      );
    }
    throw new SwipeGenerateError(`Gemini error: ${detail}`, 'api');
  }

  const data = await res.json().catch(() => null);
  const candidate = data?.candidates?.[0];
  const text = ((candidate?.content?.parts ?? []) as GeminiPart[])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) {
    const reason = data?.promptFeedback?.blockReason || candidate?.finishReason;
    throw new SwipeGenerateError(
      reason && reason !== 'STOP'
        ? `Gemini returned no cards (${String(reason).toLowerCase()}). Try a different focus.`
        : 'Gemini returned an empty answer. Try again.',
      'bad-output'
    );
  }
  return text;
}

export async function testGeminiConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey.trim()) return { success: false, error: 'Enter an API key first.' };
  try {
    const res = await fetch(geminiUrl(model, apiKey.trim()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0 },
      }),
    });
    if (res.ok) return { success: true };
    const body = await res.json().catch(() => null);
    return { success: false, error: body?.error?.message || `HTTP ${res.status}` };
  } catch (error) {
    return { success: false, error: (error as Error)?.message || 'Network error reaching Gemini.' };
  }
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export interface TopicRef {
  id: string;
  label: string;
}

export interface GenerateCardsRequest {
  /** The deck the cards are for. `mixed` spreads them over `mixedTopics`; `quiz` is a cross-topic quiz deck. */
  topic: TopicRef;
  mixedTopics?: TopicRef[];
  /** The topic's sub-categories (Interview Prep: System Design, DSA, ...): each card is tagged with one. */
  subCategories?: TopicRef[];
  /** The sub-category on screen: every card goes there. */
  subCategory?: TopicRef;
  format: GenerateFormat;
  count: number;
  /** Free-text "what should they cover". */
  focus?: string;
  difficulty?: DifficultyLevel | 'any';
  /** "Quiz me on this": the card the questions test. */
  aboutCard?: Pick<
    ContentCard,
    'title' | 'hook' | 'content' | 'code' | 'depth' | 'topic' | 'subCategory'
  >;
  /** Titles already in the deck, so the batch doesn't repeat them. */
  avoidTitles: string[];
}

export const MAX_GENERATE_COUNT = 10;

const FORMAT_INSTRUCTIONS: Record<GenerateFormat, string> = {
  'quick-concept':
    'Concept cards (type "concept"): one crisp idea each, with the intuition behind it and a filled-in depth section.',
  'code-example':
    'Code cards (type "code"): a short, practical, runnable snippet in the language that fits the topic (Python unless the topic implies another), plus a one-line explanation of why it works.',
  'interview-question':
    'Interview cards (type "case-study"): the title is a realistic interview question; the content is the gist of a strong answer with the key trade-off; depth.interviewQuestion is a likely follow-up.',
  quiz: 'Quiz cards (type "quiz"): the content sets the question up in one line; the quiz has 4 plausible options with exactly one correct, and the correct position varies across the batch.',
  'advanced-concept':
    'Advanced cards: internals, performance gotchas and edge cases that experienced engineers still get wrong. Difficulty is "advanced".',
  'recent-dev':
    'What\'s-new cards (type "fact"): notable releases, standards or shifts from the last two years that you are certain are real; name the year. Leave out anything you are unsure happened.',
  random:
    'A mix of card types (concept, code, quiz, tip, case-study), whichever teaches each idea best. Include at least one quiz when the batch has 3 or more cards.',
};

function buildPrompt(req: GenerateCardsRequest, count: number): string {
  const lines: string[] = [
    'You write cards for SwipeLearn, a mobile micro-learning feed: each card teaches one specific, accurate, useful idea in under 30 seconds of reading.',
    '',
  ];

  if (req.topic.id === 'mixed' && req.mixedTopics?.length) {
    lines.push(
      `Topics: spread the cards across these, and set each card's "topic" to the id: ${req.mixedTopics
        .map((t) => `${t.id} (${t.label})`)
        .join(', ')}.`
    );
  } else if (req.topic.id === 'quiz') {
    lines.push(
      'Topic: a cross-topic quiz deck. Draw on Python, computer vision, finance, AI and interview prep unless a focus is given below.'
    );
  } else {
    lines.push(`Topic: ${req.topic.label}`);
  }
  if (req.subCategory) {
    lines.push(
      `Sub-category: ${req.subCategory.label} (set every card's "subCategory" to "${req.subCategory.id}")`
    );
  } else if (req.subCategories?.length) {
    lines.push(
      `Sub-categories: set each card's "subCategory" to one of ${req.subCategories.map((s) => `"${s.id}"`).join(', ')}.`
    );
  }
  if (req.focus?.trim()) lines.push(`Focus: ${req.focus.trim().slice(0, 300)}`);
  lines.push(
    `Difficulty: ${
      req.format === 'advanced-concept'
        ? 'advanced'
        : req.difficulty && req.difficulty !== 'any'
          ? req.difficulty
          : 'a mix of beginner, intermediate and advanced'
    }`
  );
  lines.push(`Number of cards: exactly ${count}`);
  lines.push('');

  if (req.aboutCard) {
    const c = req.aboutCard;
    lines.push(
      'The learner just read the card below. Write quiz cards (type "quiz") that check they understood it: test application and reasoning, not word-for-word recall, and never ask something the card does not support.',
      `Card title: ${c.title}`,
      `Card text: ${[c.hook, c.content].filter(Boolean).join(' ')}`
    );
    if (c.code?.code) lines.push(`Card code:\n${c.code.code}`);
    const depth = c.depth
      ? Object.values(c.depth)
          .filter((v): v is string => typeof v === 'string' && !!v.trim())
          .join(' ')
      : '';
    if (depth) lines.push(`Card details: ${depth}`);
  } else {
    lines.push(`Card style: ${FORMAT_INSTRUCTIONS[req.format] || FORMAT_INSTRUCTIONS.random}`);
  }

  const avoid = req.avoidTitles.filter(Boolean).slice(0, 40);
  if (avoid.length) {
    lines.push('', `Already in the deck, so cover different ideas: ${avoid.join('; ')}`);
  }

  lines.push(
    '',
    'Rules:',
    '- Be correct. No invented statistics, versions, APIs or quotes; if unsure about an idea, pick another.',
    '- title: at most 60 characters and specific (never "Python Concept").',
    '- hook: at most 90 characters, a punchy line that makes someone stop scrolling.',
    '- content: at most 280 characters, the core insight in plain language.',
    '- code: only on code cards (at most 12 lines, idiomatic); otherwise null.',
    '- quiz: required on quiz cards, otherwise null. Exactly 4 options, one correct; correctAnswer is its 0-based index; explanation says why it is right.',
    '- depth: howItWorks, example, commonMistakes and interviewQuestion in one or two sentences each; architecture only when a flow or pipeline helps, else null.',
    '- Every card in the batch covers a different idea.',
    '',
    'Return JSON only, in this shape:',
    '{"cards":[{"title":"","hook":"","content":"","type":"concept|code|quiz|fact|tip|case-study","topic":"","subCategory":"","code":{"language":"","code":"","explanation":""},"quiz":{"question":"","options":["","","",""],"correctAnswer":0,"explanation":""},"depth":{"howItWorks":"","architecture":"","example":"","commonMistakes":"","interviewQuestion":""},"difficulty":"beginner|intermediate|advanced","estimatedReadTime":20,"tags":["",""]}]}'
  );
  return lines.join('\n');
}

// ── Parsing the answer ─────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Cuts at a word boundary with an ellipsis, so an over-long field never ends mid-word. */
function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const s = value.replace(/\s+\n/g, '\n').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

const CARD_TYPES: CardContentType[] = ['code', 'concept', 'quiz', 'fact', 'case-study', 'tip'];
const DIFFICULTIES: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

function typeForFormat(format: GenerateFormat): CardContentType {
  if (format === 'quiz') return 'quiz';
  if (format === 'code-example') return 'code';
  if (format === 'interview-question') return 'case-study';
  if (format === 'recent-dev') return 'fact';
  return 'concept';
}

function normalizeQuiz(raw: any): ContentCard['quiz'] | undefined {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.options)) return undefined;
  const options = raw.options
    .map((o: unknown) => clip(typeof o === 'string' ? o : String(o ?? ''), 160))
    .filter(Boolean)
    .slice(0, 6);
  if (options.length < 2) return undefined;
  let answer: number = -1;
  if (typeof raw.correctAnswer === 'number') answer = Math.trunc(raw.correctAnswer);
  else if (typeof raw.correctAnswer === 'string') {
    const s = raw.correctAnswer.trim();
    if (/^\d+$/.test(s)) answer = Number(s);
    else if (/^[A-Fa-f]$/.test(s)) answer = s.toUpperCase().charCodeAt(0) - 65;
    else answer = options.findIndex((o: string) => o.toLowerCase() === s.toLowerCase());
  }
  if (answer < 0 || answer >= options.length) return undefined;
  const question = clip(raw.question, 240);
  if (!question) return undefined;
  return {
    question,
    options,
    correctAnswer: answer,
    explanation: clip(raw.explanation, 400) || 'This is the correct option.',
  };
}

function normalizeDepth(raw: any): CardDepth | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const depth: CardDepth = {};
  (
    ['howItWorks', 'architecture', 'example', 'commonMistakes', 'interviewQuestion'] as const
  ).forEach((k) => {
    const v = clip(raw[k], 420);
    if (v && v.toLowerCase() !== 'null') depth[k] = v;
  });
  return Object.keys(depth).length ? depth : undefined;
}

function normalizeCard(
  raw: any,
  req: GenerateCardsRequest,
  index: number,
  batchId: string,
  createdAt: string,
  model: string
): ContentCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = clip(raw.title, 80);
  const content = clip(raw.content, 400);
  if (!title || !content) return null;

  const quiz = normalizeQuiz(raw.quiz);
  const code =
    raw.code &&
    typeof raw.code === 'object' &&
    typeof raw.code.code === 'string' &&
    raw.code.code.trim()
      ? {
          language: clip(raw.code.language, 24) || 'python',
          code: raw.code.code.replace(/\s+$/, '').split('\n').slice(0, 16).join('\n'),
          explanation: clip(raw.code.explanation, 300) || undefined,
        }
      : undefined;

  let type: CardContentType = CARD_TYPES.includes(raw.type) ? raw.type : typeForFormat(req.format);
  if (type === 'quiz' && !quiz) type = code ? 'code' : 'concept';
  if (type !== 'quiz' && quiz && (req.format === 'quiz' || req.aboutCard)) type = 'quiz';
  // A quiz card is useless without its quiz.
  if ((req.format === 'quiz' || req.aboutCard) && !quiz) return null;

  // Topic: a mixed batch names one per card (kept only when it is one we offered).
  let topic = req.aboutCard?.topic || req.topic.id;
  if (!req.aboutCard && req.topic.id === 'mixed' && req.mixedTopics?.length) {
    const offered = req.mixedTopics.find((t) => t.id === raw.topic);
    topic = offered ? offered.id : req.mixedTopics[index % req.mixedTopics.length].id;
  }

  let subCategory: string | undefined = req.subCategory?.id ?? req.aboutCard?.subCategory;
  if (!subCategory && req.subCategories?.length && typeof raw.subCategory === 'string') {
    subCategory = req.subCategories.find((s) => s.id === raw.subCategory)?.id;
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t: unknown): t is string => typeof t === 'string' && !!t.trim())
        .map((t: string) => t.trim().replace(/^#/, '').toLowerCase().slice(0, 24))
        .slice(0, 4)
    : [];
  const readTime = Number(raw.estimatedReadTime);

  return {
    // Zero-padded index: IndexedDB returns rows by id, so a batch reloads in the order it was written.
    id: `gen-${batchId}-${String(index).padStart(2, '0')}`,
    topic,
    subCategory,
    type,
    title,
    hook: clip(raw.hook, 120) || undefined,
    content,
    code,
    quiz,
    depth: normalizeDepth(raw.depth),
    difficulty:
      req.format === 'advanced-concept'
        ? 'advanced'
        : DIFFICULTIES.includes(raw.difficulty)
          ? raw.difficulty
          : req.difficulty && req.difficulty !== 'any'
            ? req.difficulty
            : 'intermediate',
    estimatedReadTime: Number.isFinite(readTime)
      ? Math.min(Math.max(Math.round(readTime), 5), 120)
      : 20,
    tags: tags.length ? tags : [req.topic.label.toLowerCase()],
    isSaved: false,
    isRead: false,
    source: 'generated',
    generatedAt: createdAt,
    model,
    generateFormat: req.aboutCard ? 'quiz' : req.format,
    createdAt,
  };
}

function parseCards(text: string, req: GenerateCardsRequest, model: string): ContentCard[] {
  const parsed = extractJson(text) as any;
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cards)
      ? parsed.cards
      : parsed && typeof parsed === 'object'
        ? [parsed]
        : [];
  const batchId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  const seen = new Set(req.avoidTitles.map((t) => t.toLowerCase()));
  const cards: ContentCard[] = [];
  list.forEach((raw) => {
    const card = normalizeCard(raw, req, cards.length, batchId, createdAt, model);
    if (!card || seen.has(card.title.toLowerCase())) return;
    seen.add(card.title.toLowerCase());
    cards.push(card);
  });
  return cards;
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Generates `req.count` cards (1-10) in one call. Retries once when Gemini is busy or its answer can't be
 * parsed. Throws SwipeGenerateError (or an AbortError when `signal` fires).
 */
export async function generateCards(
  req: GenerateCardsRequest,
  signal?: AbortSignal
): Promise<ContentCard[]> {
  const { apiKey, model, source } = resolveGemini();
  if (source === 'none') {
    throw new SwipeGenerateError('Add a Gemini API key to generate cards.', 'no-key');
  }
  const count = Math.min(Math.max(Math.round(req.count) || 1, 1), MAX_GENERATE_COUNT);
  const prompt = buildPrompt(req, count);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await callGemini(apiKey, model, prompt, signal);
      const cards = parseCards(text, req, model);
      if (cards.length) return cards.slice(0, count);
      lastError = new SwipeGenerateError(
        "Gemini's answer had no usable cards. Try again.",
        'bad-output'
      );
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof SwipeGenerateError &&
        (error.kind === 'bad-output' || /busy/.test(error.message));
      if (!retryable) throw error;
    }
  }
  throw lastError;
}
