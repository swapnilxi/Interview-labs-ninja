/**
 * SwipeLearn card prompt: request normalization + the prompt text.
 *
 * Pure (no browser or Node APIs), so it is shared by
 *   - the browser, when it calls Gemini directly with a key kept in this browser (geminiService.ts), and
 *   - fe-apis/swipeLearn (nextjs-api mode), which runs the model chosen in Config on the server.
 * Twin: backend/modules/swipe_learn/prompt.py (FastAPI mode). The normalization rules and every prompt string must
 * stay byte-identical across the pair, so change both. Randomness (the angles and the seed) is picked by the caller
 * and sent in the request, which keeps both builders deterministic and comparable.
 */

export type CardFormat =
  | 'quick-concept'
  | 'code-example'
  | 'interview-question'
  | 'quiz'
  | 'advanced-concept'
  | 'recent-dev'
  | 'random';

export type CardDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'any';

export interface CardTopicRef {
  id: string;
  label: string;
}

export interface CardAboutRef {
  title: string;
  hook: string;
  content: string;
  code: string;
  /** howItWorks, architecture, example, commonMistakes, interviewQuestion: non-empty ones only, in that order. */
  depth: string[];
}

export interface CardPromptRequest {
  topic: CardTopicRef;
  mixedTopics: CardTopicRef[];
  subCategories: CardTopicRef[];
  subCategory: CardTopicRef | null;
  format: CardFormat;
  count: number;
  focus: string;
  difficulty: CardDifficulty;
  aboutCard: CardAboutRef | null;
  avoidTitles: string[];
  angles: string[];
  seed: number | null;
}

/** A request the server can't use (answered with a 422). */
export class CardRequestError extends Error {}

export const MAX_CARD_COUNT = 10;
export const DEFAULT_CARD_COUNT = 5;
/** Titles listed under "already in the deck" (newest first). */
export const MAX_AVOID_TITLES = 150;
const MAX_TOPIC_REFS = 20;
const MAX_ANGLES = 10;

const FORMATS: CardFormat[] = [
  'quick-concept',
  'code-example',
  'interview-question',
  'quiz',
  'advanced-concept',
  'recent-dev',
  'random',
];
const DIFFICULTIES: CardDifficulty[] = ['beginner', 'intermediate', 'advanced', 'any'];
const DEPTH_KEYS = ['howItWorks', 'architecture', 'example', 'commonMistakes', 'interviewQuestion'];

/**
 * Ways into a topic. The caller picks a few at random for each batch (one per card), so two batches on the same deck
 * start from different places instead of the same handful of famous ideas.
 */
export const CARD_ANGLES: string[] = [
  'a common misconception and what is actually true',
  'a mistake people make in real projects, and the fix',
  'a lesser-known feature or technique that saves real time',
  'how it works under the hood',
  'a performance or cost trade-off',
  'an edge case that surprises people',
  'a side-by-side comparison of two approaches and when to pick each',
  'a concrete real-world use case',
  'a debugging or troubleshooting technique',
  'a rule of thumb experts use, and why it works',
  'the history behind it: why it exists or changed',
  'a mental model that makes it click',
  'a question that comes up in interviews, answered well',
  'a best practice and the reason behind it',
  'a small worked example with real numbers',
  'a tool or library that does it well, and its limits',
];

// ── Normalization ───────────────────────────────────────────────────────────

/** Trim, then cut to `max` characters (counted in code points, like Python's slicing). */
function cut(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const chars = Array.from(value.trim());
  return chars.length <= max ? chars.join('') : chars.slice(0, max).join('').trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function topicRef(value: unknown): CardTopicRef | null {
  if (!isPlainObject(value)) return null;
  const id = cut(value.id, 60);
  if (!id) return null;
  return { id, label: cut(value.label, 80) || id };
}

function topicRefs(value: unknown): CardTopicRef[] {
  if (!Array.isArray(value)) return [];
  const out: CardTopicRef[] = [];
  for (const item of value) {
    const ref = topicRef(item);
    if (ref && !out.some((r) => r.id === ref.id)) out.push(ref);
    if (out.length >= MAX_TOPIC_REFS) break;
  }
  return out;
}

function stringList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = cut(item, maxChars);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** A JSON number (not a bool) rounded half up; anything else is null. */
function wholeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.floor(value + 0.5);
}

