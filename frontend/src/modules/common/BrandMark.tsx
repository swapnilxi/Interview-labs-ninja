/**
 * The Lab-Ninja mark: a solid tile in the text colour with the four-point star knocked out and the accent at its
 * centre. It reads from the theme tokens (fill-foreground / fill-background / fill-primary), so it is ink-on-paper in
 * light mode, paper-on-ink in dark mode, and follows the Settings accent.
 */
export default function BrandMark({
  size = 30,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" className="fill-foreground" />
      <polygon
        points="20,7.2 23.1,16.9 32.8,20 23.1,23.1 20,32.8 16.9,23.1 7.2,20 16.9,16.9"
        className="fill-background"
      />
      <circle cx="20" cy="20" r="2.4" className="fill-primary" />
    </svg>
  );
}
