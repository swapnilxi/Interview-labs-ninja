/**
 * Difficulty tags shared by every lab (DSA, CV, System Design), so a difficulty looks the same everywhere. One colour
 * per difficulty: Easy (and Easy-Medium) emerald, Medium amber, Medium-Hard orange, Hard rose, Mixed and anything
 * unknown slate (neutral, so it never reads as an accent chip under the default indigo accent). Tags are soft tinted
 * pills with a hairline ring; the colour sits in the tint and the dot, never in a heavy fill.
 *
 * These are SEMANTIC colours (they say how hard something is, not what is interactive), so the root carries
 * `data-semantic="difficulty"` and the accent-leak scan skips it. No imports from any lab module.
 *
 * Light-mode text is the -800 step (-700 for slate). Measured over the page, the card, the sidebar and an active row (a 12%
 * accent tint on the sidebar), the old -700 emerald is 4.16:1 on the sidebar and 3.62:1 on an active row, -700 rose is 3.99:1
 * on an active row, and amber-700 misses 4.5 by 0.01. Every pill below is >= 4.5:1 on all four surfaces, light and dark.
 * Moved here from `dsa-lab/ui.tsx` (which re-exports it).
 */

interface DifficultyTone {
  dot: string;
  pill: string;
}

const NEUTRAL_TONE: DifficultyTone = {
  dot: 'bg-slate-400',
  pill: 'bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-300',
};

function difficultyTone(difficulty: string): DifficultyTone {
  switch (difficulty.trim().toLowerCase()) {
    case 'easy':
    case 'easy-medium':
      return {
        dot: 'bg-emerald-500',
        pill: 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300',
      };
    case 'medium':
      return {
        dot: 'bg-amber-500',
        pill: 'bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300',
      };
    case 'medium-hard':
      return {
        dot: 'bg-orange-500',
        pill: 'bg-orange-500/10 text-orange-800 ring-orange-500/25 dark:text-orange-300',
      };
    case 'hard':
      return {
        dot: 'bg-rose-500',
        pill: 'bg-rose-500/10 text-rose-800 ring-rose-500/25 dark:text-rose-300',
      };
    default: // 'mixed' and anything unknown
      return NEUTRAL_TONE;
  }
}

/** The palette class for a difficulty's dot or bar segment (also takes the groups "Easy" / "Medium" / "Hard"). */
export function difficultyDotClass(difficulty: string): string {
  return difficultyTone(difficulty).dot;
}

/** Shared pill geometry: rounded-full, hairline inset ring. Add size, padding and tone yourself. */
export const LAB_PILL_BASE =
  'inline-flex items-center whitespace-nowrap rounded-full font-medium leading-none ring-1 ring-inset';

/** A difficulty as a soft tinted pill with a dot. Renders nothing for an empty string. */
export function DifficultyTag({
  difficulty,
  size = 'sm',
  className = '',
}: {
  difficulty: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!difficulty) return null;
  const tone = difficultyTone(difficulty);
  return (
    <span
      data-semantic="difficulty"
      className={`${LAB_PILL_BASE} ${size === 'md' ? 'gap-1.5 px-2.5 py-1 text-sm' : 'gap-1.5 px-2 py-[0.1875rem] text-xs'} ${tone.pill} ${className}`}
    >
      <span
        aria-hidden
        className={`shrink-0 rounded-full ${size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5'} ${tone.dot}`}
      />
      {difficulty}
    </span>
  );
}
