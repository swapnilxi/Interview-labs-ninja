import type { SectionDef } from '@/modules/common/lab/labSectionDefaults';
import type { TopicLabConfig } from '@/modules/common/lab/topicLabTypes';

/*
 * Python Lab: Python from the first program to professional, data and AI work. Topics are seeded from
 * backend/modules/python_lab/topics.json. Every section but Prerequisites (a template) and the Quiz is written by the
 * AI from the guidance below, which the lab settings show as each section's editable prompt.
 */

const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS lesson, as short bullets under these bold headings, in this order:
**Study these lessons first** - the earlier lessons in this lab it builds on.
**Python skills** - concrete language features it uses (for example list indexing and slicing, \`for\` loops with \`enumerate()\`, dictionary \`get()\`, defining a function with default arguments).
**Programming concepts** - the ideas to know first (for example mutability, references vs copies, recursion, what an exception is).
**Tools & setup** - only what the lesson actually needs (for example running a script from the terminal, a virtual environment, \`pip install\`, Jupyter).

Every bullet names ONE concrete skill, never a vague area like "basic Python". Put a tiny example in backticks where it helps. Use 6-12 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const PYTHON_SECTION_DEFS: readonly SectionDef[] = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    icon: 'AcademicCapIcon',
    subtitle: 'Python skills and concepts to have first',
    guidance: PREREQUISITES_GUIDANCE,
  },
  {
    id: 'concepts',
    label: 'Core Concepts',
    icon: 'LightBulbIcon',
    subtitle: 'What it is, the mental model and when to use it',
    aiGenerated: true,
    guidance:
      'Explain the topic as a mental model a beginner can hold in their head: what it is, the problem it solves, how it fits with what they already know, and when to reach for it. Define every term the first time it appears and keep code to tiny inline snippets here.',
  },
  {
    id: 'syntax',
    label: 'Syntax & Examples',
    icon: 'CodeBracketIcon',
    subtitle: 'Annotated code with the output it prints',
    aiGenerated: true,
    guidance:
      'Show the syntax with 3-5 short, runnable examples that build on each other, from the simplest case to a realistic one. Comment the important lines and show the exact output each example prints (as a `# Output:` comment or a fenced `text` block).',
  },
  {
    id: 'internals',
    label: 'How It Works Under the Hood',
    icon: 'CpuChipIcon',
    subtitle: 'Memory, objects and what Python actually does',
    aiGenerated: true,
    guidance:
      'Explain what Python does when this code runs: objects and references, how names are bound, the protocol or dunder methods involved, and the time cost of the key operations. Draw one small text diagram (names pointing to objects, a call stack, or a step-by-step trace) in a fenced `text` block.',
  },
  {
    id: 'exercises',
    label: 'Hands-On Exercises',
    icon: 'WrenchScrewdriverIcon',
    subtitle: 'Practice problems with solutions',
    aiGenerated: true,
    guidance:
      'Write 4 exercises of increasing difficulty that practise this topic. For each: a short task statement, an example input and the expected output, a one-line hint, then a clean solution in a fenced `python` block with a one-sentence explanation.',
  },
  {
    id: 'pitfalls',
    label: 'Common Mistakes & Gotchas',
    icon: 'BugAntIcon',
    subtitle: 'Bugs beginners hit and how to fix them',
    aiGenerated: true,
    guidance:
      'List the 5-7 most common mistakes and gotchas with this topic (for example mutable default arguments, modifying a list while iterating, `is` vs `==`), each with a tiny snippet that shows the bug, what it actually does, and the fix.',
  },
  {
    id: 'pythonic',
    label: 'Pythonic Style & Best Practices',
    icon: 'SparklesIcon',
    subtitle: 'Idioms, PEP 8 and readable code',
    aiGenerated: true,
    guidance:
      'Show the idiomatic way to use this feature: 3-5 before/after pairs (non-Pythonic -> Pythonic) with one line on why each is better, the relevant PEP 8 conventions, and when NOT to use the feature because a simpler alternative reads better.',
  },
  {
    id: 'realworld',
    label: 'Real-World Use',
    icon: 'BuildingOffice2Icon',
    subtitle: 'Where it shows up in apps, data and AI code',
    aiGenerated: true,
    guidance:
      'Give 3-5 places this topic shows up in real Python code (web backends such as FastAPI or Django, data work with pandas, machine learning and AI apps, scripting and automation), each with a short realistic snippet or the name of a well-known library that relies on it.',
  },
  {
    id: 'interview',
    label: 'Interview Questions',
    icon: 'ChatBubbleLeftRightIcon',
    subtitle: 'Conceptual, output-prediction and coding',
    aiGenerated: true,
    guidance:
      'Write 5 interview questions on this topic: two conceptual, one "what does this code print?" with the snippet written out, one debugging question, and one short coding task, each with a concise model answer (code in fenced `python` blocks).',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'TrophyIcon',
    subtitle: 'Predict-the-output and gotcha questions, generate more',
    guidance:
      'Focus on predicting what short snippets print, spotting bugs, how the feature works under the hood, and the Pythonic way to write it. Keep every snippet to 1-3 lines written inside the question.',
  },
  {
    id: 'references',
    label: 'References & Resources',
    icon: 'BookOpenIcon',
    subtitle: 'Official docs, tutorials and books',
    aiGenerated: true,
    guidance:
      'List the best resources for this topic (the official Python docs and tutorial, the relevant PEPs, Real Python, well-known books such as Fluent Python or Automate the Boring Stuff), each with one line on what to take from it. Never invent titles or URLs.',
  },
];

