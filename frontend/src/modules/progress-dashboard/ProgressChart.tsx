'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import FlatIcon from '@/components/ui/FlatIcon';

interface ChartDataPoint {
  date: string;
  /** 0-100, or null when nothing in that category was rated that day (the line bridges the gap). */
  interview: number | null;
  cvSkill: number | null;
  overall: number | null;
}

interface ProgressChartProps {
  data: ChartDataPoint[];
  chartType: 'line' | 'area';
  /** id for the card heading, so the section can be labelled by it. */
  titleId?: string;
}

/**
 * Series colours: the dataviz reference palette's first two slots (blue, orange), which validate for colour-vision
 * deficiency in both themes — each theme has its own steps (validated on #ffffff and on #151b27). Recharts writes
 * colours as SVG attributes (no CSS variables), so the theme is read from <html class="dark">.
 */
const SERIES = {
  light: {
    interview: '#2a78d6',
    cvSkill: '#eb6834',
    axis: '#6b7385',
    grid: 'rgba(17, 24, 39, 0.07)',
    surface: '#ffffff',
  },
  dark: {
    interview: '#3987e5',
    cvSkill: '#e0652f',
    axis: '#8c94a4',
    grid: 'rgba(255, 255, 255, 0.06)',
    surface: '#151b27',
  },
} as const;

const NAMES = { interview: 'Interview', cvSkill: 'CV skills' } as const;

/** The theme, and the live accent (the hover cursor follows the Settings accent; series keep their categorical hues). */
function useChartTheme() {
  const [theme, setTheme] = useState({ isDark: false, accent: '' });
  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setTheme({
        isDark: root.classList.contains('dark'),
        accent: getComputedStyle(root).getPropertyValue('--color-primary').trim(),
      });
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// Values and names wear text colours; the coloured dot beside each carries the series identity.
interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  color?: string;
  value?: number | null;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((e) => e.value !== null && e.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="ins-tooltip">
      <p className="mb-1 font-semibold ds-ink">{label}</p>
      {rows.map((entry) => (
        <p key={String(entry.dataKey)}>
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <b>{entry.value}%</b>
        </p>
      ))}
    </div>
  );
}

/** The score trend card body: heading with its legend, then the chart, or a quiet empty state before any rating. */
export default function ProgressChart({ data, chartType, titleId }: ProgressChartProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { isDark, accent } = useChartTheme();
  const c = isDark ? SERIES.dark : SERIES.light;
  const cursor = { stroke: accent || c.axis, strokeOpacity: 0.45, strokeWidth: 1 };
  const empty = data.length === 0;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const axisProps = {
    stroke: c.axis,
    tickLine: false,
    axisLine: false,
    tickMargin: 8,
    style: { fontSize: '11.5px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' },
  };
  const activeDot = { r: 5, stroke: c.surface, strokeWidth: 2 };
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };
  const series = (['interview', 'cvSkill'] as const).map((key) => ({
    key,
    color: c[key],
    name: NAMES[key],
  }));

  return (
    <>
      <div className="ins-card-head mb-4">
        <div className="min-w-0">
          <h3 id={titleId}>Score trend</h3>
          <p>Your average self-rating per day, as a percentage</p>
        </div>
        {!empty && (
          <div className="flex items-center gap-4 pt-1" aria-label="Legend">
            {series.map((s) => (
              <span key={s.key} className="ins-key">
                <i style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {empty ? (
        <div className="ins-chart-empty">
          <span className="ds-icon-tile ds-tone-neutral" aria-hidden="true">
            <FlatIcon name="chart" size={20} />
          </span>
          <p className="ds-h3">No ratings yet</p>
          <p className="max-w-[34ch] text-[0.84rem] leading-relaxed ds-faint">
            Rate how you did on a question in Review, and your scores will show up here day by day.
          </p>
        </div>
      ) : !isHydrated ? (
        <div className="ins-chart ins-skel" aria-label="Loading chart" />
      ) : (
        <div className="ins-chart w-full" role="img" aria-label="Score trend chart">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={data} margin={margin}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps} minTickGap={24} />
                <YAxis {...axisProps} width={34} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                <Tooltip content={<ChartTooltip />} cursor={cursor} />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    name={s.name}
                    connectNulls
                    dot={{ fill: s.color, stroke: c.surface, strokeWidth: 2, r: 4 }}
                    activeDot={activeDot}
                  />
                ))}
              </LineChart>
            ) : (
              // Overlapping, not stacked: these are percentages, and a stack summed them past 100.
              <AreaChart data={data} margin={margin}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps} minTickGap={24} />
                <YAxis {...axisProps} width={34} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                <Tooltip content={<ChartTooltip />} cursor={cursor} />
                {series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={s.color}
                    fillOpacity={0.06}
                    name={s.name}
                    connectNulls
                    activeDot={activeDot}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
