/**
 * fe-apis/dailySession/generate.ts
 *
 * Twin (nextjs-api mode) of generate_session_questions_endpoint and its helpers in
 * backend/modules/daily_session/daily_session.py:
 *
 *   POST /sessions/generate-session-questions   (login)
 *
 * Prompts, limits, the slot/topic tables and the catalog are copied verbatim, so change both. The duplicate check is
 * dedup.ts (twin of dedup.py). Randomness (focus picks, the variation seed, catalog picks) differs per call by design.
 */

import { HttpError, aiSettings, callAi, extractJsonArray, type Row } from '../todo/_shared';
import { DIVERSE_QUESTIONS_CATALOG, SLOT_FOCUS } from './catalog';
import { QuestionIndex } from './dedup';

const SECTION_A = ['Data Structures', 'System Design (Mid-Scale)', 'Scenario-Based Bug', 'Large-Scale System Design', 'Leadership'];
const SECTION_B = ['Classical CV', 'Deep Learning Vision', 'CV Training Strategy', 'Dataset Quality', 'CV Optimization'];

const SLOT_BRIEF: Record<string, [section: 'A' | 'B', number: number, brief: string]> = {
  'Data Structures': ['A', 1, 'Data Structures / Algorithm: a concrete problem with input/output and a complexity angle'],
  'System Design (Mid-Scale)': ['A', 2, 'Mid-Scale System Design: one service, clear requirements, trade-offs'],
  'Scenario-Based Bug': ['A', 3, 'Scenario-Based Production Bug: symptoms are given, the candidate finds root cause and fix'],
  'Large-Scale System Design': ['A', 4, 'Large-Scale Distributed Architecture: scale numbers, failure modes, consistency'],
  Leadership: ['A', 5, "Behavioral / Engineering Leadership: a specific situation, not a generic 'tell me about yourself'"],
  'Classical CV': ['B', 1, 'Classical / Geometric Computer Vision'],
  'Deep Learning Vision': ['B', 2, 'Deep Learning Vision Architecture'],
  'CV Training Strategy': ['B', 3, 'CV Training Strategy / Quantization / Fine-tuning'],
  'Dataset Quality': ['B', 4, 'Dataset Quality / Labeling Imbalance / Bias'],
  'CV Optimization': ['B', 5, 'CV Optimization / Edge Inference / TensorRT'],
};

const MAX_ATTEMPTS = 5;
// Stop starting new rounds after this many seconds (a serverless function has a time limit) and give the model room
// for ten detailed questions: the default 2048-token budget can cut the JSON off mid-array.
const TIME_BUDGET_S = 60;
const MAX_TOKENS = 4096;
const MIN_QUESTION_CHARS = 40;
const SESSION_SIZE = 10;
const MAX_CUSTOM_TOPICS = 10;
// common/ai's error when no provider has a key (both "No API key configured for this model..." and the
// Ollama-unreachable variant start with it).
const NO_KEY_MARKER = 'No API key configured';
const NEEDS_KEY_WARNING = 'No AI key is set up yet. Add one in Config and every session is written fresh for you.';

// Preset topic label (case-insensitive) -> the slots (sub_types) it unlocks. Keep the labels in step with
// TOPIC_OPTIONS in frontend/src/modules/daily-session/topics.ts.
const TOPIC_SLOTS: Record<string, string[]> = {
  dsa: ['Data Structures'],
  'system design': ['System Design (Mid-Scale)', 'Large-Scale System Design'],
  debugging: ['Scenario-Based Bug'],
  behavioral: ['Leadership'],
  'computer vision': ['Classical CV', 'Deep Learning Vision', 'Dataset Quality'],
  'ml infra': ['CV Training Strategy', 'CV Optimization'],
};

interface Slot {
  i: number;
  sub_type: string;
  custom: string | null;
  focus?: string;
}

const randomInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const choice = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
/** Python str.capitalize(). */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Python _plan_slots: turn the picked topics into exactly SESSION_SIZE question slots. */
export function planSlots(topics: string[] | null | undefined): Slot[] {
  const canonical = [...SECTION_A, ...SECTION_B];
  const presets: string[] = [];
  const customs: string[] = [];
  for (const raw of topics ?? []) {
    const label = String(raw).split(/\s+/).filter(Boolean).join(' ').slice(0, 60);
    if (!label) continue;
    if (Object.prototype.hasOwnProperty.call(TOPIC_SLOTS, label.toLowerCase())) presets.push(label.toLowerCase());
    else if (!customs.some((c) => c.toLowerCase() === label.toLowerCase())) customs.push(label);
  }
  const keptCustoms = customs.slice(0, MAX_CUSTOM_TOPICS);

  const unlocked = new Set(presets.flatMap((t) => TOPIC_SLOTS[t]));
  const pool = unlocked.size ? canonical.filter((t) => unlocked.has(t)) : canonical;
  const chosen = Array.from({ length: SESSION_SIZE }, (_, i) => pool[i % pool.length]);
  chosen.sort((a, b) => canonical.indexOf(a) - canonical.indexOf(b));

  const slots: Slot[] = chosen.map((t, n) => ({ i: n, sub_type: t, custom: null }));
  if (keptCustoms.length) {
    const targets = unlocked.size ? slots.filter((_, n) => n % 2 === 0) : slots;
    targets.forEach((sl, k) => {
      sl.custom = keptCustoms[k % keptCustoms.length];
    });
  }
  return slots;
}

