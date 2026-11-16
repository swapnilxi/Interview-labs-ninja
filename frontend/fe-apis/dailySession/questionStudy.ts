/**
 * fe-apis/dailySession/questionStudy.ts
 *
 * Twin of backend/modules/daily_session/question_study.py: prompts and normalisation for per-question study content
 * (Question Review). Three kinds, generated on demand and kept per user (question_study table):
 *   quick      Quick review: digestible notes for reading on the move or when short on time.
 *   breakdown  Breakdown: the question cut into small reading lessons, one idea each, to learn gradually.
 *   deep       Dive deep: further sections for the curious; one section at a time can be extended a level deeper.
 *
 * Numbers are never taken from the model: `read_minutes` is computed from the word count here, and `depth` / `done`
 * are set by the server. The prompts are copied verbatim and must stay byte-identical, and the normalisation must
 * match: change both sides together. Imports only ./tutorMemory (import-free), so it compiles on its own.
 */

import { memoryBlock } from './tutorMemory';

export const STUDY_KINDS = ['quick', 'breakdown', 'deep'] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];
export const STUDY_LABELS: Record<StudyKind, string> = { quick: 'quick review', breakdown: 'breakdown', deep: 'deep dive' };
export const STUDY_MAX_TOKENS: Record<StudyKind, number> = { quick: 1500, breakdown: 3500, deep: 4500 };
export const EXPAND_MAX_TOKENS = 1500;

export const MAX_KEY_POINTS = 6;
export const MAX_PITFALLS = 4;
export const MAX_CHUNKS = 8;
export const MAX_SECTIONS = 7;
export const MAX_FURTHER = 5;
export const MAX_DEPTH = 3;
const WORDS_PER_MINUTE = 200;

const QUESTION_CHARS = 3000;
const ANSWER_CHARS = 4000;
const SECTION_BODY_CHARS = 6000;

const CATEGORY_LABELS: Record<string, string> = {
  interview: 'Interview (technical or behavioural)',
  cv_skill: 'Computer Vision / ML',
};

const WRAPPING_FENCE = /^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/i;

/** Python's s[:n] / s[-n:] on code points. */
function head(s: string, n: number): string {
  return s.length <= n ? s : Array.from(s).slice(0, n).join('');
}
function tail(s: string, n: number): string {
  return s.length <= n ? s : Array.from(s).slice(-n).join('');
}

// ── Prompts ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface StudyQuestion {
  questionText: string;
  category: string;
  subType: string;
  topics: string[];
  difficulty: string;
}

function questionBlock(q: StudyQuestion): string {
  const details: string[] = [];
  const label = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, q.category)
    ? CATEGORY_LABELS[q.category]
    : q.category.trim();
  if (label) details.push(`Category: ${label}`);
  if (q.subType.trim()) details.push(`Question type: ${q.subType.trim()}`);
  const topicList = q.topics.filter((t) => t && t.trim()).map((t) => t.trim());
  if (topicList.length) details.push('Topics: ' + topicList.join(', '));
  if (q.difficulty.trim()) details.push(`Difficulty: ${q.difficulty.trim()}`);
  const detailBlock = details.length ? '\n' + details.join('\n') : '';
  const question = head(q.questionText.trim(), QUESTION_CHARS);
  return `The learner is preparing to answer this interview question:\n"""\n${question}\n"""${detailBlock}`;
}

