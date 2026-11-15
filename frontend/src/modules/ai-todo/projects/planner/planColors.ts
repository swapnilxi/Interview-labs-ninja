/** One colour per phase or sprint (the timeline bar and the card's edge match), cycling after seven. */
const PHASE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];

export const colorOf = (index: number) => PHASE_COLORS[index % PHASE_COLORS.length];
