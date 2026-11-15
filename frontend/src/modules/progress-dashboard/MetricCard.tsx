import Icon from '@/components/ui/AppIcon';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: 'primary' | 'secondary' | 'success' | 'accent';
}

// `mix-*` (tailwind/mix-colors.js): theme colours are bare var()s, so `bg-primary/20` would compile to nothing.
const colorClasses = {
  primary: 'mix-bg-primary/15 lab-ink',
  secondary: 'mix-bg-secondary/15 text-secondary',
  success: 'mix-bg-success/15 text-success',
  accent: 'mix-bg-accent/15 text-accent',
};

/** A compact metric tile: icon and trend on top, the number large, the label under it (two to a row on phones). */
export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color,
}: MetricCardProps) {
  return (
    <div className="rounded-[20px] border mix-border-foreground/[0.07] bg-card p-4 shadow-card sm:p-[1.25rem]">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-[11px] ${colorClasses[color]}`}>
          <Icon name={icon as any} size={19} variant="outline" />
        </span>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${trend.isPositive ? 'text-success' : 'text-error'}`}
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
      <p className="mt-4 font-heading text-[1.75rem] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground sm:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{subtitle}</p>
    </div>
  );
}