/** [role, task, gaps, style, shape] per kind -- the same strings as _TASKS in question_study.py. */
const TASKS: Record<StudyKind, [string, string, string, string, string]> = {
  quick: [
    'You are a senior interview coach writing study notes for an interview prep app. The learner reads them on a ' +
      'phone, often while travelling or short on time.',
    'Write a QUICK REVIEW of what someone needs to know to answer this question well: the core idea in plain ' +
      'words, the handful of points a strong answer covers, the one thing to remember, and the mistakes people make.',
    " Lean on the gaps in the learner's answer: make sure the key points and pitfalls cover what it gets wrong or " +
      'leaves out, without quoting it or mentioning that the learner wrote it.',
    'Style: plain, concrete, short sentences that read well on a phone. No filler, no greetings, no "in this ' +
      'review". Use the exact terms of the field and explain each one the first time. Plain text in every field: ' +
      'no markdown, no bullets inside the strings.',
    '{"title": "a short title, at most 8 words", "summary": "2-4 sentences: the core idea", "key_points": ' +
      '["3-6 points, one sentence each"], "remember": "one sentence to remember", "pitfalls": ["1-4 common ' +
      'mistakes, one sentence each"]}',
  ],
  breakdown: [
    'You are a senior interview coach writing a short reading course for an interview prep app. The learner reads ' +
      'one small lesson at a time on a phone, learning the topic gradually.',
    'Break what someone needs to know to answer this question well into 3-8 small lessons ("chunks"), ordered ' +
      'from the basics to applying them to this exact question. One idea per chunk. Each body is 80-160 words of ' +
      'markdown (short paragraphs, "- " bullets and **bold** key terms are fine; no headings, no tables). Each chunk ' +
      'has one self-check question ("check") the learner can answer in their head.',
    " Lean on the gaps in the learner's answer: give extra room to what it gets wrong or leaves out, without " +
      'quoting it or mentioning that the learner wrote it.',
    'Style: plain, concrete, phone-readable sentences. No filler, no greetings, no "in this lesson". Explain each ' +
      'term the first time it appears. Inside the JSON strings, write line breaks as \\n.',
    '{"chunks": [{"title": "short title", "body": "markdown, 80-160 words", "check": "one self-check question"}]}',
  ],
  deep: [
    'You are a senior engineer writing a deep dive for a curious learner in an interview prep app. It goes well ' +
      'past what the interview itself needs.',
    'Write a DEEP DIVE on the ideas behind this question in 3-7 sections, each building on the last: how it really ' +
      'works underneath, why it was designed that way, the trade-offs and where they break at scale or in ' +
      'production, related ideas and current practice, and what senior people know that juniors miss. Each body is ' +
      '120-250 words of markdown (short paragraphs, "- " bullets, **bold** key terms and `inline code` are fine; no ' +
      'headings, no tables). Then list up to 5 follow-up topics worth reading next ("further").',
    " Where it helps, go past what the learner's answer covers, without quoting it or mentioning that the learner " +
      'wrote it.',
    'Style: plain, concrete sentences. No filler, no greetings. Be accurate, and say so when something is debated ' +
      'or depends on the system. Inside the JSON strings, write line breaks as \\n.',
    '{"sections": [{"heading": "short heading", "body": "markdown, 120-250 words"}], "further": ["a follow-up ' +
      'topic"]}',
  ],
};

/** `memory`: memoryLines() for this user and the question's sub_type (tutorMemory.ts); empty = left out. */
export function buildStudyPrompt(kind: StudyKind, q: StudyQuestion, answer: string, memory: string[] = []): string {
  const [role, task, gapsText, style, shape] = TASKS[kind];
  let context = questionBlock(q);
  const written = head(answer.trim(), ANSWER_CHARS);
  let gaps = gapsText;
  if (written) context += `\n\nThe learner has written this answer to the interview question:\n"""\n${written}\n"""`;
  else gaps = '';
  return `${role}

${context}

${task}${gaps}${memoryBlock(memory, kind)}

${style}

Respond with ONLY a JSON object, no text outside it, shaped exactly:
${shape}`;
}

