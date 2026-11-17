import type { SectionDef } from '@/modules/labs/common/labSectionDefaults';
import type { TopicLabConfig } from '@/modules/labs/common/topicLabTypes';

/*
 * GenAI & AI Lab: AI fundamentals, then LLMs, prompting, RAG, agents, fine-tuning, evaluation, multimodal models and
 * shipping LLM apps. Topics are seeded from backend/modules/genai_lab/topics.json. Every section but Prerequisites (a
 * template) and the Quiz is written by the AI from the guidance below, which the lab settings show as each section's
 * editable prompt. This file is data only (no topic lists or templates), because the Config page bundles it.
 */

const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS lesson, as short bullets under these bold headings, in this order:
**Study these lessons first** - the earlier lessons in this lab it builds on.
**Python & tools** - concrete skills (for example calling a REST API with \`requests\`, parsing JSON, \`pip install\`, running a notebook, keeping an API key in an environment variable).
**Math & ML ideas** - the specific ideas it uses (for example vectors and dot products, a probability distribution that sums to 1, gradient descent, a train/validation split).
**GenAI concepts** - ideas from earlier in the lab it relies on (for example tokens, embeddings, the context window, temperature).

Every bullet names ONE concrete skill, never a vague area like "know AI" or "basic math". Put a tiny example in backticks where it helps. Use 6-12 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const GENAI_SECTION_DEFS: readonly SectionDef[] = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    icon: 'AcademicCapIcon',
    subtitle: 'Python, math and AI ideas to have first',
    guidance: PREREQUISITES_GUIDANCE,
  },
  {
    id: 'concepts',
    label: 'Core Concepts',
    icon: 'LightBulbIcon',
    subtitle: 'What it is, the mental model and when to use it',
    aiGenerated: true,
    guidance:
      'Explain the topic as a mental model a learner can hold in their head: what it is, the problem it solves, where it sits in an AI system (data, model, retrieval, tools, evaluation), and when to reach for it instead of a simpler option. Define every term the first time it appears, name the 3-5 ideas that matter most, and keep code to tiny inline snippets here.',
  },
  {
    id: 'internals',
    label: 'How It Works',
    icon: 'CpuChipIcon',
    subtitle: 'The mechanism step by step: intuition, math and a diagram',
    aiGenerated: true,
    guidance:
      'Explain the mechanism step by step: the intuition first, then the architecture or algorithm, with the key formula written in plain text where it helps (for example softmax(Q K^T / sqrt(d)) V) and every symbol explained. Include one small worked example with round numbers (a 3-token sequence, a 4-dimensional vector, a toy query) and one text diagram of the data flow in a fenced `text` block. Say what the explanation simplifies.',
  },
  {
    id: 'build',
    label: 'Build It',
    icon: 'CodeBracketIcon',
    subtitle: 'Short runnable Python you can adapt',
    aiGenerated: true,
    guidance:
      'Show how to build or try this in short, runnable Python: 2-4 snippets that grow from a minimal version to a realistic one. Use plain Python with well-known libraries (for example requests, numpy, PyTorch or scikit-learn), or a generic chat client written as `client.chat(...)` with a comment that it stands in for your provider SDK; never invent function names or parameters of a real SDK. Comment the important lines, show the expected output where it is deterministic, and say what to change to use a different model or provider.',
  },
  {
    id: 'patterns',
    label: 'Patterns & Trade-offs',
    icon: 'RectangleGroupIcon',
    subtitle: 'Design choices compared, and when to pick each',
    aiGenerated: true,
    guidance:
      'Lay out the 3-4 main design choices or patterns for this topic and compare them in a table: option | what it is | strengths | weaknesses | pick it when. Then give a short decision guide (for example "start with X; move to Y when Z") and name the simpler or cheaper alternative a team should try first.',
  },
  {
    id: 'pitfalls',
    label: 'Failure Modes & Gotchas',
    icon: 'BugAntIcon',
    subtitle: 'What goes wrong in practice and how to catch it',
    aiGenerated: true,
    guidance:
      'List the 5-7 most common failure modes and gotchas with this topic (for example silent truncation of the context, a prompt that works on 3 examples but not on 300, retrieval that returns the right text in the wrong order, non-determinism, a provider changing a model). For each give the symptom you will see, the usual cause, and the fix or the test that catches it. Include a tiny snippet where code makes the bug clearer.',
  },
  {
    id: 'production',
    label: 'Production: Cost, Latency & Safety',
    icon: 'ShieldCheckIcon',
    subtitle: 'What changes with real users and real money',
    aiGenerated: true,
    guidance:
      'Explain what changes when this goes to production: cost (tokens in and out, with a rough per-request estimate using round numbers), latency (where the time goes and how to cut it), reliability (timeouts, retries, fallbacks), privacy and security (what data leaves your system, prompt injection where it applies) and how to monitor quality. Finish with a checklist of 6-8 items to confirm before launch.',
  },
  {
    id: 'exercises',
    label: 'Hands-On Exercises',
    icon: 'WrenchScrewdriverIcon',
    subtitle: 'Practice tasks with solutions',
    aiGenerated: true,
    guidance:
      'Write 4 exercises of increasing difficulty that practise this topic; at least one must run with no API key (numpy or the standard library only). For each: a short task statement, a one-line hint, then a worked solution in a fenced `python` block with a one-sentence note on what to observe. End with one open-ended mini project the learner can extend.',
  },
  {
    id: 'interview',
    label: 'Interview Questions',
    icon: 'ChatBubbleLeftRightIcon',
    subtitle: 'Conceptual, design and debugging questions',
    aiGenerated: true,
    guidance:
      'Write 6 interview questions on this topic, from easy to hard: two conceptual, two applied or system-design (for example "design a support bot over 10,000 documents"), one debugging scenario ("the answers got worse after a change; what do you check?") and one trade-off question. Give a concise model answer for each and note the follow-up an interviewer would ask next.',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'TrophyIcon',
    subtitle: 'Concept and scenario questions, generate more',
    guidance:
      'Focus on how the mechanism works, the numbers a practitioner can reason about (tokens, dimensions, rough costs), which design fits a given situation, and how to spot a failure from its symptom. Keep every snippet to 1-3 lines written inside the question.',
  },
  {
    id: 'references',
    label: 'References & Resources',
    icon: 'BookOpenIcon',
    subtitle: 'Papers, docs and courses worth reading',
    aiGenerated: true,
    guidance:
      'List the best resources for this topic: the original paper or technical report where one exists, the official documentation of the main tools, and 2-3 well-known courses, books or engineering blogs, each with one line on what to take from it and a beginner, intermediate or advanced tag. Never invent titles, authors or URLs; when you are unsure of an exact title, describe the resource instead.',
  },
];

export const GENAI_LAB: TopicLabConfig = {
  lab: 'genai',
  guideKey: 'genai',
  apiPrefix: '/genai',
  shellLab: 'genai',
  icon: 'SparklesIcon',
  title: 'GenAI & AI',
  labName: 'GenAI & AI Lab',
  wikiTitle: 'GenAI & AI Lab',
  wikiDescription:
    'AI fundamentals, then LLMs, prompting, RAG, agents, fine-tuning, evaluation and shipping generative AI apps',
  wikiNote:
    'Models, APIs and prices change quickly. Treat names and numbers in the lessons as examples and check the official documentation before relying on a detail.',
  noun: { one: 'lesson', many: 'lessons' },
  sectionDefs: GENAI_SECTION_DEFS,
  ownPrereqTitle: 'Study these lessons first',
  prereqBaseline: {
    'AI Foundations': [
      {
        title: 'Python & tools',
        items: [
          'Python basics: functions, lists, dictionaries and loops',
          'Running code in a notebook such as Jupyter or Google Colab',
        ],
      },
      {
        title: 'Math & ML ideas',
        items: [
          'Vectors and matrices as lists of numbers',
          'Averages, percentages and what a probability is',
        ],
      },
    ],
    'LLM Fundamentals': [
      {
        title: 'Python & tools',
        items: ['Python basics and installing packages with `pip`', 'Reading and writing JSON'],
      },
      {
        title: 'Math & ML ideas',
        items: [
          'Vectors, dot products and matrix multiplication',
          'A probability distribution that sums to 1 (what a softmax outputs)',
        ],
      },
    ],
    'Prompting & Context': [
      {
        title: 'Python & tools',
        items: [
          'Calling an HTTP API or a provider SDK from Python',
          'Keeping API keys in environment variables, never in code',
        ],
      },
      {
        title: 'GenAI concepts',
        items: [
          'What a token and a context window are',
          'The difference between a system message and a user message',
        ],
      },
    ],
    'RAG & Knowledge': [
      {
        title: 'Python & tools',
        items: [
          'Reading files and parsing JSON, HTML or PDF text',
          'Storing and querying vectors with a library such as FAISS or a hosted vector database',
        ],
      },
      {
        title: 'Math & ML ideas',
        items: ['Cosine similarity between two vectors', 'Precision and recall'],
      },
    ],
    'Agents & Tools': [
      {
        title: 'Python & tools',
        items: [
          'Writing small functions with typed arguments and docstrings',
          'Handling exceptions and timeouts when calling external services',
        ],
      },
      {
        title: 'GenAI concepts',
        items: [
          'Getting structured (JSON) output from a model',
          'Prompting basics: roles and examples',
        ],
      },
    ],
    'Fine-tuning & Optimization': [
      {
        title: 'Python & tools',
        items: [
          'PyTorch basics: tensors, a training loop and moving a model to a device',
          'A GPU notebook environment such as Google Colab',
        ],
      },
      {
        title: 'Math & ML ideas',
        items: [
          'Gradient descent and the learning rate',
          'Overfitting, and why a validation set exists',
        ],
      },
    ],
    'Evaluation & Safety': [
      {
        title: 'Python & tools',
        items: [
          'Looping over a test set and computing a metric in Python',
          'Calling an LLM from code and reading its raw output',
        ],
      },
      {
        title: 'Math & ML ideas',
        items: ['Accuracy, precision and recall', 'Why a small test set gives noisy results'],
      },
    ],
    'Multimodal & Generative Media': [
      {
        title: 'Python & tools',
        items: [
          'Loading and displaying images with Pillow or OpenCV',
          'Audio as a list of samples at a sample rate',
        ],
      },
      {
        title: 'Math & ML ideas',
        items: [
          'Tensors with a shape such as (batch, channels, height, width)',
          'What self-attention does, at a high level',
        ],
      },
    ],
    'Production & LLMOps': [
      {
        title: 'Python & tools',
        items: [
          'Building a small web API (for example with FastAPI)',
          'Docker and environment variables for configuration',
          'Reading logs and metrics',
        ],
      },
      {
        title: 'GenAI concepts',
        items: [
          'Calling an LLM provider and handling errors and timeouts',
          'Tokens, and why they drive cost',
        ],
      },
    ],
    '*': [
      { title: 'Python & tools', items: ['Python basics and calling an HTTP API'] },
      { title: 'GenAI concepts', items: ['What a token, an embedding and a prompt are'] },
    ],
  },
  customTopic: { brief: 'Custom lesson.', difficulty: 'Medium', prerequisites: [] },
  recentKey: 'genai-lab-recent-topics',
};
