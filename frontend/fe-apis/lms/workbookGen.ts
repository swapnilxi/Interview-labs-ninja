/**
 * fe-apis/lms/workbookGen.ts
 *
 * AI Interactive Workbooks, generation: the prompts and the cleaning of what the AI returns. Twin of
 * backend/modules/ai_lms/workbook_gen.py: the prompts must stay byte-identical and the normalizers must give the same
 * JSON for the same input (backend/tests/lms_workbooks_test.py runs both and diffs them). Change both together.
 *
 * A workbook is written in pages, never in one call: the source is split into numbered parts, the OUTLINE prompt plans
 * the chapters (each a run of consecutive parts), then one SECTION prompt per chapter writes its blocks from that
 * chapter's parts only. What the AI returns is never stored as is: the normalizers keep only the known shapes, clip
 * every text to its limit, give everything a stable id and drop what cannot be used. The content JSON's shape is
 * described at the top of workbook_gen.py.
 *
 * Every length here is in code points (Python's len()), never UTF-16 units. No imports, so the twin check can run it in
 * plain Node.
 */

type Row = Record<string, any>;

export const SCHEMA_VERSION = 1;

export const PART_MIN = 1200;
export const PART_MAX = 4000;
export const PART_TARGET_COUNT = 24;
export const OUTLINE_SOURCE_CHARS = 48_000;
export const EXCERPT_MIN = 160;
export const SECTION_SOURCE_CHARS = 24_000;

export const MAX_SECTIONS = 16;
export const MAX_BLOCKS = 16;
export const MAX_QUESTIONS = 8;

export const MAX_TOKENS = { outline: 4096, section: 8192, explain: 1024 } as const;
export const EXPLAIN_QUESTION_MAX = 500;
export const EXPLANATION_MAX = 4000;

export const BLOCK_TYPES = [
  'reading',
  'key_points',
  'reflection',
  'short_answer',
  'checklist',
  'planner',
  'habit_tracker',
  'scale',
  'action',
  'quiz',
] as const;
export const QUESTION_KINDS = ['mcq', 'true_false', 'fill_blank', 'matching', 'scenario'] as const;

// eslint-disable-next-line no-control-regex -- stripping control characters is the point (same set as workbook_gen.py)
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const WS =
  '[ \\t\\n\\v\\f\\r\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';
const TRIM = new RegExp(`^${WS}+|${WS}+$`, 'g');
const TRIM_END = new RegExp(`${WS}+$`);
const PARAGRAPH_BREAK = /\n[ \t]*(?:\n[ \t]*)+/;
const BLANK_LINES = /\n{3,}/g;
const BLANK = /_{3,}/g;
const SPACES = /[ \t]{2,}/g;

/** The AI's answer could not be used. Carries the HTTP status and text the endpoint answers with. */
export class GenerationError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────────

const cps = (value: string): string[] => Array.from(value);
const cpLength = (value: string): number => Array.from(value).length;

export const trim = (value: string): string => value.replace(TRIM, '');

/** At most `limit` characters (code points), cut at the limit and the cut end trimmed. */
function cut(value: string, limit: number): string {
  const chars = cps(value);
  if (chars.length <= limit) return value;
  return chars.slice(0, limit).join('').replace(TRIM_END, '');
}

/** A string from the AI, cleaned and clipped; anything that is not a string is ''. */
export function text(value: unknown, limit: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let cleaned: string;
  if (multiline) {
    cleaned = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(BLANK_LINES, '\n\n');
  } else {
    cleaned = value
      .replace(/[\r\n\t]+/g, ' ')
      .replace(CONTROL, '')
      .replace(SPACES, ' ');
  }
  return cut(trim(cleaned), limit);
}

/** The non-empty strings of a list, cleaned and clipped, at most `maxItems` of them. */
export function textList(value: unknown, maxItems: number, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const cleaned = text(item, limit);
    if (cleaned) out.push(cleaned);
    if (out.length === maxItems) break;
  }
  return out;
}