/** Python _pick_focus: the least-covered angle for a slot. */
function pickFocus(subType: string, index: QuestionIndex, used: Set<string>): string {
  const all = SLOT_FOCUS[subType];
  const unused = all.filter((f) => !used.has(f));
  const options = unused.length ? unused : [...all];
  const scored = options
    .map((f) => ({ f, key: [index.coverage(f), Math.random()] as const }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1])
    .map((x) => x.f);
  const focus = choice(scored.slice(0, 3));
  used.add(focus);
  return focus;
}

/** Python _build_session_prompt (verbatim). */
function buildSessionPrompt(
  diffLabel: string,
  slots: Slot[],
  known: Map<number, string[]>,
  rejected: string[],
  extraContext: string
): string {
  const slotLines = slots.map((sl) => {
    const t = sl.sub_type;
    const build = sl.custom
      ? `REQUIRED topic: "${sl.custom}". Ask about this topic, in the style of this slot; ` +
        'if the topic does not fit the style, keep the topic and bend the style.'
      : `Build it around: ${sl.focus}.`;
    return `- slot ${sl.i}, sub_type "${t}": ${SLOT_BRIEF[t][2]}. ${build}`;
  });
  const knownBlocks = slots.map((sl) => {
    const items = (known.get(sl.i) ?? []).map((q) => `    * ${q.slice(0, 140)}`).join('\n') || '    * (nothing yet)';
    return `  [slot ${sl.i}: ${sl.sub_type}] already in the bank:\n${items}`;
  });
  const rejectedBlock = rejected.length
    ? '\nThese drafts were REJECTED as duplicates of existing questions; take a clearly different angle:\n' +
      rejected.slice(-12).map((q) => `- ${q.slice(0, 140)}`).join('\n') +
      '\n'
    : '';
  return `You are Interview-Ninja, an elite technical interviewer writing a question bank.
Write exactly ${slots.length} interview questions, one per slot below.
Difficulty Level: ${diffLabel}
Variation seed: ${randomInt(100000, 999999)}

SLOTS:
${slotLines.join('\n')}
${extraContext}
EXISTING QUESTIONS (the bank already covers these; do not repeat, rephrase or restate any of them):
${knownBlocks.join('\n')}
${rejectedBlock}
QUALITY BAR:
1. Each question must be specific and answerable in an interview: a concrete scenario, constraint, number or trade-off. No vague "explain X" one-liners.
2. A different core concept or scenario from every existing question above, not merely different wording.
3. Questions must also differ from each other in topic and wording, even when two slots share a sub_type.
4. Standalone: do not refer to "the above" or to other questions.

Return ONLY a valid JSON array of ${slots.length} objects, one per slot, exactly:
[
  {
    "slot": <the slot number>,
    "difficulty": "${diffLabel.toLowerCase()}",
    "topics": ["<2-3 short topic tags>"],
    "question_text": "..."
  }
]`;
}

/** Python int() on the model's "slot" value: ints, integral floats and digit strings; anything else is null. */
function slotNumber(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

function optionalText(body: Row, key: string): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new HttpError(422, `${key}: Input should be a valid string`);
  return v;
}

/**
 * The request body is GenerateSessionQuestionsRequest (AISettings + difficulty, cv/jd text, topics); `bankTexts` is
 * every question text in the bank, oldest first (the caller reads them, so this module stays free of the DB).
 */
