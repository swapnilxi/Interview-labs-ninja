interface WeeklyStat {
  label: string;
  value: string;
  /** Small text after the value ("/ 7"). */
  unit?: string;
  /** Only for a change that is actually measured against last week; nothing passes one today. */
  change?: number;
}

interface WeeklySummaryCardProps {
  weekRange: string;
  stats: WeeklyStat[];
  /** Only real, computed suggestions; the card shows nothing when there are none. */
  focusAreas?: string[];
}

/** This week at a glance: four small stat tiles under the week's dates. */
export default function WeeklySummaryCard({
  weekRange,
  stats,
  focusAreas = [],
}: WeeklySummaryCardProps) {
  return (
    <section className="ds-card p-4" aria-labelledby="ins-week-title">
      <div className="ins-card-head">
        <h3 id="ins-week-title">This week</h3>
        <span className="pt-0.5 text-[0.8rem] font-medium ds-faint ds-num whitespace-nowrap">
          {weekRange}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="ds-stat-tile">
            <dt>{stat.label}</dt>
            <dd>
              {stat.value}
              {stat.unit && (
                <span className="ml-1 text-[0.8rem] font-medium ds-faint">{stat.unit}</span>
              )}
              {stat.change !== undefined && (
                <span
                  className={`ml-1.5 text-[0.75rem] font-medium ds-tone-text ${stat.change >= 0 ? 'ds-tone-jade' : 'ds-tone-rose'}`}
                >
                  {stat.change >= 0 ? '+' : ''}
                  {stat.change}%
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {focusAreas.length > 0 && (
        <div className="mt-4 border-t ds-hairline pt-3">
          <p className="mb-2 text-[0.8rem] font-medium ds-muted">Suggested focus</p>
          <div className="flex flex-wrap gap-1.5">
            {focusAreas.map((area) => (
              <span key={area} className="ds-chip ds-tone-indigo">
                {area}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
