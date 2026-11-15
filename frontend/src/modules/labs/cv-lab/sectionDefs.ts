import type { SectionDef } from '@/modules/labs/common/labSectionDefaults';

/*
 * CV Lab sections in page order, each with its default AI prompt (`guidance`): what the AI is told when it writes
 * the section (the pen, or a Generate on a section the learner customised) and what the lab settings show as the
 * editable prompt. A plain Generate fills the template from sectionContent.ts instead.
 * Data only: labSectionDefaults.ts imports this file for the Config page, so it must not import the topic list or the
 * content templates.
 */

const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS topic, as short bullets under these bold headings, in this order:
**Python & library skills** - concrete NumPy / OpenCV / PyTorch skills the topic uses (for example matrix multiplication with \`@\`, tensor shapes and permute, updating a dict of results after converting arrays to lists, hashmap lookups).
**Math & tensor operations** - the maths the topic leans on (for example matrix multiplication, homogeneous coordinates, gradients, softmax).
**Core concepts** - vision and deep-learning ideas to know first (for example intrinsic vs extrinsic camera parameters, convolution, IoU), and the earlier topics in this lab it builds on.

Every bullet names ONE concrete skill, never a vague area like "basic Python" or "linear algebra". Put a tiny example in backticks where it helps. Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

/** The default prompt of every other section (theory, code, pitfalls, ...). The Quiz has none: it uses the shared quiz rules. */
const GUIDANCE = {
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

export const CV_SECTION_DEFS: readonly SectionDef[] = [
  { id: 'prerequisites', label: 'Prerequisites', icon: 'AcademicCapIcon', subtitle: 'Specific Python, math and vision skills to have first', guidance: PREREQUISITES_GUIDANCE },
  { id: 'theory', label: 'Core Theory', icon: 'CalculatorIcon', subtitle: 'Mathematical foundations + equations', guidance: GUIDANCE.theory },
  { id: 'visual', label: 'Visual Explanation & Architecture', icon: 'PhotoIcon', subtitle: 'Data flow diagrams + architecture', guidance: GUIDANCE.visual },
  { id: 'implementation', label: 'Practical Implementation', icon: 'CodeBracketIcon', subtitle: 'OpenCV / PyTorch code examples', guidance: GUIDANCE.implementation },
  { id: 'hyperparameters', label: 'Hyperparameters & Design Choices', icon: 'AdjustmentsHorizontalIcon', subtitle: 'What to tune, typical values, tradeoffs', guidance: GUIDANCE.hyperparameters },
  { id: 'pitfalls', label: 'Common Pitfalls & Debugging', icon: 'BugAntIcon', subtitle: 'What goes wrong and how to fix it', guidance: GUIDANCE.pitfalls },
  { id: 'applications', label: 'Real-World Applications', icon: 'BuildingOffice2Icon', subtitle: 'Industry use cases + company examples', guidance: GUIDANCE.applications },
  { id: 'interview', label: 'Important Interview Questions', icon: 'ChatBubbleLeftRightIcon', subtitle: 'Conceptual + coding + detailed answers', guidance: GUIDANCE.interview },
  { id: 'comparison', label: 'Comparison with Alternatives', icon: 'ScaleIcon', subtitle: 'Tradeoff table + when to use each', guidance: GUIDANCE.comparison },
  { id: 'paper', label: 'Paper & Research Context', icon: 'DocumentMagnifyingGlassIcon', subtitle: 'Original paper + SOTA evolution', guidance: GUIDANCE.paper },
  { id: 'quiz', label: 'Quiz', icon: 'TrophyIcon', subtitle: '4 questions, score tracked, generate more' },
  { id: 'references', label: 'References & Resources', icon: 'BookOpenIcon', subtitle: 'CS231n, Papers With Code, OpenCV docs', guidance: GUIDANCE.references },
];