function aboutCard(value: unknown): CardAboutRef | null {
  if (!isPlainObject(value)) return null;
  const title = cut(value.title, 80);
  const content = cut(value.content, 400);
  if (!title || !content) return null;
  const code = isPlainObject(value.code) ? cut(value.code.code, 1200) : '';
  const rawDepth = isPlainObject(value.depth) ? value.depth : {};
  const depth = DEPTH_KEYS.map((k) => cut(rawDepth[k], 420)).filter(Boolean);
  return { title, hook: cut(value.hook, 120), content, code, depth };
}

/** Turns a raw request body into a clean CardPromptRequest. Throws CardRequestError when there is no topic. */
export function normalizeCardRequest(raw: unknown): CardPromptRequest {
  if (!isPlainObject(raw)) throw new CardRequestError('The request body must be a JSON object.');
  const topic = topicRef(raw.topic);
  if (!topic) throw new CardRequestError('topic: an object with an id is required.');
  const format = FORMATS.includes(raw.format as CardFormat) ? (raw.format as CardFormat) : 'random';
  const count = wholeNumber(raw.count);
  const seed = wholeNumber(raw.seed);
  return {
    topic,
    mixedTopics: topicRefs(raw.mixedTopics),
    subCategories: topicRefs(raw.subCategories),
    subCategory: topicRef(raw.subCategory),
    format,
    count: count === null ? DEFAULT_CARD_COUNT : Math.min(Math.max(count, 1), MAX_CARD_COUNT),
    focus: cut(raw.focus, 300),
    difficulty: DIFFICULTIES.includes(raw.difficulty as CardDifficulty) ? (raw.difficulty as CardDifficulty) : 'any',
    aboutCard: aboutCard(raw.aboutCard),
    avoidTitles: stringList(raw.avoidTitles, MAX_AVOID_TITLES, 80),
    angles: stringList(raw.angles, MAX_ANGLES, 120),
    seed: seed !== null && seed >= 0 && seed <= 999999 ? seed : null,
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

const FORMAT_INSTRUCTIONS: Record<CardFormat, string> = {
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

export function buildCardPrompt(req: CardPromptRequest): string {
  const lines: string[] = [
    'You write cards for SwipeLearn, a mobile micro-learning feed: each card teaches one specific, accurate, useful idea in under 30 seconds of reading.',
    '',
  ];

  if (req.topic.id === 'mixed' && req.mixedTopics.length) {
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
    lines.push(`Sub-category: ${req.subCategory.label} (set every card's "subCategory" to "${req.subCategory.id}")`);
  } else if (req.subCategories.length) {
    lines.push(
      `Sub-categories: set each card's "subCategory" to one of ${req.subCategories.map((s) => `"${s.id}"`).join(', ')}.`
    );
  }
  if (req.focus) lines.push(`Focus: ${req.focus}`);
  lines.push(
    `Difficulty: ${
      req.format === 'advanced-concept'
        ? 'advanced'
        : req.difficulty !== 'any'
          ? req.difficulty
          : 'a mix of beginner, intermediate and advanced'
    }`
  );
  lines.push(`Number of cards: exactly ${req.count}`);
  if (req.seed !== null) lines.push(`Variation seed: ${req.seed}`);
  lines.push('');

  if (req.aboutCard) {
    const c = req.aboutCard;
    lines.push(
      'The learner just read the card below. Write quiz cards (type "quiz") that check they understood it: test application and reasoning, not word-for-word recall, and never ask something the card does not support.',
      `Card title: ${c.title}`,
      `Card text: ${[c.hook, c.content].filter(Boolean).join(' ')}`
    );
    if (c.code) lines.push(`Card code:\n${c.code}`);
    if (c.depth.length) lines.push(`Card details: ${c.depth.join(' ')}`);
  } else {
    lines.push(`Card style: ${FORMAT_INSTRUCTIONS[req.format]}`);
    if (req.angles.length) {
      lines.push(`Angles: give each card a different one of these starting points: ${req.angles.join('; ')}.`);
    }
  }

  if (req.avoidTitles.length) {
    lines.push(
      '',
      'Already in the deck. Each new card must teach a different idea from all of these; a reworded or slightly varied version of one counts as a repeat:',
      ...req.avoidTitles.map((t) => `- ${t}`)
    );
  }

  lines.push(
    '',
    'Rules:',
    '- Be correct. No invented statistics, versions, APIs or quotes; if unsure about an idea, pick another.',
    '- Prefer specific, useful ideas the learner is unlikely to have seen yet over the examples every tutorial starts with.',
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