export function buildExpandPrompt(
  q: StudyQuestion,
  headings: string[],
  section: number,
  body: string,
  nextDepth: number
): string {
  const context = questionBlock(q);
  const outline = headings.map((h, i) => `${i + 1}. ${h}`).join('\n');
  const current = tail(body.trim(), SECTION_BODY_CHARS);
  return `You are a senior engineer extending a deep dive for a curious learner in an interview prep app.

${context}

The deep dive has these sections:
${outline}

Extend section ${section + 1}, "${headings[section]}". What it says so far:
"""
${current}
"""

Write the next, deeper layer of this section (level ${nextDepth} of ${MAX_DEPTH}): go one level further underneath, with the mechanism, a concrete worked example or small numbers, edge cases, and what changes at scale or in production. Do not repeat what it already says, do not restate the heading, and stay on this section's subject. 100-200 words of markdown (short paragraphs, "- " bullets, **bold** key terms and \`inline code\` are fine; no headings, no tables).

Style: plain, concrete sentences. No filler, no preamble.

Respond with ONLY the markdown of the new layer, no text before or after it.`;
}

// ── Normalising the model's reply (never trust its shape or its numbers) ────────────────────────────────────

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function texts(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && !!v.trim())
    .map((v) => v.trim())
    .slice(0, cap);
}

function items(value: unknown): Dict[] {
  return Array.isArray(value) ? value.filter(isDict) : [];
}

/** ceil(words / 200), at least 1, over everything the quick review shows. */
export function readMinutes(summary: string, keyPoints: string[], remember: string, pitfalls: string[]): number {
  const words = [summary, ...keyPoints, remember, ...pitfalls].join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** The stored content for `kind` (without `kind` / `updated_at`), or null when nothing usable came back. */
export function normalizeStudy(kind: StudyKind, raw: unknown): Dict | null {
  if (!isDict(raw)) return null;
  if (kind === 'quick') {
    const summary = text(raw.summary);
    const keyPoints = texts(raw.key_points, MAX_KEY_POINTS);
    if (!summary && !keyPoints.length) return null;
    const remember = text(raw.remember);
    const pitfalls = texts(raw.pitfalls, MAX_PITFALLS);
    return {
      title: text(raw.title),
      read_minutes: readMinutes(summary, keyPoints, remember, pitfalls),
      summary,
      key_points: keyPoints,
      remember,
      pitfalls,
    };
  }
  if (kind === 'breakdown') {
    const chunks: Dict[] = [];
    for (const c of items(raw.chunks)) {
      const title = text(c.title);
      const body = text(c.body);
      if (title && body) chunks.push({ title, body, check: text(c.check) });
    }
    return chunks.length ? { chunks: chunks.slice(0, MAX_CHUNKS), done: [] } : null;
  }
  if (kind === 'deep') {
    const sections: Dict[] = [];
    for (const s of items(raw.sections)) {
      const heading = text(s.heading);
      const body = text(s.body);
      if (heading && body) sections.push({ heading, body, depth: 1 });
    }
    if (!sections.length) return null;
    return { sections: sections.slice(0, MAX_SECTIONS), further: texts(raw.further, MAX_FURTHER) };
  }
  return null;
}

const RAW_IN_STRING: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/**
 * The JSON object in the reply: from the first '{' to the last '}' (fences and chatter around it are ignored).
 * Markdown bodies tempt models into raw line breaks inside JSON strings, which strict JSON rejects, so those are
 * escaped first. Not the shared extractJsonObject: it drops every backtick, `inline code` too (Python's doesn't).
 */
export function parseStudyReply(value: string): unknown {
  const t = value ?? '';
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('No JSON object found in response');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let ch of t.slice(start, end + 1)) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (Object.prototype.hasOwnProperty.call(RAW_IN_STRING, ch)) ch = RAW_IN_STRING[ch];
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return JSON.parse(out);
}

/** Models sometimes wrap the whole reply in a ```markdown fence despite being told not to. */
export function cleanLayer(value: string): string {
  const t = (value ?? '').trim();
  const m = WRAPPING_FENCE.exec(t);
  return (m ? m[1] : t).trim();
}

/** A JSON whole number as an integer; anything else is null (twin of as_index). */
export function asIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