/** A JSON whole number, else null (true is not a number here, as in workbook_gen.py). */
export function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function clamp(value: unknown, low: number, high: number, def: number): number {
  const number = whole(value);
  if (number === null) return def;
  return Math.max(low, Math.min(high, number));
}

const isObject = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ── The source, in parts ──────────────────────────────────────────────────────

/** The source in numbered parts of whole paragraphs (a paragraph longer than a part is cut into pieces). */
export function splitSource(source: string): string[] {
  const total = cpLength(source);
  const target = Math.max(PART_MIN, Math.min(PART_MAX, Math.ceil(total / PART_TARGET_COUNT)));
  const parts: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const raw of source.split(PARAGRAPH_BREAK)) {
    const paragraph = trim(raw);
    if (!paragraph) continue;
    const chars = cps(paragraph);
    if (chars.length > target) {
      if (current.length) {
        parts.push(current.join('\n\n'));
        current = [];
        size = 0;
      }
      for (let start = 0; start < chars.length; start += target) {
        const piece = trim(chars.slice(start, start + target).join(''));
        if (piece) parts.push(piece);
      }
      continue;
    }
    let extra = chars.length + (current.length ? 2 : 0);
    if (current.length && size + extra > target) {
      parts.push(current.join('\n\n'));
      current = [];
      size = 0;
      extra = chars.length;
    }
    current.push(paragraph);
    size += extra;
  }
  if (current.length) parts.push(current.join('\n\n'));
  return parts;
}

