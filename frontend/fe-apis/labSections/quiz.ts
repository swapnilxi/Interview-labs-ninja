/**
 * fe-apis/labSections/quiz.ts
 *
 * Port of backend/modules/lab_sections/quiz.py: the quiz prompt and the validation/shuffling of
 * the model's answer. The prompt text is copied verbatim so both backends ask the same thing --
 * keep the two in sync.
 */

import type { QuizQuestion } from './db';

const DOMAINS: Record<string, string> = {
  dsa: 'Data Structures & Algorithms interview',
  cv: 'Computer Vision interview',
  system_design: 'System Design interview',
};

// Only the most recent questions go back into the prompt: enough to steer away from repeats.
const MAX_PREVIOUS_IN_PROMPT = 40;
const PREVIOUS_CHARS = 220;

export function buildQuizPrompt(a: {
  lab: string;
  topicName: string;
  topicBrief: string;
  category: string;
  prerequisites: string[];
  relatedTopics: string[];
  subtopicName: string;
  subtopicBrief: string;
  previousQuestions: string[];
  count: number;
}): string {
  const domain = DOMAINS[a.lab] ?? 'technical interview';
  const lines = [`Topic: ${a.topicName}`];
  if (a.topicBrief) lines.push(`Brief: ${a.topicBrief}`);
  if (a.category) lines.push(`Pattern family: ${a.category}`);
  const prereqs = a.prerequisites.filter(Boolean);
  if (prereqs.length) lines.push('Prerequisites: ' + prereqs.join(', '));
  const related = a.relatedTopics.filter(Boolean);
  if (related.length) lines.push('Related problems in the same family: ' + related.join('; '));
  if (a.subtopicName) {
    const focus = a.subtopicBrief ? `${a.subtopicName} — ${a.subtopicBrief}` : a.subtopicName;
    lines.push(`Learner is currently on this sub-topic: ${focus}`);
  }
  const context = lines.join('\n');

  const prev = a.previousQuestions
    .filter((q) => q && q.trim())
    .map((q) => q.trim().replace(/\n/g, ' ').slice(0, PREVIOUS_CHARS))
    .slice(-MAX_PREVIOUS_IN_PROMPT);
  let avoid = '';
  if (prev.length) {
    const listing = prev.map((q) => `- ${q}`).join('\n');
    avoid = `\n\nThe learner has already seen these questions. Do not repeat them or ask near-duplicates; cover new ground:\n${listing}`;
  }

  return `You are a senior coach writing a multiple-choice quiz for a ${domain} prep app.

${context}

Write ${a.count} questions that are about this specific topic AND the concepts around it: the problem's key insight and invariant, its time/space complexity, edge cases and common bugs, the underlying pattern and the prerequisite ideas, and how it differs from or generalises to the related problems listed. Mix the kinds: conceptual, complexity, bug-spotting / edge case, pattern recognition ("which approach fits this variant?"), and short predict-the-result questions.

Rules:
- Exactly 4 options per question, exactly one correct. Distractors must be plausible and reflect real misconceptions, not obvious throwaways. Never use "all of the above" or "none of the above".
- Make the four options similar in length and level of detail; the correct one must not be the longest or most specific.
- Every question must stand alone: never refer to code, a snippet, a figure or a table that isn't written out in the question itself. If a question needs a snippet, describe it in a sentence or two.
- Plain text only in "q", the options and "explanation": no markdown, no code fences. A short inline expression such as nums[i] - k is fine.
- "explanation" is 1-3 sentences: why the correct option is right and why the most tempting wrong one is not.
- Test understanding that matters in an interview, not trivia.${avoid}

Respond with ONLY a JSON array of ${a.count} objects, no text outside it, each shaped exactly:
{"q": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": <0-3, index of the correct option>, "explanation": "..."}`;
}

function asAnswerIndex(value: unknown): number | null {
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number')
    return Number.isInteger(value) && value >= 0 && value <= 3 ? value : null;
  if (typeof value === 'string') {
    const v = value.trim();
    if (/^\d+$/.test(v) && Number(v) <= 3) return Number(v);
    if (v.length === 1 && 'ABCD'.includes(v.toUpperCase())) return 'ABCD'.indexOf(v.toUpperCase());
  }
  return null;
}

/**
 * Keep well-formed questions only and shuffle each one's options. Models strongly favour putting the
 * right answer in B or C, so options are shuffled here and `answer` re-pointed at where it landed.
 */
export function normalizeQuestions(
  raw: unknown,
  random: () => number = Math.random
): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const q = typeof rec.q === 'string' ? rec.q : rec.question;
    const opts = rec.options;
    const explanation = typeof rec.explanation === 'string' ? rec.explanation : '';
    const ans = asAnswerIndex(rec.answer);
    if (
      typeof q !== 'string' ||
      !q.trim() ||
      !Array.isArray(opts) ||
      opts.length !== 4 ||
      ans === null
    )
      continue;
    if (!opts.every((o) => typeof o === 'string' && o.trim())) continue;
    const options = (opts as string[]).map((o) => o.trim());
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    const key = q.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    out.push({
      q: q.trim(),
      options: order.map((i) => options[i]),
      answer: order.indexOf(ans),
      explanation: explanation.trim(),
    });
  }
  return out;
}
