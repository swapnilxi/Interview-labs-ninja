import type { QuestionKind } from './types';

/**
 * The labs that have Guided Practice (every lab), and the few things that differ between them: where their pages live, which API
 * lists their topics, and some copy. The prompts have the same split on the server (fe-apis/guidedPractice/prompts.ts, PROFILES).
 * The key is the lab's key in its TopicLabConfig (`system_design`, not `system-design`).
 *
 * Adding a lab = an entry here, its twin PROFILES entry and GUIDED_LABS on the server (both backends), a
 * `/<lab>-lab/guided-practice` route (+ a `<Lab>GuidedPage` glue component), and `guidedPractice: '<lab>'` in the lab's TopicLabConfig
 * (the card on its topic pages).
 */

export type GuidedLab =
  'dsa' | 'cv' | 'system_design' | 'communication' | 'finance' | 'python' | 'genai';

export const GUIDED_LABS: readonly GuidedLab[] = [
  'dsa',
  'cv',
  'system_design',
  'communication',
  'finance',
  'python',
  'genai',
];

export interface GuidedLabConfig {
  lab: GuidedLab;
  /** "DSA Lab" */
  labName: string;
  /** The lab's own page: where Back returns to. */
  labPath: string;
  /** The Guided Practice page of the lab. */
  pagePath: string;
  /** The lab API that lists its topics. */
  topicsApi: string;
  /** What the lab calls one topic. */
  noun: string;
  /** The first paragraph of the start screen. */
  intro: string;
  /** The final boss, when the AI wrote none. */
  boss: (name: string) => { title: string; story: string; objective: string };
  /** One line on the card of the topic page. */
  cardLine: string;
  /** The boss card, once it is open. */
  bossLine: string;
  /** What the lab calls an exercise, for the tutor's "Give me a ___" and the empty workspace ("coding exercise"). */
  exerciseLabel: string;
  /** The Focus box's placeholder on the start screen, after "For example: ". */
  focusExample: string;
  /** What the learner keeps, on the start screen: "XP, levels, a coding streak and achievements". */
  progressLine: string;
  /** Whether the final boss must come with a coding exercise (it does where the lab is code: not for a scenario or a design). */
  bossExercise: boolean;
  /** How a STAR answer is described for a question kind where the default wording (the one DSA reads) does not fit the lab. */
  kindNotes?: Partial<Record<QuestionKind, string>>;
  /** Whether a STAR answer offers "Show code implementation" (Python only): every lab that runs Python, not the one that is all wording. */
  codeImplementation: boolean;
}

