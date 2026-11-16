/**
 * fe-apis/dailySession/questionQuiz.ts
 *
 * Twin of backend/modules/daily_session/question_quiz.py: the prompt and limits for the per-question concept quiz
 * (Question Review). The prompt is copied verbatim and must stay byte-identical across the pair, so change both
 * together. The model's reply is validated with normalizeQuestions from ../labSections/quiz (the labs' quiz).
 *
 * Imports only ./tutorMemory (itself import-free), so the pair compiles on its own for diffing against Python.
 */

import { memoryBlock } from './tutorMemory';

// Limits shared by the routes in ./index.ts (and FastAPI's in daily_session.py).
export const MAX_WORKSPACE_FIELD_CHARS = 20000; // each of a question workspace's `answer` and `notes`
export const MAX_QUIZ_ANSWER_CHARS = 4000; // the written answer a quiz request may send along
export const MAX_QUIZ_PER_QUESTION = 40; // stored quiz items per user and question
export const QUIZ_MAX_TOKENS = 3500;

// Only the most recent stems go back into the prompt (all of them, at the cap of 40), each cut short.
const MAX_PREVIOUS_IN_PROMPT = 40;
const PREVIOUS_CHARS = 220;
const QUESTION_CHARS = 3000;

const CATEGORY_LABELS: Record<string, string> = {
  interview: 'Interview (technical or behavioural)',
  cv_skill: 'Computer Vision / ML',
};

/** Python's len(s) > n, counting code points like Python does (not UTF-16 units). */
export function longerThan(s: string, n: number): boolean {
  return s.length > n && Array.from(s).length > n;
}

/** Python's s[:n]: the first n code points. */
function cut(s: string, n: number): string {
  return s.length <= n ? s : Array.from(s).slice(0, n).join('');
}

export function buildQuestionQuizPrompt(a: {
  questionText: string;
  category: string;
  subType: string;
  topics: string[];
  difficulty: string;
  answer: string;
  previousQuestions: string[];
  count: number;
  /** memoryLines() for this user and the question's sub_type (tutorMemory.ts); empty = left out. */
  memory?: string[];
}): string {
  const details: string[] = [];
  const label = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, a.category)
    ? CATEGORY_LABELS[a.category]
    : a.category.trim();
  if (label) details.push(`Category: ${label}`);
  if (a.subType.trim()) details.push(`Question type: ${a.subType.trim()}`);
  const topicList = a.topics.filter((t) => t && t.trim()).map((t) => t.trim());
  if (topicList.length) details.push('Topics: ' + topicList.join(', '));
  if (a.difficulty.trim()) details.push(`Difficulty: ${a.difficulty.trim()}`);
  const detailBlock = details.length ? '\n' + details.join('\n') : '';

  const written = cut(a.answer.trim(), MAX_QUIZ_ANSWER_CHARS);
  let gaps = '';
  if (written) {
    gaps =
      '\n\nThe learner has written this answer to the interview question:\n' +
      `"""\n${written}\n"""\n` +
      'Aim about half of the questions (at least one) at the gaps in this answer: ideas it gets wrong, leaves ' +
      'out or only gestures at, and the follow-ups an interviewer would push on after hearing it. Do not quote ' +
      'the answer or mention that the learner wrote it.';
  }

  const prev = a.previousQuestions
    .filter((q) => q && q.trim())
    .map((q) => cut(q.trim().replace(/\n/g, ' '), PREVIOUS_CHARS))
    .slice(-MAX_PREVIOUS_IN_PROMPT);
  let avoid = '';
  if (prev.length) {
    const listing = prev.map((q) => `- ${q}`).join('\n');
    avoid = `\n\nThe learner has already seen these questions. Do not repeat them or ask near-duplicates; cover new ground:\n${listing}`;
  }

  const question = cut(a.questionText.trim(), QUESTION_CHARS);
  return `You are a senior interview coach writing a multiple-choice quiz for an interview prep app.

The learner is preparing to answer this interview question:
"""
${question}
"""${detailBlock}

Write ${a.count} questions that test the concepts someone needs to answer this interview question well: the key ideas and terms behind it, the mechanism or reasoning a strong answer explains, the trade-offs and alternatives worth comparing, common mistakes and misconceptions, and the edge cases or follow-ups an interviewer is likely to probe. Quiz the building blocks of a good answer; do not ask the interview question itself, or which overall answer is best. For a behavioural or leadership question, test the principles and judgement behind a strong story (structure, ownership, trade-offs, measurable impact), not facts about the learner. Mix the kinds: conceptual, compare-the-options, spot-the-mistake, what-happens-if, and which-approach-fits-this-case questions.${gaps}${memoryBlock(a.memory ?? [], 'quiz')}

Rules:
- Exactly 4 options per question, exactly one correct. Distractors must be plausible and reflect real misconceptions, not obvious throwaways. Never use "all of the above" or "none of the above".
- Make the four options similar in length and level of detail; the correct one must not be the longest or most specific.
- Every question must stand alone: never refer to "the interview question", "your answer", or code, a snippet, a figure or a table that isn't written out in the question itself. If a question needs a snippet, describe it in a sentence or two.
- Plain text only in "q", the options and "explanation": no markdown, no code fences. A short inline expression such as nums[i] - k is fine.
- "explanation" is 1-3 sentences: why the correct option is right and why the most tempting wrong one is not.
- Match the depth to the difficulty given. Test understanding that matters in an interview, not trivia.${avoid}

Respond with ONLY a JSON array of ${a.count} objects, no text outside it, each shaped exactly:
{"q": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": <0-3, index of the correct option>, "explanation": "..."}`;
}
