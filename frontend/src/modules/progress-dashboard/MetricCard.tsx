import Icon from '@/components/ui/AppIcon';

interface MetricCardProps {
  title: string;
  value: string | number;
  /** Small text after the number ("/ 5", "days"). */
  unit?: string;
  /** The value is a placeholder (nothing measured yet): drawn in the faint ink. */
  empty?: boolean;
  subtitle: string;
  /** Kept for callers; a stat card no longer draws a symbol (the label, the number and the note carry it). */
  icon?: string;
  /** Only for a change that is actually measured; nothing passes one today. */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** Kept for callers; stat cards are neutral (colour is for what changes, like a measured trend). */
  color?: 'primary' | 'secondary' | 'success' | 'accent';
}

/** One overview number: its label, the number large, a short note under it. */
export default function MetricCard({
  title,
  value,
  unit,
  empty = false,
  subtitle,
  trend,
}: MetricCardProps) {
  return (
    <div className="ds-card ins-metric">
      <div className="ins-metric-label">
        <span className="min-w-0">{title}</span>
        {trend && (
          <span
            className={`ml-auto inline-flex items-center gap-1 ds-num ds-tone-text ${trend.isPositive ? 'ds-tone-jade' : 'ds-tone-rose'}`}
          >
            <Icon
              name={trend.isPositive ? 'ArrowTrendingUpIcon' : 'ArrowTrendingDownIcon'}
              size={14}
              variant="outline"
            />
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <p className="ins-metric-value" data-empty={empty || undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </p>
      <p className="ins-metric-note">{subtitle}</p>
    </div>
  );
}
