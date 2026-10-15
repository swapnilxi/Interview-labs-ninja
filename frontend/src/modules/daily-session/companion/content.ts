/** Companion ("Deepu" the diya owl) lines and spiritual content. Plain data, easy to edit. */

export type Mood = 'happy' | 'cheer' | 'think' | 'comfort' | 'sleepy';

export interface Shloka {
  sanskrit: string; // IAST transliteration
  meaning: string;
  source: string;
}

/** Bhagavad Gita verses (verse numbers verified against standard editions). */
export const SHLOKAS: Shloka[] = [
  {
    sanskrit: 'karmaṇy-evādhikāras te mā phaleṣu kadācana',
    meaning: 'You have a right to the effort, never to its fruits. Do the practice, let go of the outcome.',
    source: 'Bhagavad Gita 2.47',
  },
  {
    sanskrit: 'samatvaṁ yoga ucyate',
    meaning: 'Evenness of mind, in success and in failure alike, is called yoga.',
    source: 'Bhagavad Gita 2.48',
  },
  {
    sanskrit: 'yogaḥ karmasu kauśalam',
    meaning: 'Yoga is skill in action. Every question you practise is a small yoga.',
    source: 'Bhagavad Gita 2.50',
  },
  {
    sanskrit: 'uddhared ātmanātmānaṁ nātmānam avasādayet',
    meaning: 'Lift yourself by your own effort; do not let yourself sink.',
    source: 'Bhagavad Gita 6.5',
  },
  {
    sanskrit: 'abhyāsena tu kaunteya vairāgyeṇa ca gṛhyate',
    meaning: 'The restless mind is steadied by steady practice (abhyāsa) and non-attachment.',
    source: 'Bhagavad Gita 6.35',
  },
];

export interface Mantra {
  deity: 'Saraswati' | 'Lakshmi' | 'Durga' | 'Shiva' | 'Ganesha';
  emoji: string;
  mantra: string;
  for: string;
}

export const MANTRAS: Record<Mantra['deity'], Mantra> = {
  Saraswati: { deity: 'Saraswati', emoji: '🪕', mantra: 'Oṃ Aiṃ Sarasvatyai Namaḥ', for: 'clear thinking and learning' },
  Lakshmi: { deity: 'Lakshmi', emoji: '🪷', mantra: 'Oṃ Śrīṃ Mahālakṣmyai Namaḥ', for: 'prosperity from honest work' },
  Durga: { deity: 'Durga', emoji: '🦁', mantra: 'Oṃ Dūṃ Durgāyai Namaḥ', for: 'courage on the hard ones' },
  Shiva: { deity: 'Shiva', emoji: '🔱', mantra: 'Oṃ Namaḥ Śivāya', for: 'a calm, steady mind' },
  Ganesha: { deity: 'Ganesha', emoji: '🐘', mantra: 'Oṃ Gaṃ Gaṇapataye Namaḥ', for: 'removing obstacles at the start' },
};

export const SARASWATI_VANDANA =
  'Sarasvatī namastubhyaṁ varade kāmarūpiṇi, vidyārambhaṁ kariṣyāmi siddhir bhavatu me sadā';

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export const greeting = (hour: number, name?: string) => {
  const n = name ? `, ${name}` : '';
  if (hour < 5) return `Burning the midnight diya${n}? Let's keep it gentle tonight.`;
  if (hour < 12) return `Good morning${n}! A fresh mind, a fresh diya. Ready?`;
  if (hour < 17) return `Namaste${n}! A little practice now makes the evening light.`;
  if (hour < 21) return `Good evening${n}! Let's light the lamp and learn something.`;
  return `Late-night learner${n}! Short and sweet session, okay?`;
};

export const LINES = {
  start: [
    "Let's go! I'll be right here on your shoulder.",
    'Deep breath in, deep breath out. Okay, first question!',
    "I believe in you. Honestly, 10,000 times more than you believe in yourself right now.",
  ],
  nailed: [
    'Boom! Saraswati is clapping on her veena.',
    'Look at you! Even my flame did a little dance.',
    "That's the stuff. Future-you says thank you.",
    'Nailed it! Do I get a dosa for being your lucky owl?',
  ],
  almost: [
    "So close! Almost is just 'yes' wearing a disguise.",
    "Good effort. One small nudge and it's locked in.",
    "You've got the bones. Let's add the muscle next time.",
  ],
  review: [
    "Hey, that's okay. Even a veena needs tuning. Let's mark it and come back stronger.",
    "Mistakes are just the mind stretching. I know you can do 10,000 times better, and I'll be here.",
    "Error? Bug? Great, that's where the learning hides. Breathe, then try again.",
    'Durga does not flinch at hard battles, and neither do you. We revisit this one together.',
  ],
  stuck: [
    "Stuck is a good sign: your brain is at its edge, right where it grows. Break it into tiny steps.",
    'Say the problem out loud in one sentence. Half of the answer usually shows up.',
    'Inputs, outputs, edge cases. Start with just one of them.',
  ],
  streakUp: [
    'Streak extended! The flame is getting brighter.',
    "Another day, another diya lit. Consistency is your superpower.",
  ],
  finish: [
    "Session complete! You showed up, and that's most of the battle.",
    "Done! Small daily steps are how great careers get built.",
  ],
  comeback: [
    'You came back. That is the whole secret.',
  ],
};

export const line = (k: keyof typeof LINES) => pick(LINES[k]);
export const randomShloka = () => pick(SHLOKAS);

export const MOODS = [
  { id: 'energised', emoji: '🔥', label: 'Energised', count: 15, tip: 'Love that energy! Let us take on something challenging.' },
  { id: 'calm', emoji: '😌', label: 'Calm', count: 10, tip: 'Calm mind, clear answers. A steady 10 it is.' },
  { id: 'tired', emoji: '😴', label: 'Tired', count: 5, tip: 'Tired is okay. Five gentle ones still count, and I will keep it light.' },
  { id: 'anxious', emoji: '😟', label: 'Anxious', count: 5, tip: 'Take one slow breath with me. We only need five, and we start easy.' },
] as const;
export type MoodId = (typeof MOODS)[number]['id'];

/** Which blessing to open with, based on the drill. */
export function blessingFor(difficulty: string, mood: MoodId): Mantra['deity'] {
  if (mood === 'anxious' || mood === 'tired') return 'Shiva';
  if (difficulty === 'Hard') return 'Durga';
  if (difficulty === 'Easy') return 'Ganesha';
  return 'Saraswati';
}
