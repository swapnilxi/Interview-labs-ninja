'use client';

/**
 * SwipeLearn card generation: one AI call returns a batch of cards.
 *
 * Which AI writes them (resolveCardAi):
 *   1. SwipeLearn's own Gemini key (its Settings sheet), when set: the browser calls Gemini directly.
 *   2. Logged in: the server runs the model chosen on the Config page (any provider, or the server's .env default),
 *      through POST /swipe-learn/generate (FastAPI backend/modules/swipe_learn, or fe-apis/swipeLearn).
 *   3. Guest with a Gemini key saved on the Config page: the browser calls Gemini directly.
 *   Otherwise there is no AI to use and the UI asks for a key (or a login).
 * Keys stay in this browser's localStorage either way; the server path only uses them for that one call.
 *
 * Both paths share the prompt (cardPrompt.ts, twin of backend/modules/swipe_learn/prompt.py) and this file's parser.
 * Each batch gets random "angles" and a seed so two batches start from different places, the deck's titles go in as
 * "already covered", and near-duplicates the model still sends are dropped and topped up with another round.
 *
 * There is no offline "fallback" card: a failed call throws a SwipeGenerateError the UI can explain (no key,
 * bad key, quota, network). The old template filler cards looked real but taught nothing.
 */

import { isLoggedIn } from '@/lib/auth/tokenStore';
import { fetchMemoryLines } from '@/lib/services/memoryService';
import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import {
  USE_ENV_DEFAULT_MODEL,
  defaultAIRequestFields,
  isMissingKeyError,
  settingsService,
} from '@/lib/services/settingsService';
import type {
  CardContentType,
  CardDepth,
  ContentCard,
  DifficultyLevel,
  GenerateFormat,
} from '../types';
import {
  CARD_ANGLES,
  MAX_AVOID_TITLES,
  buildCardPrompt,
  normalizeCardRequest,
  type CardPromptRequest,
} from './cardPrompt';

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

/**
 * Where the cards come from: 'swipelearn' = SwipeLearn's own Gemini key, 'config' = the Gemini key saved on the
 * Config page (guests), 'server' = the model chosen in Config, run by our server (logged in), 'none' = no AI yet.
 */
export type GeminiKeySource = 'swipelearn' | 'config' | 'server' | 'none';

export interface ResolvedGemini {
  /** The Gemini key the browser will use ('' on the server path). */
  apiKey: string;
  source: GeminiKeySource;
  /** The Gemini model (direct paths) or the Config model id ('' = the server's .env default). */
  model: string;
  /** How to show the model, e.g. "Gemini · gemini-flash-latest" or "gpt-4o-mini · from Config". */
  label: string;
}

/** The model chosen on the Config page, as shown to people ('' = the server's .env default). */
export function configModelLabel(model: string): string {
  if (model === USE_ENV_DEFAULT_MODEL) return 'Server default model';
  if (model === 'custom') {
    let custom = '';
    try {
      custom = (JSON.parse(window.localStorage.getItem('labninja.ai-settings.v1') || '{}').customModel || '').trim();
    } catch {
      custom = '';
    }
    return custom || 'Custom endpoint';
  }
  if (model === 'ollama') return 'Ollama';
  if (model.startsWith('ollama::')) return `Ollama · ${model.slice('ollama::'.length)}`;
  return model;
}

/** Which AI a generate call will use right now (see the file comment for the order). */
export function resolveGemini(): ResolvedGemini {
  const own = getStoredGeminiKey();
  let configModel = '';
  try {
    configModel = defaultAIRequestFields().model || '';
  } catch {
    configModel = '';
  }

  let geminiModel = getStoredGeminiModel();
  if (!geminiModel) {
    // Config's main model, when it is a Gemini one, so the whole app talks to the same model.
    geminiModel =
      configModel.startsWith('gemini') && !RETIRED_MODEL.test(configModel) ? configModel : DEFAULT_GEMINI_MODEL;
  }

  if (own) return { apiKey: own, source: 'swipelearn', model: geminiModel, label: `Gemini · ${geminiModel}` };
  if (isLoggedIn()) {
    return {
      apiKey: '',
      source: 'server',
      model: configModel,
      label: `${configModelLabel(configModel)} · from Config`,
    };
  }
  const fromConfig = getConfigGeminiKey();
  if (fromConfig) {
    return { apiKey: fromConfig, source: 'config', model: geminiModel, label: `Gemini · ${geminiModel} · key from Config` };
  }
  return { apiKey: '', source: 'none', model: geminiModel, label: '' };
}

export function hasGeminiKey(): boolean {
  return resolveGemini().source !== 'none';
}

/** Logged in: pulls the model choice saved to the account, so a new browser follows Config too. */
export async function refreshConfigFromAccount(): Promise<void> {
  try {
    await settingsService.getSettings();
  } catch {
    /* offline: local settings stay as they are */
  }
}

