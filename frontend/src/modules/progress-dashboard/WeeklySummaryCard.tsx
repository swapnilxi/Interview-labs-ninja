import Icon from '@/components/ui/AppIcon';

interface WeeklyStat {
  label: string;
  value: string;
  icon: string;
  change: number;
}

interface WeeklySummaryCardProps {
  weekRange: string;
  stats: WeeklyStat[];
  focusAreas: string[];
}

export default function WeeklySummaryCard({
  weekRange,
  stats,
  focusAreas,
}: WeeklySummaryCardProps) {
  return (
    <div className="rounded-[20px] border mix-border-foreground/[0.07] bg-card p-4 shadow-card sm:p-24">
      <div className="flex items-center justify-between mb-24">
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">
            Weekly Summary
          </h3>
          <p className="text-sm text-muted-foreground font-caption mt-4">
            {weekRange}
          </p>
        </div>
        <Icon name="CalendarIcon" size={20} variant="outline" />
      </div>

      <div className="grid grid-cols-2 gap-18 mb-24">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-6">
            <div className="flex items-center gap-6">
              <Icon
                name={stat.icon as any}
                size={16}
                variant="outline"
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground font-caption">
                {stat.label}
              </p>
            </div>
            <div className="flex items-baseline gap-6">
              <p className="text-xl font-heading font-semibold text-foreground">
                {stat.value}
              </p>
              <span
                className={`text-xs font-medium ${
                  stat.change >= 0 ? 'text-success' : 'text-error'
                }`}
              >
                {stat.change >= 0 ? '+' : ''}
                {stat.change}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-18 border-t border-border">
        <p className="text-sm font-medium text-foreground mb-12">
          Suggested Focus Areas
        </p>
        <div className="flex flex-wrap gap-6">
          {focusAreas.map((area) => (
            <span
              key={area}
              className="px-12 py-6 rounded-md bg-accent/20 text-accent text-xs font-medium"
            >
              {area}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}