/** Soft, modern per-topic hues (used with color-mix tints, never as flat fills). */
const HUES: Record<string, string> = {
  python: '#2dd4bf',
  'computer-vision': '#38bdf8',
  finance: '#60a5fa',
  ai: '#a78bfa',
  genai: '#f472b6',
  interview: '#fbbf24',
  quiz: '#fb7185',
  mixed: '#c084fc',
};

export function topicHue(topicId: string): string {
  return HUES[topicId] ?? '#818cf8';
}
