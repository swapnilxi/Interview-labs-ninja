/**
 * The labs that have Guided Practice, and the few things that differ between them: where their pages live, which API lists their
 * topics, and some copy. The prompts have the same split on the server (fe-apis/guidedPractice/prompts.ts, PROFILES).
 *
 * Adding a lab = an entry here, its twin PROFILES entry and GUIDED_LABS on the server (both backends), a
 * `/<lab>-lab/guided-practice` route, and `guidedPractice: true` in the lab's TopicLabConfig (the card on its topic pages).
 */

export type GuidedLab = 'dsa' | 'cv';

export const GUIDED_LABS: readonly GuidedLab[] = ['dsa', 'cv'];

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
  },
};

/** The config of a lab; an unknown or missing lab (a document saved before there were two) is the DSA lab. */
export function labConfig(lab: string | null | undefined): GuidedLabConfig {
  return typeof lab === 'string' && Object.prototype.hasOwnProperty.call(LAB_CONFIGS, lab)
    ? LAB_CONFIGS[lab as GuidedLab]
    : LAB_CONFIGS.dsa;
}