export async function generateSessionQuestions(body: unknown, bankTexts: string[]): Promise<Row> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(422, 'Input should be a valid dictionary');
  }
  const req = body as Row;
  const difficulty = optionalText(req, 'difficulty');
  const cvText = optionalText(req, 'cv_text');
  const jdText = optionalText(req, 'jd_text');
  let topics: string[] | null = null;
  if (req.topics !== undefined && req.topics !== null) {
    if (!Array.isArray(req.topics) || !req.topics.every((t: unknown) => typeof t === 'string')) {
      throw new HttpError(422, 'topics: Input should be a valid list of strings');
    }
    topics = req.topics;
  }
  const settings = aiSettings(req);

  const diffLabel = capitalize(difficulty || 'Mixed');
  const index = QuestionIndex.fromTexts(bankTexts);

  const contextBits: string[] = [];
  if (cvText) contextBits.push(`Candidate CV (tailor a few questions to it):\n${cvText.slice(0, 1500)}`);
  if (jdText) contextBits.push(`Target job description (tailor a few questions to it):\n${jdText.slice(0, 1500)}`);
  const extraContext = contextBits.length ? `\n${contextBits.join('\n\n')}\n` : '';

  const slots = planSlots(topics);
  const topicFiltered = new Set(slots.map((s) => s.sub_type)).size < SECTION_A.length + SECTION_B.length || slots.some((s) => s.custom);
  const accepted = new Map<number, Row>(); // slot number -> question
  const rejected: string[] = [];
  const usedFocus = new Set<string>();
  const stats = { attempts: 0, rejected_duplicates: 0 };

  let aiError: string | null = null;
  const started = Date.now();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const missing = slots.filter((sl) => !accepted.has(sl.i));
    if (!missing.length || (attempt && (Date.now() - started) / 1000 > TIME_BUDGET_S)) break;
    stats.attempts += 1;
    for (const sl of missing) sl.focus = sl.custom || pickFocus(sl.sub_type, index, usedFocus);
    const known = new Map(missing.map((sl) => [sl.i, index.related(`${sl.sub_type} ${sl.focus}`, 20)] as const));
    const prompt = buildSessionPrompt(diffLabel, missing, known, rejected, extraContext);
    let parsed: unknown[];
    try {
      parsed = extractJsonArray(await callAi(prompt, settings, MAX_TOKENS));
    } catch (e) {
      console.warn(`[generate-session-questions] AI attempt ${attempt + 1} failed: ${e instanceof Error ? e.message : e}`);
      aiError = e instanceof Error ? e.message : String(e);
      break;
    }
    const bySlot = new Map(missing.map((sl) => [sl.i, sl] as const));
    parsed.forEach((item, pos) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return;
      const it = item as Row;
      // Match by the slot number the model echoed; fall back to position among the requested slots.
      const n = slotNumber(it.slot) ?? (pos < missing.length ? missing[pos].i : -1);
      const sl = bySlot.get(n);
      if (!sl || accepted.has(n)) return;
      const qText = String(it.question_text || it.text || '').trim();
      if (qText.length < MIN_QUESTION_CHARS) return;
      const dup = index.findDuplicate(qText);
      if (dup) {
        stats.rejected_duplicates += 1;
        rejected.push(qText);
        console.info(`[generate-session-questions] rejected (${dup[0]}): ${qText.slice(0, 80)} ~ ${dup[1].slice(0, 80)}`);
        return;
      }
      index.add(qText);
      const subType = sl.sub_type;
      let tags = Array.isArray(it.topics) ? it.topics.filter((t: unknown) => typeof t === 'string' && t.trim()) : [];
      if (!tags.length) tags = [subType];
      if (sl.custom && !tags.includes(sl.custom)) tags = [sl.custom, ...tags];
      accepted.set(n, {
        section: SLOT_BRIEF[subType][0],
        category: SLOT_BRIEF[subType][0] === 'A' ? 'interview' : 'cv_skill',
        sub_type: subType,
        difficulty: String(it.difficulty || diffLabel.toLowerCase()),
        topics: tags,
        question_text: qText,
        question_type: subType,
      });
    });
  }

  // No AI key at all: ask for one instead of handing out the built-in set (which runs dry and repeats).
  // The client shows an "Add a key in Config" prompt for `needs_key`.
  if (!accepted.size && aiError && aiError.includes(NO_KEY_MARKER)) {
    return { questions: [], source: 'none', stats, needs_key: true, warning: NEEDS_KEY_WARNING };
  }

  // Top up any gaps from the curated catalog. Never reuse a question that is already in the bank or in this
  // session. Prefer the same sub_type, then (only when no topics were picked) any other slot of the same section; if
  // nothing fresh is left the slot stays empty and is reported.
  const source = accepted.size === slots.length ? 'ai' : accepted.size ? 'mixed' : 'catalog';
  for (const sl of slots) {
    if (accepted.has(sl.i)) continue;
    const sec = SLOT_BRIEF[sl.sub_type][0];
    const pools = [DIVERSE_QUESTIONS_CATALOG.filter((q) => q.section === sec && q.sub_type === sl.sub_type)];
    if (!topicFiltered) pools.push(DIVERSE_QUESTIONS_CATALOG.filter((q) => q.section === sec));
    let chosen = null;
    for (const pool of pools) {
      const fresh = pool.filter((q) => !index.isDuplicate(q.question_text));
      if (fresh.length) {
        chosen = choice(fresh);
        break;
      }
    }
    if (!chosen) continue;
    index.add(chosen.question_text);
    accepted.set(sl.i, { ...chosen, difficulty: diffLabel !== 'Mixed' ? diffLabel.toLowerCase() : chosen.difficulty });
  }

  // Number the questions 1..n inside each section, in slot order.
  const questions = [...accepted.keys()].sort((a, b) => a - b).map((i) => accepted.get(i) as Row);
  const counters: Record<string, number> = {};
  for (const q of questions) {
    counters[q.section] = (counters[q.section] ?? 0) + 1;
    q.number = counters[q.section];
  }
  const result: Row = { questions, source, stats };
  if (aiError) result.ai_error = aiError.slice(0, 300);
  if (questions.length < slots.length) {
    result.warning = aiError
      ? `The AI couldn't write new questions (${aiError.slice(0, 160)}). Only ${questions.length} unused built-in questions were left.`
      : `Only ${questions.length} brand-new questions were found. Generate again or pick other topics for the rest.`;
  } else if (aiError) {
    result.warning = `The AI couldn't write new questions (${aiError.slice(0, 160)}), so some come from the built-in set.`;
  }
  return result;
}
