/**
 * Built-in instructions for each DSA section that doesn't carry its own `guidance` in SECTION_DEFS
 * (Prerequisites and Approaches do). They are what the AI is told when a section is written by the
 * AI (the pen's regenerate, or a Generate on a section the learner customised) and what the lab
 * settings dialog shows as the editable "prompt".
 */
export const DSA_DEFAULT_GUIDANCE: Record<string, string> = {
  theory:
    'Explain the core idea behind this problem and why the pattern works. State the key insight or invariant in one or two sentences, give the intuition (what a first-time reader misses), name the pattern family it belongs to, and give the time and space complexity with a one-line argument for each. Finish with the subtopics worth studying next.',
  visual:
    'Show how the algorithm moves through the data with small text diagrams in fenced `text` blocks: the state after each of 4-6 steps on a tiny input, with the pointers, indices or data-structure contents marked. Add a short legend saying what changes at each step and why.',
  implementation:
    'Give one clean, correct Python solution with comments on the invariant, then a dry run on a small example showing the variables step by step, then the complexity. Mention one implementation choice that has an alternative (iterative vs recursive, array vs dict).',
  hyperparameters:
    'Explain the design choices that matter for this problem: which data structure and why, the time/space trade-offs, how constraints change the approach (sorted input, duplicates, streaming), and when to prefer each variant. A compact table of choice | benefit | cost helps.',
  pitfalls:
    'List the 4-6 mistakes people really make on this problem (off-by-one, initial values, empty/duplicate/negative inputs, overflow, mutating while iterating). Give each a tiny failing input and the fix.',
  applications:
    'Give 4-5 concrete real-world uses of this technique. For each, name the system or scenario and say which part of the algorithm it maps to.',
  interview:
    'Write the interview round for this problem: how to recognise it from the wording, the clarifying questions to ask, three likely follow-ups with short answers, and the wrong turns an interviewer watches for.',
  comparison:
    'Compare this solution with the main alternatives in a table (approach | time | space | best when | drawback), then one short paragraph on how to choose between them.',
  paper:
    'Point to the origin of the idea and the best places to read about it: the classic paper or textbook chapter, how the technique evolved, and two or three related problems or advanced variants to try next.',
  quiz: "Focus the questions on this problem's key insight, complexity, edge cases and common bugs, and on how it differs from the other problems in its pattern family. Mix conceptual, bug-spotting and pattern-recognition questions.",
  references:
    "List the best study resources for this problem and pattern (NeetCode, the LeetCode editorial, Striver's sheet, MIT 6.006, CLRS), each with one line on what to take from it.",
};