// ── Errors ──────────────────────────────────────────────────────────────────

export type GenerateErrorKind =
  | 'no-key'
  /** The server found no key for the Config model: the fix is on the Config page. */
  | 'no-config-key'
  | 'auth'
  | 'quota'
  | 'model'
  | 'network'
  | 'bad-output'
  | 'api';

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

/** Errors whose fix is on the Config page (no key there for the chosen model). */
export function isConfigFixable(error: unknown): boolean {
  return error instanceof SwipeGenerateError && error.kind === 'no-config-key';
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

// ── Request ─────────────────────────────────────────────────────────────────

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
  /** Titles already in the deck, newest first, so the batch doesn't repeat them. */
  avoidTitles: string[];
}

export const MAX_GENERATE_COUNT = 10;

/** `n` different angles, picked at random for this batch. */
function pickAngles(n: number): string[] {
  const pool = [...CARD_ANGLES];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(Math.max(n, 1), pool.length));
}

/** The wire/prompt request for one round. */
function promptRequest(
  req: GenerateCardsRequest,
  count: number,
  avoid: string[],
  memory: string[] = []
): CardPromptRequest {
  return normalizeCardRequest({
    memory,
    topic: req.topic,
    mixedTopics: req.mixedTopics,
    subCategories: req.subCategories,
    subCategory: req.subCategory,
    format: req.aboutCard ? 'quiz' : req.format,
    count,
    focus: req.focus,
    difficulty: req.difficulty,
    aboutCard: req.aboutCard,
    avoidTitles: avoid.slice(0, MAX_AVOID_TITLES),
    angles: req.aboutCard ? [] : pickAngles(count),
    seed: Math.floor(Math.random() * 1_000_000),
  });
}

// ── Near-duplicates ─────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  'a an the of in on for to and or with vs versus is are be how what why when which your you it its using use from by at as into this that do does not no about'.split(
    ' '
  )
);

/** The meaningful words of a title (lowercase, light plural folding). */
function titleWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return new Set(words);
}

/** True when two titles name the same idea: mostly the same words, or one's words almost all inside the other's. */
function sameIdea(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let shared = 0;
  a.forEach((w) => {
    if (b.has(w)) shared += 1;
  });
  const smaller = Math.min(a.size, b.size);
  const union = a.size + b.size - shared;
  return shared / union >= 0.6 || (smaller >= 2 && shared / smaller >= 0.8);
}

class TitleIndex {
  private exact = new Set<string>();
  private words: Set<string>[] = [];

  /** `fuzzy` off: only identical titles count (quiz cards about one card naturally share its words). */
  constructor(titles: string[], private readonly fuzzy = true) {
    titles.forEach((t) => this.add(t));
  }

  add(title: string): void {
    this.exact.add(title.trim().toLowerCase());
    this.words.push(titleWords(title));
  }

  has(title: string): boolean {
    if (this.exact.has(title.trim().toLowerCase())) return true;
    if (!this.fuzzy) return false;
    const w = titleWords(title);
    return this.words.some((other) => sameIdea(w, other));
  }
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
  model: string,
  sourceUrls: string[] = []
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
    // Only a page the research tool actually fetched counts as a source (the model can't invent one).
    sourceUrl: typeof raw.source === 'string' && sourceUrls.includes(raw.source.trim()) ? raw.source.trim() : undefined,
    createdAt,
  };
}

/** Every usable card in the model's answer (ids are assigned once the batch is complete). */
function parseCards(text: string, req: GenerateCardsRequest, model: string, sourceUrls: string[] = []): ContentCard[] {
  const parsed = extractJson(text) as any;
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cards)
      ? parsed.cards
      : parsed && typeof parsed === 'object'
        ? [parsed]
        : [];
  const createdAt = new Date().toISOString();
  const cards: ContentCard[] = [];
  list.forEach((raw) => {
    const card = normalizeCard(raw, req, cards.length, 'tmp', createdAt, model, sourceUrls);
    if (card) cards.push(card);
  });
  return cards;
}

// ── The server path (the model chosen in Config) ───────────────────────────

/** 5 minutes: a slow model writing ten cards can take a while (the server allows up to 240s for the AI call). */
const SERVER_TIMEOUT_MS = 5 * 60_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return signal;
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

