import type { SectionDef } from '@/modules/labs/common/labSectionDefaults';
import type { TopicLabConfig } from '@/modules/labs/common/topicLabTypes';

/*
 * Finance Lab: a beginner path from finance basics to AI in finance. Topics are seeded from
 * backend/modules/finance_lab/topics.json. Every section but Prerequisites (a template) and the Quiz is written by the
 * AI from the guidance below, which the lab settings show as each section's editable prompt.
 */

const PREREQUISITES_GUIDANCE = `List what a beginner should already know before THIS lesson, as short bullets under these bold headings, in this order:
**Study these lessons first** - the earlier lessons in this lab it builds on.
**Math & numeracy** - the specific maths it uses (for example percentages, percent change = (new - old) / old, averages, exponents for compounding).
**Finance concepts** - the ideas to know first (for example interest, inflation, assets vs liabilities, risk vs return).
**Tools & Python** - only what the lesson actually uses (for example spreadsheet formulas like \`=AVERAGE(B2:B13)\`, pandas \`read_csv\`, scikit-learn \`fit\` / \`predict\`, calling an API with a key).

Every bullet names ONE concrete skill, never a vague area like "math" or "Python". Put a tiny example in backticks where it helps. Use 6-12 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const FINANCE_SECTION_DEFS: readonly SectionDef[] = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    icon: 'AcademicCapIcon',
    subtitle: 'Maths, finance ideas and tools to have first',
    guidance: PREREQUISITES_GUIDANCE,
  },
  {
    id: 'concepts',
    label: 'Key Concepts in Plain English',
    icon: 'LightBulbIcon',
    subtitle: 'Definitions, intuition and why it matters',
    aiGenerated: true,
    guidance:
      'Explain the topic for a complete beginner: what it is, why it matters for a person or a business, and the 4-6 key terms, each defined in one plain sentence with an everyday analogy. Never use a term before defining it.',
  },
  {
    id: 'math',
    label: 'Formulas & Worked Numbers',
    icon: 'CalculatorIcon',
    subtitle: 'Step-by-step calculations with round numbers',
    aiGenerated: true,
    guidance:
      'Give the formulas this topic uses as plain text or inline code and say what every symbol means. Then work one example step by step with small round numbers (for example $1,000 at 5% for 3 years), showing each intermediate result. For an AI or data topic, show the key metric or calculation instead (for example accuracy vs precision on 100 loans).',
  },
  {
    id: 'visual',
    label: 'Visual Intuition',
    icon: 'PresentationChartLineIcon',
    subtitle: 'Diagrams, timelines and comparison tables',
    aiGenerated: true,
    guidance:
      'Make the idea visible: a small text diagram or timeline in a fenced `text` block (cash flows over time, how money moves between parties, or data -> features -> model -> decision), plus a short table that compares the main cases side by side.',
  },
  {
    id: 'spreadsheet',
    label: 'Spreadsheet Walkthrough',
    icon: 'TableCellsIcon',
    subtitle: 'Build it in Excel or Google Sheets',
    aiGenerated: true,
    guidance:
      'Show how to build this in a spreadsheet: the columns to create, the exact formulas (Excel / Google Sheets syntax such as `=FV(rate, nper, pmt, pv)` or `=AVERAGE(B2:B13)`) in a table of cell | formula | what it does, and the result for the example numbers. For a topic that does not fit a spreadsheet, show the closest useful table or checklist instead.',
  },
  {
    id: 'python',
    label: 'Python Hands-On',
    icon: 'CodeBracketIcon',
    subtitle: 'Beginner-friendly code you can run',
    aiGenerated: true,
    guidance:
      'Give a short, runnable Python example for someone new to coding: plain Python or pandas for the finance maths; scikit-learn for the machine-learning topics; a minimal LLM API call for the AI topics. Use small made-up sample data defined in the code (no live downloads), comment every few lines, and show the expected output.',
  },
  {
    id: 'ai',
    label: 'How AI Is Used Here',
    icon: 'SparklesIcon',
    subtitle: 'Where machine learning and LLMs fit in',
    aiGenerated: true,
    guidance:
      'Explain how AI and machine learning are used for this topic in practice: 2-4 concrete use cases (who uses it, what data goes in, what the model outputs, what decision it supports), a small project a beginner could build to practise, and the main limitation or risk of each use. If AI is a poor fit for this topic, say so and why.',
  },
  {
    id: 'pitfalls',
    label: 'Common Mistakes & Myths',
    icon: 'ExclamationTriangleIcon',
    subtitle: 'Beginner traps and bad assumptions',
    aiGenerated: true,
    guidance:
      'List the 5-7 most common beginner mistakes or myths about this topic (for AI and data topics include modelling mistakes such as look-ahead bias, leakage or trusting a backtest), each with why it is wrong and what to do instead.',
  },
  {
    id: 'realworld',
    label: 'Real-World Examples',
    icon: 'BuildingLibraryIcon',
    subtitle: 'Everyday cases, companies and markets',
    aiGenerated: true,
    guidance:
      'Give 3-5 real-world examples of this topic: everyday personal situations, well-known companies or market events, and how banks, fintechs or funds apply it. Keep any figures approximate and dated (for example "around 2023"), never present them as current data, and treat this as education, not personal financial advice.',
  },
  {
    id: 'interview',
    label: 'Interview Questions',
    icon: 'ChatBubbleLeftRightIcon',
    subtitle: 'Finance and fintech questions with answers',
    aiGenerated: true,
    guidance:
      'Write 5 interview questions on this topic as asked for entry-level finance, fintech or AI-in-finance roles: conceptual, a short calculation, and an applied "how would you approach..." question, each with a concise model answer.',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'TrophyIcon',
    subtitle: 'Quick checks, score tracked, generate more',
    guidance:
      'Focus on what the key terms mean, quick calculations with round numbers, reading a result correctly and common beginner misconceptions. For AI topics, ask what the model or code is doing and where it can go wrong.',
  },
  {
    id: 'references',
    label: 'Learn More',
    icon: 'BookOpenIcon',
    subtitle: 'Free courses, books and datasets',
    aiGenerated: true,
    guidance:
      'List the best beginner-friendly resources for this topic (free courses such as Khan Academy or Coursera, well-known books, the official pandas / scikit-learn docs, public datasets), each with one line on what to take from it. Never invent titles, authors or URLs.',
  },
];

export const FINANCE_LAB: TopicLabConfig = {
  lab: 'finance',
  guideKey: 'finance',
  apiPrefix: '/finance',
  shellLab: 'finance',
  icon: 'BanknotesIcon',
  title: 'Finance',
  labName: 'Finance Lab',
  wikiTitle: 'Finance Lab',
  wikiDescription:
    'From money basics and markets to Python, machine learning and LLMs in finance, for complete beginners',
  wikiNote: 'Educational content only, not financial advice.',
  noun: { one: 'lesson', many: 'lessons' },
  sectionDefs: FINANCE_SECTION_DEFS,
  ownPrereqTitle: 'Study these lessons first',
  prereqBaseline: {
    'Finance Basics': [
      {
        title: 'Math & numeracy',
        items: [
          'Percentages: 5% of 200 is 10',
          'Multiplying and dividing decimals',
          'Reading a small table of numbers',
        ],
      },
      {
        title: 'Tools & Python',
        items: ['A calculator, or a spreadsheet formula such as `=A1*1.05`'],
      },
    ],
    'Personal Finance': [
      {
        title: 'Math & numeracy',
        items: ['Percentages and monthly vs yearly amounts (yearly / 12)'],
      },
      { title: 'Finance concepts', items: ['Income vs expenses', 'Compound interest'] },
      { title: 'Tools & Python', items: ['A spreadsheet with `=SUM()` and simple formulas'] },
    ],
    'Markets & Investing': [
      {
        title: 'Math & numeracy',
        items: [
          'Percent change: (new - old) / old',
          'Averages and the idea of spread around an average',
        ],
      },
      { title: 'Finance concepts', items: ['Compound interest', 'The risk-return trade-off'] },
      { title: 'Tools & Python', items: ['Spreadsheet formulas `=AVERAGE()` and `=STDEV()`'] },
    ],
    'Business Finance': [
      {
        title: 'Math & numeracy',
        items: ['Ratios and percentages', 'Year-over-year growth rates'],
      },
      {
        title: 'Finance concepts',
        items: ['Revenue, costs and profit', 'Assets = Liabilities + Equity'],
      },
    ],
    'Data & Python for Finance': [
      {
        title: 'Math & numeracy',
        items: ['Mean and standard deviation', 'Percent change between two prices'],
      },
      { title: 'Finance concepts', items: ['A price series and daily returns'] },
      {
        title: 'Tools & Python',
        items: [
          'Python basics: variables, lists, loops and functions',
          'Installing packages with `pip install pandas`',
          'Running code in Jupyter or Google Colab',
        ],
      },
    ],
    'Machine Learning in Finance': [
      {
        title: 'Math & numeracy',
        items: ['Probabilities between 0 and 1', 'Linear regression as fitting a line'],
      },
      { title: 'Finance concepts', items: ['Why the future must never leak into training data'] },
      {
        title: 'Tools & Python',
        items: [
          'pandas DataFrames: selecting columns and filtering rows',
          'scikit-learn `fit` / `predict` and `train_test_split`',
        ],
      },
    ],
    'AI & LLMs in Finance': [
      {
        title: 'Finance concepts',
        items: ['Reading an income statement and a balance sheet at a basic level'],
      },
      {
        title: 'Tools & Python',
        items: [
          'What a large language model is, and what tokens and a context window are',
          'Embeddings as lists of numbers that capture meaning',
          'Calling an API from Python with an API key',
          'JSON as a data format',
        ],
      },
    ],
    '*': [
      { title: 'Math & numeracy', items: ['Percentages and percent change'] },
      {
        title: 'Tools & Python',
        items: ['Python basics and pandas', 'A notebook environment (Jupyter or Colab)'],
      },
    ],
  },
  customTopic: { brief: 'Custom lesson.', difficulty: 'Medium', prerequisites: [] },
  recentKey: 'finance-lab-recent-topics',
  guidedPractice: 'finance',
};
