import type { SectionDef } from '@/modules/common/lab/labSectionDefaults';
import type { TopicLabConfig } from '@/modules/common/lab/topicLabTypes';

/*
 * Communication Lab: Business English, Effective Communication and Leadership. Topics are seeded from
 * backend/modules/communication_lab/topics.json. Every section but Prerequisites (a template) and the Quiz is written
 * by the AI from the guidance below, which the lab settings show as each section's editable prompt.
 */

const PREREQUISITES_GUIDANCE = `List what a learner should already be able to do before THIS lesson, as short bullets under these bold headings, in this order:
**Study these lessons first** - the earlier lessons in this lab it builds on.
**Language skills** - the specific English the lesson relies on (for example forming polite questions with "Could you...", the present perfect for updates, common meeting vocabulary).
**Communication skills** - the specific habits it builds on (for example stating the purpose of a message in one sentence, paraphrasing what someone said).
**Mindset & habits** - attitudes that help (for example asking for feedback, rehearsing before an important conversation).

Every bullet names ONE concrete skill, never a vague area like "good English". Use 6-12 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const COMMUNICATION_SECTION_DEFS: readonly SectionDef[] = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    icon: 'AcademicCapIcon',
    subtitle: 'Language and communication skills to have first',
    guidance: PREREQUISITES_GUIDANCE,
  },
  {
    id: 'core',
    label: 'Key Ideas',
    icon: 'LightBulbIcon',
    subtitle: 'What this skill is and why it matters',
    aiGenerated: true,
    guidance:
      'Explain what this skill is, why it matters at work, and the 3-5 principles behind it, each with a one-line example from a real workplace situation. Define any term the first time it appears, and keep the English simple enough for a non-native speaker.',
  },
  {
    id: 'framework',
    label: 'Frameworks & Structure',
    icon: 'RectangleGroupIcon',
    subtitle: 'Step-by-step models you can reuse',
    aiGenerated: true,
    guidance:
      'Give the one or two frameworks or structures that make this skill repeatable (for example STAR, SBI, BLUF, SCQA, GROW or a simple opening-body-close), as numbered steps with a short worked example for each step. Show the structure as a small text diagram in a fenced `text` block.',
  },
  {
    id: 'phrases',
    label: 'Useful Phrases & Vocabulary',
    icon: 'ChatBubbleBottomCenterTextIcon',
    subtitle: 'Say this, not that',
    aiGenerated: true,
    guidance:
      'Give a table of 10-15 useful phrases for this skill: situation | say this | avoid this | why. Mark the formality of each phrase (formal / neutral / informal). Then list 5 key words or expressions with a one-line meaning and an example sentence, and explain any idiom a non-native speaker may not know.',
  },
  {
    id: 'examples',
    label: 'Worked Examples',
    icon: 'DocumentTextIcon',
    subtitle: 'Weak vs strong versions, and what changed',
    aiGenerated: true,
    guidance:
      'Show 2-3 realistic examples (an email, a chat message, a spoken reply or a meeting moment). For each give a weak version, a strong version, and 2-4 bullets on exactly what changed and why it works better. Put written messages in fenced `text` blocks.',
  },
  {
    id: 'practice',
    label: 'Practice Scenarios',
    icon: 'UserGroupIcon',
    subtitle: 'Role-plays with model answers',
    aiGenerated: true,
    guidance:
      'Write 3 practice scenarios of increasing difficulty. For each: the situation in 2-3 sentences, who the learner is talking to and what they want, then a model answer, and 2 follow-up curveballs the other person might throw with a short note on how to handle each.',
  },
  {
    id: 'pitfalls',
    label: 'Common Mistakes',
    icon: 'ExclamationTriangleIcon',
    subtitle: 'What goes wrong and how to fix it',
    aiGenerated: true,
    guidance:
      'List the 5-7 most common mistakes with this skill, including typical non-native speaker errors where relevant: the mistake, how it comes across to the listener, and the fix, each with a short before/after example.',
  },
  {
    id: 'audience',
    label: 'Adapting to Audience & Culture',
    icon: 'GlobeAltIcon',
    subtitle: 'Managers, clients, teams, cultures, remote',
    aiGenerated: true,
    guidance:
      'Explain how this skill changes with the audience: talking to a senior leader vs a peer vs a direct report vs a client; high-context vs low-context cultures (for example India, the US, Germany, Japan); and writing vs speaking live vs on video. Use a small table where it helps.',
  },
  {
    id: 'interview',
    label: 'Interview Questions',
    icon: 'ChatBubbleLeftRightIcon',
    subtitle: 'Behavioural questions with model answers',
    aiGenerated: true,
    guidance:
      'Write 5 interview questions that test this skill (behavioural, situational and one short role-play), each with what the interviewer is really looking for and a concise model answer, in the STAR format where it fits.',
  },
  {
    id: 'drills',
    label: 'Daily Drills & Self-Check',
    icon: 'CalendarDaysIcon',
    subtitle: 'A 7-day practice plan and a rubric',
    aiGenerated: true,
    guidance:
      'Give a 7-day practice plan of 10-15 minute drills for this skill (one line per day, each something the learner can do alone or with a colleague), then a self-assessment rubric as a table: criterion | beginner | competent | strong.',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'TrophyIcon',
    subtitle: 'Scenario questions, score tracked, generate more',
    guidance:
      'Focus on judgement in realistic workplace situations: which reply, phrase or approach works best, what is wrong with a message, and which framework fits. Include a few business English word-choice questions when the lesson is about language.',
  },
  {
    id: 'references',
    label: 'Books & Resources',
    icon: 'BookOpenIcon',
    subtitle: 'Books, free courses and practice material',
    aiGenerated: true,
    guidance:
      'List the best study resources for this skill (well-known books, free courses, podcasts, practice sites), each with one line on what to take from it. Prefer widely available sources, and never invent titles, authors or URLs.',
  },
];

export const COMMUNICATION_LAB: TopicLabConfig = {
  lab: 'communication',
  guideKey: 'communication',
  apiPrefix: '/communication',
  shellLab: 'communication',
  icon: 'ChatBubbleOvalLeftEllipsisIcon',
  title: 'Communication',
  labName: 'Communication Lab',
  wikiTitle: 'Communication Lab',
  wikiDescription:
    'Business English, effective communication and leadership, with scripts, role-plays and practice drills',
  noun: { one: 'lesson', many: 'lessons' },
  sectionDefs: COMMUNICATION_SECTION_DEFS,
  quizSettingsNote:
    'These instructions and your context are added to the requirements for each new batch of quiz questions.',
  ownPrereqTitle: 'Study these lessons first',
  prereqBaseline: {
    'Business English': [
      {
        title: 'Language skills',
        items: [
          'Reading and writing English at an intermediate (B1-B2) level',
          'Forming polite questions: "Could you...?", "Would it be possible to...?"',
          'Present simple, past simple and present perfect for talking about work',
        ],
      },
      {
        title: 'Communication skills',
        items: ['Knowing the purpose of your message before you write or speak'],
      },
      { title: 'Mindset & habits', items: ['Reading a message aloud once before sending it'] },
    ],
    'Effective Communication': [
      {
        title: 'Communication skills',
        items: [
          'Stating your main point in one sentence',
          'Asking a clarifying question instead of guessing',
          'Noticing whether the other person is following you',
        ],
      },
      {
        title: 'Mindset & habits',
        items: ["Being curious about the other person's view", 'Pausing before you reply'],
      },
    ],
    Leadership: [
      {
        title: 'Communication skills',
        items: [
          'Active listening: paraphrasing what you heard',
          'Giving specific, behaviour-based feedback',
          'Explaining the reason behind a request',
        ],
      },
      {
        title: 'Mindset & habits',
        items: ['Owning mistakes openly', 'Being consistent: doing what you said you would do'],
      },
    ],
    '*': [
      {
        title: 'Communication skills',
        items: [
          'Stating your main point in one sentence',
          'Asking a clarifying question instead of guessing',
        ],
      },
    ],
  },
  customTopic: { brief: 'Custom lesson.', difficulty: 'Medium' },
  recentKey: 'communication-lab-recent-topics',
};