async function callServer(
  promptReq: CardPromptRequest,
  signal?: AbortSignal
): Promise<{ text: string; model: string; sources: string[] }> {
  let res: Response;
  try {
    res = await apiFetch('/swipe-learn/generate', {
      method: 'POST',
      body: JSON.stringify({ ...promptReq, ...defaultAIRequestFields() }),
      signal: withTimeout(signal, SERVER_TIMEOUT_MS),
    });
  } catch (error) {
    // The caller's Stop button: pass the AbortError through. Our own timeout: say so.
    if (signal?.aborted) throw error;
    if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') {
      throw new SwipeGenerateError('The AI took too long to answer. Try fewer cards or a faster model.', 'api');
    }
    throw new SwipeGenerateError('Could not reach the server. Check your connection and try again.', 'network');
  }
  if (!res.ok) {
    const detail = await parseApiError(res);
    if (res.status === 401) throw new SwipeGenerateError('Your login expired. Log in again to generate cards.', 'api');
    if (isMissingKeyError(detail)) {
      throw new SwipeGenerateError(
        'No AI key is set up for your Config model. Add one in Config to generate cards.',
        'no-config-key'
      );
    }
    if (/\b429\b|rate limit|quota/i.test(detail)) {
      throw new SwipeGenerateError(`The AI provider's rate limit or quota was reached. Wait a minute and try again. (${detail})`, 'quota');
    }
    throw new SwipeGenerateError(detail, 'api');
  }
  const data = await res.json().catch(() => null);
  const text = typeof data?.text === 'string' ? data.text : '';
  if (!text.trim()) throw new SwipeGenerateError('The AI returned an empty answer. Try again.', 'bad-output');
  const sources: string[] = Array.isArray(data?.sources)
    ? data.sources.map((s: { url?: unknown }) => (typeof s?.url === 'string' ? s.url : '')).filter(Boolean)
    : [];
  return { text, model: typeof data?.model === 'string' && data.model ? data.model : 'config-model', sources };
}

// ── Public entry point ─────────────────────────────────────────────────────

/** Extra rounds, after the first, to replace cards dropped as repeats or to retry a busy / unparseable answer. */
const MAX_EXTRA_ROUNDS = 2;

/**
 * Generates `req.count` cards (1-10). Cards that repeat one already in the deck (or each other) are dropped and
 * replaced in up to two more rounds; a busy or unparseable answer is retried the same way. Returns what it has when a
 * later round fails. Throws SwipeGenerateError (or an AbortError when `signal` fires).
 */
export async function generateCards(
  req: GenerateCardsRequest,
  signal?: AbortSignal
): Promise<ContentCard[]> {
  const ai = resolveGemini();
  if (ai.source === 'none') {
    throw new SwipeGenerateError('Add an AI key to generate cards.', 'no-key');
  }
  const count = Math.min(Math.max(Math.round(req.count) || 1, 1), MAX_GENERATE_COUNT);
  const known = new TitleIndex(req.avoidTitles, !req.aboutCard);
  const cards: ContentCard[] = [];
  const repeats: string[] = [];
  let lastError: unknown = null;
  // The server path adds the shared AI memory itself; a direct-to-Gemini call has to bring it along.
  const memory = ai.source === 'server' ? [] : await fetchMemoryLines('swipe-learn', req.topic.id);

  for (let round = 0; round <= MAX_EXTRA_ROUNDS && cards.length < count; round += 1) {
    const want = count - cards.length;
    // Newest first: this batch, then the repeats we just dropped, then the deck.
    const avoid = [...cards.map((c) => c.title), ...repeats, ...req.avoidTitles];
    const promptReq = promptRequest(req, want, avoid, memory);
    try {
      let text: string;
      let model: string;
      let sourceUrls: string[] = [];
      if (ai.source === 'server') {
        ({ text, model, sources: sourceUrls } = await callServer(promptReq, signal));
      } else {
        text = await callGemini(ai.apiKey, ai.model, buildCardPrompt(promptReq), signal);
        model = ai.model;
      }
      const parsed = parseCards(text, req, model, sourceUrls);
      if (!parsed.length) {
        lastError = new SwipeGenerateError("The AI's answer had no usable cards. Try again.", 'bad-output');
        continue;
      }
      parsed.forEach((card) => {
        if (cards.length >= count) return;
        if (known.has(card.title)) {
          repeats.push(card.title);
          return;
        }
        known.add(card.title);
        cards.push(card);
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      lastError = error;
      const retryable =
        error instanceof SwipeGenerateError &&
        (error.kind === 'bad-output' || /busy|took too long/.test(error.message));
      if (!retryable || cards.length) break;
    }
  }

  if (!cards.length) {
    if (repeats.length) {
      throw new SwipeGenerateError(
        'The AI only came up with cards you already have. Try a focus or another card type.',
        'bad-output'
      );
    }
    throw lastError ?? new SwipeGenerateError('Generation failed. Try again.', 'api');
  }

  // One batch: shared id prefix and timestamp, zero-padded index (IndexedDB returns rows by id, so a batch reloads in
  // the order it was written).
  const batchId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  return cards.map((card, i) => ({
    ...card,
    id: `gen-${batchId}-${String(i).padStart(2, '0')}`,
    generatedAt: createdAt,
    createdAt,
  }));
}
