/**
 * Built-in instructions for each Computer Vision section that doesn't carry its own `guidance` in
 * SECTION_DEFS (Prerequisites does). They are what the AI is told when a section is written by the
 * AI (the pen's regenerate, or a Generate on a section the learner customised) and what the lab
 * settings dialog shows as the editable "prompt". The Quiz is a fixed question bank here, so it has none.
 */
export const CV_DEFAULT_GUIDANCE: Record<string, string> = {
  theory:
    'Explain the mathematics behind this topic and the intuition for it: define the key quantities and equations (as plain text or inline code), say what each term means and why it is there, and work one small numeric example. Keep the notation consistent and define every symbol.',
  visual:
    'Draw the data flow with small text diagrams in fenced `text` blocks: the input and output shapes at each stage, the operations between them, and where the learned parameters live. Add a short legend for the shapes and operations.',
  implementation:
    'Give a short, correct Python implementation using OpenCV and/or PyTorch with comments on the shapes at each step, a minimal usage example, and what the output should look like. Mention one thing that commonly differs between libraries or conventions (BGR vs RGB, channel order).',
  hyperparameters:
    'List the hyperparameters and design choices that matter (kernel size, stride, thresholds, learning rate, augmentation), what each does, sensible starting values, and the symptom you see when it is wrong. A table of knob | effect | typical range helps.',
  pitfalls:
    'List the 4-6 things that go wrong in practice (colour-space or channel-order mix-ups, wrong normalisation, shape mismatches, data leakage, overfitting) with the symptom of each and how to debug it.',
  applications:
    'Give 4-5 real-world uses of this technique, each naming the industry or product and the part of the technique that makes it work there.',
  interview:
    "Write the interview round: the conceptual questions asked, a short coding question with its solution outline, and a debugging scenario ('your model does X, why?'), each with a concise model answer.",
  comparison:
    'Compare this technique with its main alternatives in a table (method | strengths | weaknesses | compute cost | best when), then say how you would choose.',
  paper:
    'Name the original paper and its core contribution in plain words, then trace how the idea evolved to the current state of the art, with the key follow-up papers and what each fixed.',
  references:
    'List the best study resources for this topic (Stanford CS231n, Papers With Code, the OpenCV and PyTorch docs, key papers), each with one line on what to take from it.',
};