export const LAB_CONFIGS: Record<GuidedLab, GuidedLabConfig> = {
  dsa: {
    lab: 'dsa',
    labName: 'DSA Lab',
    labPath: '/dsa-lab',
    pagePath: '/dsa-lab/guided-practice',
    topicsApi: '/dsa/topics',
    noun: 'problem',
    intro:
      'Five phases take you from reading the problem to solving it, then a final boss: the whole problem in one go. Every question has a lesson, a coding exercise with tests that run in your browser, hints and an AI tutor.',
    boss: (name) => ({
      title: `Solve ${name} from scratch, as in an interview`,
      story: 'Everything you practised comes together in the whole problem.',
      objective: `Solve ${name} completely and explain its complexity.`,
    }),
    cardLine:
      'Work through this problem phase by phase, with a tutor, tests that run in your browser, and XP.',
    bossLine: 'The whole problem in one go',
    exerciseLabel: 'coding exercise',
    focusExample: 'I struggle with pointer problems',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: true,
    codeImplementation: true,
  },
  cv: {
    lab: 'cv',
    labName: 'CV Lab',
    labPath: '/cv-lab',
    pagePath: '/cv-lab/guided-practice',
    topicsApi: '/cv/topics',
    noun: 'topic',
    intro:
      'Five phases take you from the core idea to building it yourself, then a final boss: the whole topic, end to end. Every question has a lesson, a coding exercise in plain Python with tests that run in your browser, hints and an AI tutor.',
    boss: (name) => ({
      title: `Build ${name} end to end`,
      story: 'Everything you practised comes together in one closing challenge.',
      objective: `Implement the core of ${name} and explain how it behaves.`,
    }),
    cardLine:
      'Work through this topic phase by phase, with a tutor, plain-Python exercises that run in your browser, and XP.',
    bossLine: 'The whole topic, end to end',
    exerciseLabel: 'coding exercise',
    focusExample: 'I struggle with pointer problems',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: true,
    codeImplementation: true,
  },
  system_design: {
    lab: 'system_design',
    labName: 'System Design Lab',
    labPath: '/system-design-lab',
    pagePath: '/system-design-lab/guided-practice',
    topicsApi: '/system-design/topics',
    noun: 'problem',
    intro:
      'Five phases take you from clarifying the requirements to defending the trade-offs, then a final boss: the whole design, as in a design round. Every question has a lesson, hints and an AI tutor, and the ones about numbers have a short calculation or simulation with tests that run in your browser.',
    boss: (name) => ({
      title: `Design ${name} end to end`,
      story: 'Everything you practised comes together in the whole design.',
      objective: `Design ${name} completely and defend its trade-offs.`,
    }),
    cardLine:
      'Work through this design phase by phase, with a tutor, calculations that run in your browser, and XP.',
    bossLine: 'The whole design, as in a design round',
    exerciseLabel: 'calculation',
    focusExample: 'I find capacity estimation hard',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: false,
    codeImplementation: true,
    kindNotes: {
      implementation: 'a calculation walkthrough',
      algorithm: 'a step-by-step trace',
    },
  },
  communication: {
    lab: 'communication',
    labName: 'Communication Lab',
    labPath: '/communication-lab',
    pagePath: '/communication-lab/guided-practice',
    topicsApi: '/communication/topics',
    noun: 'lesson',
    intro:
      'Five phases take you from why the skill matters to using it in a realistic situation, then a final boss: a closing scenario that uses the whole skill. Every question has a lesson, practice you answer in your own words, hints and an AI coach.',
    boss: (name) => ({
      title: `Put ${name} to work in a realistic scenario`,
      story: 'Everything you practised comes together in one closing scenario.',
      objective: `Use ${name} in a realistic situation and explain your choices.`,
    }),
    cardLine:
      'Work through this lesson phase by phase, with a coach, practice in your own words, and XP.',
    bossLine: 'A realistic scenario that uses the whole skill',
    exerciseLabel: 'practice task',
    focusExample: 'I freeze when I have to give feedback',
    progressLine: 'XP, levels and achievements',
    bossExercise: false,
    codeImplementation: false,
    kindNotes: {
      implementation: 'a worked draft',
      algorithm: 'a step-by-step framework',
    },
  },
  finance: {
    lab: 'finance',
    labName: 'Finance Lab',
    labPath: '/finance-lab',
    pagePath: '/finance-lab/guided-practice',
    topicsApi: '/finance/topics',
    noun: 'lesson',
    intro:
      'Five phases take you from the core idea to working it with real numbers, then a final boss: a realistic case that applies the whole lesson. Every question has a lesson, hints and an AI tutor, and the calculation questions have a plain-Python exercise with tests that run in your browser. Educational content, not financial advice.',
    boss: (name) => ({
      title: `Apply ${name} to a realistic case`,
      story: 'Everything you practised comes together in one closing case.',
      objective: `Work a realistic case on ${name} with real numbers and explain what the result means.`,
    }),
    cardLine:
      'Work through this lesson phase by phase, with a tutor, plain-Python calculations in your browser, and XP.',
    bossLine: 'A realistic case with real numbers',
    exerciseLabel: 'calculation',
    focusExample: 'I get lost when percentages compound',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: true,
    codeImplementation: true,
    kindNotes: {
      implementation: 'a calculation walkthrough',
      algorithm: 'a worked calculation',
    },
  },
  python: {
    lab: 'python',
    labName: 'Python Lab',
    labPath: '/python-lab',
    pagePath: '/python-lab/guided-practice',
    topicsApi: '/python/topics',
    noun: 'lesson',
    intro:
      'Five phases take you from the core idea to writing it yourself, then a final boss: a small program that applies the whole lesson. Every question has a lesson, a coding exercise with tests that run in your browser, hints and an AI tutor.',
    boss: (name) => ({
      title: `Build a small program with ${name}`,
      story: 'Everything you practised comes together in one closing program.',
      objective: `Write a small program that uses ${name} well and explain how it works.`,
    }),
    cardLine:
      'Work through this lesson phase by phase, with a tutor, Python exercises that run in your browser, and XP.',
    bossLine: 'A small program that uses the whole lesson',
    exerciseLabel: 'coding exercise',
    focusExample: 'I mix up lists and tuples',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: true,
    codeImplementation: true,
  },
  genai: {
    lab: 'genai',
    labName: 'GenAI & AI Lab',
    labPath: '/genai-lab',
    pagePath: '/genai-lab/guided-practice',
    topicsApi: '/genai/topics',
    noun: 'lesson',
    intro:
      'Five phases take you from the mental model to building a minimal version, then a final boss: a closing challenge that builds or analyses a small piece of an AI system. Every question has a lesson, hints and an AI tutor, and some have a plain-Python exercise with tests that run in your browser.',
    boss: (name) => ({
      title: `Put ${name} to work in a small AI system`,
      story: 'Everything you practised comes together in one closing challenge.',
      objective: `Build or analyse a small piece of an AI system that uses ${name} and explain its trade-offs.`,
    }),
    cardLine:
      'Work through this lesson phase by phase, with a tutor, plain-Python exercises in your browser, and XP.',
    bossLine: 'A small AI system, end to end',
    exerciseLabel: 'coding exercise',
    focusExample: 'I do not see why retrieval beats a longer prompt',
    progressLine: 'XP, levels, a coding streak and achievements',
    bossExercise: true,
    codeImplementation: true,
    kindNotes: {
      algorithm: 'a step-by-step trace',
    },
  },
};

/** The config of a lab; an unknown or missing lab (a document saved before there were two) is the DSA lab. */
export function labConfig(lab: string | null | undefined): GuidedLabConfig {
  return typeof lab === 'string' && Object.prototype.hasOwnProperty.call(LAB_CONFIGS, lab)
    ? LAB_CONFIGS[lab as GuidedLab]
    : LAB_CONFIGS.dsa;
}
