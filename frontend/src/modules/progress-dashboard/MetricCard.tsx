import Icon from '@/components/ui/AppIcon';

interface MetricCardProps {
  title: string;
  value: string | number;
  /** Small text after the number ("/ 5", "days"). */
  unit?: string;
  /** The value is a placeholder (nothing measured yet): drawn in the faint ink. */
  empty?: boolean;
  subtitle: string;
  icon: string;
  /** Only for a change that is actually measured; nothing passes one today. */
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: 'primary' | 'secondary' | 'success' | 'accent';
}

// Each colour is a Daily Session tone (daily-session.css): action, reward and growth hues, no glow.
const toneOf = {
  primary: 'ds-tone-indigo',
  secondary: 'ds-tone-gold',
  success: 'ds-tone-jade',
  accent: 'ds-tone-gold',
};

/** One overview number: a small tinted symbol and label, the number large, a short note under it. */
export default function MetricCard({
  title,
  value,
  unit,
  empty = false,
  subtitle,
  icon,
  trend,
  color,
}: MetricCardProps) {
  return (
    <div className="ds-card ins-metric">
      <div className="ins-metric-label">
        <span className={`ds-icon-tile ${toneOf[color]}`} aria-hidden="true">
          <Icon name={icon} size={15} variant="solid" />
        </span>
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