/** The text of parts start..end (1-based, inclusive), and whether it had to be cut to fit the prompt. */
export function sectionMaterial(
  parts: string[],
  start: number,
  end: number
): { material: string; wasCut: boolean } {
  const material = parts.slice(start - 1, end).join('\n\n');
  if (cpLength(material) <= SECTION_SOURCE_CHARS) return { material, wasCut: false };
  return { material: cut(material, SECTION_SOURCE_CHARS), wasCut: true };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function about(title: string, description: string, instructions: string): string {
  const lines = [`Title: ${title}`];
  if (description) lines.push(`Description: ${description}`);
  let block = lines.join('\n');
  if (instructions) {
    block += `\n\nInstructions from the workbook's author (follow them):\n${instructions}`;
  }
  return block;
}

/** How many chapters the outline may have: never more than there are parts (a chapter is at least one part). */
export function chapterBounds(partCount: number): [number, number] {
  const high = Math.max(1, Math.min(MAX_SECTIONS, partCount));
  return [partCount >= 6 ? Math.min(3, high) : 1, high];
}

export function buildOutlinePrompt(
  title: string,
  description: string,
  instructions: string,
  parts: string[]
): string {
  const count = parts.length;
  const full = cpLength(parts.join('\n\n')) <= OUTLINE_SOURCE_CHARS;
  let shown: string[];
  let how: string;
  if (full) {
    shown = parts;
    how = 'Each part is shown in full.';
  } else {
    const each = Math.max(EXCERPT_MIN, Math.floor(OUTLINE_SOURCE_CHARS / count));
    shown = parts.map((part) => (cpLength(part) <= each ? part : `${cut(part, each)} [...]`));
    how = 'The material is long, so only the opening of each part is shown.';
  }
  const material = shown.map((part, i) => `[[P${i + 1}]]\n${part}`).join('\n\n');
  const [low, high] = chapterBounds(count);
  const span =
    low !== high ? `${low} to ${high} chapters` : `${high} chapter` + (high !== 1 ? 's' : '');
  return `You are an instructional designer turning learning material into an interactive workbook: chapters of short readings and hands-on exercises (reflections, checklists, planners, habit trackers, quizzes) that help a learner understand the material and apply it to their own life or work.

THE WORKBOOK
${about(title, description, instructions)}

THE MATERIAL
The material is split into ${count} numbered part${count !== 1 ? 's' : ''}, [[P1]] to [[P${count}]]. ${how}

${material}

YOUR TASK
Plan the workbook's chapters, in the material's own order.
- Write ${span}: one per real chapter or main idea of the material, never padding.
- Each chapter covers a run of consecutive parts: "from" and "to" are part numbers (1 to ${count}). The runs follow each other without gaps or overlaps, the first starts at 1 and the last ends at ${count}.
- "title": a short chapter title, at most 80 characters, in sentence case.
- "summary": one or two sentences on what the learner gets from the chapter.
- "goals": two or three things the learner can do after the chapter, each starting with a verb.
- "minutes": how long the chapter takes, reading and exercises together (5 to 60).
Also write the workbook's "summary" (two sentences: what it covers and who it helps) and three to five "outcomes": what the learner can do after the whole workbook.
Write in the material's language.

Return ONLY this JSON object, with no markdown fences and no text around it:
{"summary": "...", "outcomes": ["..."], "chapters": [{"title": "...", "summary": "...", "goals": ["..."], "from": 1, "to": 2, "minutes": 15}]}`;
}

/** The prompt that writes chapter `index` (0-based) of `sections` (the normalized outline). */
export function buildSectionPrompt(
  title: string,
  description: string,
  instructions: string,
  sections: Row[],
  index: number,
  material: string,
  wasCut: boolean
): string {
  const section = sections[index];
  const chapters = sections
    .map((item, i) => `${i + 1}. ${item.title}` + (item.summary ? `: ${item.summary}` : ''))
    .join('\n');
  const goals =
    (section.goals as string[]).map((goal) => `- ${goal}`).join('\n') || '- (none given)';
  const note = wasCut ? ' (long, so only its beginning is shown)' : '';
  return `You are an instructional designer writing one chapter of an interactive workbook. The learner reads a little, then does things: reflects, plans, ticks off steps, tracks a habit, answers quiz questions. Every block must come from this chapter's material; never add facts the material does not support.

THE WORKBOOK
${about(title, description, instructions)}

ALL CHAPTERS (for context; write only chapter ${index + 1})
${chapters}

CHAPTER ${index + 1}: ${section.title}
Summary: ${section.summary || '(none)'}
Goals:
${goals}

THE CHAPTER'S MATERIAL${note}
"""
${material}
"""

YOUR TASK
Write the chapter as 6 to 12 blocks, in the order the learner meets them.
- Start with a "reading" block: the chapter's key ideas in your own words, short paragraphs, plain language.
- Then alternate short readings or key points with exercises that make the learner apply the ideas to their own situation.
- End with a "quiz" block of 3 to 5 questions that mixes question kinds.
- Use at least four different block types, and only those that fit the material: a habit tracker only for something done repeatedly, a planner only when there is something to plan.
- Speak to the learner as "you". Keep every text short and concrete. Write in the material's language.

BLOCK TYPES (the exact JSON of each)
{"type": "reading", "title": "...", "body": "two to four short paragraphs, separated by blank lines"}
{"type": "key_points", "title": "...", "items": ["one idea per item", "..."]}
{"type": "reflection", "prompt": "an open question about the learner's own life or work", "hint": "an optional nudge"}
{"type": "short_answer", "prompt": "a question answered in a sentence or two", "hint": "an optional nudge"}
{"type": "checklist", "title": "...", "items": ["a concrete step", "..."]}
{"type": "planner", "title": "...", "fields": ["a label the learner fills in", "..."]}
{"type": "habit_tracker", "habit": "one small action to repeat", "days": 7, "why": "why it helps"}
{"type": "scale", "prompt": "a statement the learner rates themselves on", "min_label": "...", "max_label": "...", "max": 5}
{"type": "action", "title": "...", "text": "one thing to try today"}
{"type": "quiz", "title": "...", "questions": [QUESTION, ...]}

QUESTION KINDS
{"kind": "mcq", "prompt": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."} (answer = the index of the right option)
{"kind": "true_false", "prompt": "a statement", "answer": true, "explanation": "..."}
{"kind": "fill_blank", "prompt": "a sentence with ___ where the missing word goes", "answer": "word", "accept": ["another accepted answer"], "explanation": "..."}
{"kind": "matching", "prompt": "...", "pairs": [{"left": "...", "right": "..."}], "explanation": "..."}
{"kind": "scenario", "scenario": "a short real-life situation", "prompt": "what should they do?", "options": ["...", "...", "..."], "answer": 1, "explanation": "..."}
Every explanation says why the right answer is right, from the material.

Return ONLY this JSON object, with no markdown fences and no text around it:
{"blocks": [...]}`;
}

// ── Cleaning the outline ──────────────────────────────────────────────────────

/** The workbook content for a fresh outline: every chapter `pending`, ranges fixed to cover parts 1..partCount. */
export function normalizeOutline(parsed: unknown, partCount: number): Row {
  if (!isObject(parsed)) {
    throw new GenerationError(502, "The AI's answer could not be read. Try again.");
  }
  let chapters: unknown = parsed.chapters;
  if (!Array.isArray(chapters)) chapters = parsed.sections;
  if (!Array.isArray(chapters)) chapters = [];

  const sections: Row[] = [];
  let previous = 0;
  for (const item of chapters as unknown[]) {
    if (!isObject(item)) continue;
    const title = text(item.title, 80);
    if (!title) continue;
    if (previous >= partCount || sections.length === MAX_SECTIONS) break;
    // Each chapter starts after the previous one's start; where it ends is decided by the next one's start.
    const asked = whole(item.from);
    const start =
      asked === null ? previous + 1 : Math.max(previous + 1, Math.min(partCount, asked));
    sections.push({
      id: `s${sections.length + 1}`,
      title,
      summary: text(item.summary, 400),
      goals: textList(item.goals, 5, 200),
      minutes: clamp(item.minutes, 3, 120, 15),
      from: start,
      to: start,
      status: 'pending',
      blocks: [],
    });
    previous = start;
  }
  if (!sections.length) throw new GenerationError(502, 'The AI returned no chapters. Try again.');
  sections[0].from = 1;
  sections.forEach((section, position) => {
    const following = position + 1 < sections.length ? sections[position + 1].from : partCount + 1;
    section.to = following - 1;
  });

  return {
    schema: SCHEMA_VERSION,
    summary: text(parsed.summary, 600, true),
    outcomes: textList(parsed.outcomes, 6, 200),
    estimated_minutes: sections.reduce((sum, section) => sum + section.minutes, 0),
    sections,
  };
}

// ── Cleaning a chapter's blocks ───────────────────────────────────────────────

/** The right option of a choice question: an index, the option's own text, or a letter (A = the first). */
function optionIndex(answer: unknown, options: string[]): number | null {
  const number = whole(answer);
  if (number !== null) return number >= 0 && number < options.length ? number : null;
  if (typeof answer !== 'string') return null;
  const wanted = trim(answer).toLowerCase();
  const found = options.findIndex((option) => option.toLowerCase() === wanted);
  if (found >= 0) return found;
  if (wanted.length === 1 && wanted >= 'a' && wanted <= 'f') {
    const position = wanted.charCodeAt(0) - 'a'.charCodeAt(0);
    return position < options.length ? position : null;
  }
  return null;
}

function question(raw: unknown, questionId: string): Row | null {
  if (!isObject(raw)) return null;
  let kind: unknown = (QUESTION_KINDS as readonly unknown[]).includes(raw.kind)
    ? raw.kind
    : raw.type;
  if (!(QUESTION_KINDS as readonly unknown[]).includes(kind)) return null;
  let prompt = text(raw.prompt, 600) || text(raw.question, 600);
  const explanation = text(raw.explanation, 600, true);
  const out: Row = { id: questionId, kind, prompt };

  if (kind === 'mcq' || kind === 'scenario') {
    const options = textList(raw.options, 6, 200);
    const answer = optionIndex(raw.answer, options);
    if (options.length < 2 || answer === null) return null;
    const scenario = text(raw.scenario, 1200, true);
    if (kind === 'scenario' && !scenario) {
      kind = 'mcq';
      out.kind = kind;
    }
    if (kind === 'mcq' && !prompt) return null;
    if (kind === 'scenario') {
      out.scenario = scenario;
      out.prompt = prompt || 'What should they do?';
    }
    out.options = options;
    out.answer = answer;
  } else if (kind === 'true_false') {
    let answer: unknown = raw.answer;
    if (typeof answer === 'string' && ['true', 'false'].includes(trim(answer).toLowerCase())) {
      answer = trim(answer).toLowerCase() === 'true';
    }
    if (!prompt || typeof answer !== 'boolean') return null;
    out.answer = answer;
  } else if (kind === 'fill_blank') {
    const answer = text(raw.answer, 100);
    if (!prompt || !answer) return null;
    prompt = prompt.replace(BLANK, '___');
    if (!prompt.includes('___')) return null;
    out.prompt = prompt;
    out.answer = answer;
    out.accept = textList(raw.accept, 5, 100).filter(
      (item) => item.toLowerCase() !== answer.toLowerCase()
    );
  } else {
    const pairs: Array<{ left: string; right: string }> = [];
    for (const pair of Array.isArray(raw.pairs) ? raw.pairs : []) {
      if (!isObject(pair)) continue;
      const left = text(pair.left, 200);
      const right = text(pair.right, 200);
      if (left && right) pairs.push({ left, right });
      if (pairs.length === 6) break;
    }
    if (pairs.length < 2) return null;
    out.prompt = prompt || 'Match each item with its pair.';
    out.pairs = pairs;
  }
  out.explanation = explanation;
  return out;
}

function block(raw: unknown, blockId: string): Row | null {
  if (!isObject(raw) || !(BLOCK_TYPES as readonly unknown[]).includes(raw.type)) return null;
  const kind = raw.type as (typeof BLOCK_TYPES)[number];
  const out: Row = { id: blockId, type: kind };
  if (kind === 'reading') {
    const body = text(raw.body, 4000, true) || text(raw.text, 4000, true);
    if (!body) return null;
    Object.assign(out, { title: text(raw.title, 120), body });
  } else if (kind === 'key_points') {
    const items = textList(raw.items, 8, 300);
    if (!items.length) return null;
    Object.assign(out, { title: text(raw.title, 120), items });
  } else if (kind === 'reflection' || kind === 'short_answer') {
    const prompt = text(raw.prompt, 500);
    if (!prompt) return null;
    Object.assign(out, { prompt, hint: text(raw.hint, 300) });
  } else if (kind === 'checklist') {
    const items = textList(raw.items, 12, 200);
    if (!items.length) return null;
    Object.assign(out, {
      title: text(raw.title, 120),
      items: items.map((item, i) => ({ id: `${blockId}-i${i + 1}`, text: item })),
    });
  } else if (kind === 'planner') {
    const fields = textList(raw.fields, 8, 120);
    if (!fields.length) return null;
    Object.assign(out, {
      title: text(raw.title, 120),
      fields: fields.map((label, i) => ({ id: `${blockId}-f${i + 1}`, label })),
    });
  } else if (kind === 'habit_tracker') {
    const habit = text(raw.habit, 200);
    if (!habit) return null;
    Object.assign(out, { habit, days: clamp(raw.days, 3, 30, 7), why: text(raw.why, 300) });
  } else if (kind === 'scale') {
    const prompt = text(raw.prompt, 300);
    if (!prompt) return null;
    Object.assign(out, {
      prompt,
      min_label: text(raw.min_label, 60) || 'Not at all',
      max_label: text(raw.max_label, 60) || 'Completely',
      max: whole(raw.max) === 10 ? 10 : 5,
    });
  } else if (kind === 'action') {
    const body = text(raw.text, 600, true) || text(raw.body, 600, true);
    if (!body) return null;
    Object.assign(out, { title: text(raw.title, 120), text: body });
  } else {
    const questions: Row[] = [];
    for (const item of Array.isArray(raw.questions) ? raw.questions : []) {
      const made = question(item, `${blockId}-q${questions.length + 1}`);
      if (made) questions.push(made);
      if (questions.length === MAX_QUESTIONS) break;
    }
    if (!questions.length) return null;
    Object.assign(out, { title: text(raw.title, 120), questions });
  }
  return out;
}

/** The usable blocks of one chapter's answer, with ids `<section>-b1`, `-b2`, ... in order. */
export function normalizeSection(parsed: unknown, sectionId: string): Row[] {
  let rawBlocks: unknown;
  if (Array.isArray(parsed)) rawBlocks = parsed;
  else if (isObject(parsed)) rawBlocks = parsed.blocks;
  else throw new GenerationError(502, "The AI's answer could not be read. Try again.");
  const blocks: Row[] = [];
  for (const raw of Array.isArray(rawBlocks) ? rawBlocks : []) {
    const made = block(raw, `${sectionId}-b${blocks.length + 1}`);
    if (made) blocks.push(made);
    if (blocks.length === MAX_BLOCKS) break;
  }
  if (!blocks.length) {
    throw new GenerationError(
      502,
      'The AI returned no usable exercises for this chapter. Try again.'
    );
  }
  return blocks;
}

// ── "Explain this to me" ──────────────────────────────────────────────────────

/** What a block says, as plain text, for the explain prompt (a quiz gives its questions, never its answers). */
export function blockText(block: Row): string {
  const kind = block.type;
  const lines: string[] = [];
  if (typeof block.title === 'string' && block.title) lines.push(block.title);
  const list = (value: unknown): Row[] =>
    Array.isArray(value) ? (value.filter((v) => typeof v === 'object' && v !== null) as Row[]) : [];
  if (kind === 'reading') lines.push(block.body || '');
  else if (kind === 'key_points')
    lines.push(...(block.items || []).map((item: string) => `- ${item}`));
  else if (kind === 'action') lines.push(block.text || '');
  else if (kind === 'reflection' || kind === 'short_answer' || kind === 'scale') {
    lines.push(block.prompt || '');
    if (block.hint) lines.push(block.hint);
  } else if (kind === 'checklist')
    lines.push(...list(block.items).map((item) => `- ${item.text ?? ''}`));
  else if (kind === 'planner')
    lines.push(...list(block.fields).map((field) => `- ${field.label ?? ''}`));
  else if (kind === 'habit_tracker') {
    lines.push(block.habit || '');
    if (block.why) lines.push(block.why);
  } else if (kind === 'quiz') {
    for (const question of list(block.questions)) {
      if (question.scenario) lines.push(question.scenario);
      lines.push(`- ${question.prompt ?? ''}`);
    }
  }
  return lines.filter((line) => line).join('\n');
}

export function buildExplainPrompt(
  workbookTitle: string,
  chapterTitle: string,
  block: Row,
  question: string
): string {
  const asked = question ? `\nThe learner asks: ${question}\n` : '';
  const first = question ? " Answer the learner's question first." : '';
  return `You are a patient tutor helping a learner with one part of a workbook.

THE WORKBOOK: ${workbookTitle}
THE CHAPTER: ${chapterTitle}

THE PART THE LEARNER IS ON
"""
${blockText(block)}
"""
${asked}
Explain this part again in simpler words: two or three short paragraphs in plain language, speaking to the learner as "you", with one everyday example.${first} Stay true to the text; if it does not cover what the learner asks, say so briefly. Write in the language of the text. Plain text only: no markdown, no headings, no lists.`;
}

/** The explanation as shown: control characters gone, at most one blank line in a row, clipped. */
export function cleanExplanation(raw: unknown): string {
  return text(raw, EXPLANATION_MAX, true);
}
