/**
 * The drag handle glyph of the week organizer: six dots in a grid, the universal "grab here" mark (the old three-bar icon read
 * as a menu). `card` is two columns by three rows (a question's handle, a full-height strip on the card's left edge);
 * `week` is the same dots turned on their side, three columns by two rows, so a week's handle does not look like a card's.
 * Drawn in `currentColor`, so the button decides the colour.
 */
const DOT_RADIUS = 1.2;

const POSITIONS = {
  card: { xs: [5.5, 10.5], ys: [3.5, 8, 12.5] },
  week: { xs: [3.5, 8, 12.5], ys: [5.5, 10.5] },
} as const;

export default function GripIcon({
  variant = 'card',
  size = 14,
}: {
  variant?: 'card' | 'week';
  size?: number;
}) {
  const { xs, ys } = POSITIONS[variant];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
    >
      {ys.flatMap((y) => xs.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={DOT_RADIUS} />))}
    </svg>
  );
}
