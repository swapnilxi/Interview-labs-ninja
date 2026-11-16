"""Prompt and limits for the per-question concept quiz (Question Review). No I/O, so it is easy to test.

The quiz tests the concepts someone needs to answer one Daily Session interview question well. The model's reply
is validated with `normalize_questions` from modules/lab_sections/quiz.py (the labs' quiz, same item shape).

Twin: frontend/fe-apis/dailySession/questionQuiz.ts. The prompt must stay byte-identical across the pair, so
change both together (CLAUDE.md, "Dual deployment modes").
"""

from __future__ import annotations

from typing import Iterable

from modules.daily_session.tutor_memory import memory_block

# Limits shared by the routes in daily_session.py (and the twin's in fe-apis/dailySession/index.ts).
MAX_WORKSPACE_FIELD_CHARS = 20000  # each of a question workspace's `answer` and `notes`
MAX_QUIZ_ANSWER_CHARS = 4000  # the written answer a quiz request may send along
MAX_QUIZ_PER_QUESTION = 40  # stored quiz items per user and question
QUIZ_MAX_TOKENS = 3500

# Only the most recent stems go back into the prompt (all of them, at the cap of 40), each cut short.
MAX_PREVIOUS_IN_PROMPT = 40
_PREVIOUS_CHARS = 220
_QUESTION_CHARS = 3000

_CATEGORY_LABELS = {
    "interview": "Interview (technical or behavioural)",
    "cv_skill": "Computer Vision / ML",
}


def build_question_quiz_prompt(
    *,
    question_text: str,
    category: str,
    sub_type: str,
    topics: Iterable[str],
    difficulty: str,
    answer: str,
    previous_questions: Iterable[str],
    count: int,
    memory: Iterable[str] = (),
) -> str:
    # `memory`: memory_lines() for this user and the question's sub_type (tutor_memory.py); empty = left out.
    details = []
    label = _CATEGORY_LABELS.get(category, category.strip())
    if label:
        details.append(f"Category: {label}")
    if sub_type.strip():
        details.append(f"Question type: {sub_type.strip()}")
    topic_list = [t.strip() for t in topics if t and t.strip()]
    if topic_list:
        details.append("Topics: " + ", ".join(topic_list))
    if difficulty.strip():
        details.append(f"Difficulty: {difficulty.strip()}")
    detail_block = ("\n" + "\n".join(details)) if details else ""

    written = answer.strip()[:MAX_QUIZ_ANSWER_CHARS]
    gaps = ""
    if written:
        gaps = (
            "\n\nThe learner has written this answer to the interview question:\n"
            f'"""\n{written}\n"""\n'
            "Aim about half of the questions (at least one) at the gaps in this answer: ideas it gets wrong, leaves "
            "out or only gestures at, and the follow-ups an interviewer would push on after hearing it. Do not quote "
            "the answer or mention that the learner wrote it."
        )

    prev = [q.strip().replace("\n", " ")[:_PREVIOUS_CHARS] for q in previous_questions if q and q.strip()]
    prev = prev[-MAX_PREVIOUS_IN_PROMPT:]
    avoid = ""
    if prev:
        listing = "\n".join(f"- {q}" for q in prev)
        avoid = f"\n\nThe learner has already seen these questions. Do not repeat them or ask near-duplicates; cover new ground:\n{listing}"

    question = question_text.strip()[:_QUESTION_CHARS]
    return f"""You are a senior interview coach writing a multiple-choice quiz for an interview prep app.

The learner is preparing to answer this interview question:
\"\"\"
{question}
\"\"\"{detail_block}

Write {count} questions that test the concepts someone needs to answer this interview question well: the key ideas and terms behind it, the mechanism or reasoning a strong answer explains, the trade-offs and alternatives worth comparing, common mistakes and misconceptions, and the edge cases or follow-ups an interviewer is likely to probe. Quiz the building blocks of a good answer; do not ask the interview question itself, or which overall answer is best. For a behavioural or leadership question, test the principles and judgement behind a strong story (structure, ownership, trade-offs, measurable impact), not facts about the learner. Mix the kinds: conceptual, compare-the-options, spot-the-mistake, what-happens-if, and which-approach-fits-this-case questions.{gaps}{memory_block(list(memory), "quiz")}

Rules:
- Exactly 4 options per question, exactly one correct. Distractors must be plausible and reflect real misconceptions, not obvious throwaways. Never use "all of the above" or "none of the above".
- Make the four options similar in length and level of detail; the correct one must not be the longest or most specific.
- Every question must stand alone: never refer to "the interview question", "your answer", or code, a snippet, a figure or a table that isn't written out in the question itself. If a question needs a snippet, describe it in a sentence or two.
- Plain text only in "q", the options and "explanation": no markdown, no code fences. A short inline expression such as nums[i] - k is fine.
- "explanation" is 1-3 sentences: why the correct option is right and why the most tempting wrong one is not.
- Match the depth to the difficulty given. Test understanding that matters in an interview, not trivia.{avoid}

Respond with ONLY a JSON array of {count} objects, no text outside it, each shaped exactly:
{{"q": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": <0-3, index of the correct option>, "explanation": "..."}}"""