export const PYTHON_LAB: TopicLabConfig = {
  lab: 'python',
  guideKey: 'python',
  apiPrefix: '/python',
  shellLab: 'python',
  icon: 'CommandLineIcon',
  title: 'Python',
  labName: 'Python Lab',
  wikiTitle: 'Python Lab',
  wikiDescription:
    'Python from your first program to OOP, testing and concurrency, then data and AI apps',
  noun: { one: 'lesson', many: 'lessons' },
  sectionDefs: PYTHON_SECTION_DEFS,
  quizSettingsNote:
    'These instructions and your context are added to the requirements for each new batch of quiz questions.',
  ownPrereqTitle: 'Study these lessons first',
  prereqBaseline: {
    'Python Basics': [
      {
        title: 'Programming concepts',
        items: ['A program runs top to bottom, one statement at a time'],
      },
      {
        title: 'Tools & setup',
        items: [
          'Opening a terminal and running `python --version`',
          'Saving a file with a `.py` extension and running `python file.py`',
        ],
      },
    ],
    'Data Structures': [
      {
        title: 'Python skills',
        items: ['`for` loops over a sequence', 'Indexing from 0 and negative indexes like `a[-1]`'],
      },
      { title: 'Programming concepts', items: ['Mutable vs immutable values'] },
    ],
    'Functions & Modules': [
      {
        title: 'Python skills',
        items: ['Defining a function with `def` and returning a value', 'Lists and dictionaries'],
      },
      {
        title: 'Programming concepts',
        items: ['Scope: a variable defined inside a function is local to it'],
      },
    ],
    'Object-Oriented Python': [
      {
        title: 'Python skills',
        items: [
          'Functions with positional and keyword arguments',
          'Dictionaries as key-value records',
        ],
      },
      { title: 'Programming concepts', items: ['Grouping data with the functions that use it'] },
    ],
    'Files & Data': [
      {
        title: 'Python skills',
        items: [
          'Strings and string methods such as `split()` and `strip()`',
          'Lists and dictionaries, including nested ones',
        ],
      },
      { title: 'Tools & setup', items: ['Relative vs absolute file paths'] },
    ],
    'Testing & Tooling': [
      {
        title: 'Python skills',
        items: [
          'Writing small functions with clear inputs and outputs',
          'Importing from your own modules',
        ],
      },
      { title: 'Tools & setup', items: ['A virtual environment and `pip install`'] },
    ],
    'Advanced Python': [
      {
        title: 'Python skills',
        items: ['Functions, classes and generators', 'Big-O of list vs dict vs set lookups'],
      },
      {
        title: 'Programming concepts',
        items: ['The difference between waiting on I/O and doing CPU work'],
      },
    ],
    'Python for Data & AI': [
      {
        title: 'Python skills',
        items: ['List comprehensions', 'Working with nested dictionaries and JSON'],
      },
      { title: 'Programming concepts', items: ['Vectors and matrices as lists of numbers'] },
      {
        title: 'Tools & setup',
        items: ['Jupyter or Google Colab', '`pip install numpy pandas scikit-learn`'],
      },
    ],
    '*': [
      { title: 'Python skills', items: ['Variables, loops, functions, lists and dictionaries'] },
      { title: 'Tools & setup', items: ['Running a script and installing packages with `pip`'] },
    ],
  },
  customTopic: { brief: 'Custom lesson.', difficulty: 'Medium' },
  recentKey: 'python-lab-recent-topics',
};
