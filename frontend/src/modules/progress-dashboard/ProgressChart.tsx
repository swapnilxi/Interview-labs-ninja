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
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  interview: number;
  cvSkill: number;
  overall: number;
}

interface ProgressChartProps {
  data: ChartDataPoint[];
  chartType: 'line' | 'area';
}

/**
 * Series colours: the dataviz reference palette's first three slots (blue, orange, aqua), which validate all-pairs for
 * colour-vision deficiency in both themes — each theme has its own steps (validated on #ffffff and on #151b27). Recharts
 * writes colours as SVG attributes (no CSS variables), so the theme is read from <html class="dark">.
 */
const SERIES = {
  light: { interview: '#2a78d6', cvSkill: '#eb6834', overall: '#1baf7a', axis: '#5c6679', grid: 'rgba(17, 24, 39, 0.08)', surface: '#ffffff' },
  dark: { interview: '#3987e5', cvSkill: '#e0652f', overall: '#1baf7a', axis: '#929aaa', grid: 'rgba(255, 255, 255, 0.07)', surface: '#151b27' },
} as const;

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

export default function ProgressChart({ data, chartType }: ProgressChartProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { isDark, accent } = useChartTheme();
  const c = isDark ? SERIES.dark : SERIES.light;
  const cursor = { stroke: accent || c.axis, strokeOpacity: 0.55, strokeWidth: 1.5 };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <div className="skeleton flex h-[300px] w-full items-center justify-center rounded-[14px]">
        <p className="text-sm text-muted-foreground">Loading chart…</p>
      </div>
    );
  }

  // Values and names wear text colours; the coloured dot beside each carries the series identity.
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-[12px] border mix-border-foreground/10 bg-popover px-3 py-2.5 shadow-lg">
          <p className="mb-1.5 text-[13px] font-semibold text-foreground">{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
              <span>{entry.name}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">{entry.value}%</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const axisProps = {
    stroke: c.axis,
    tickLine: false,
    axisLine: false,
    style: { fontSize: '12px', fontFamily: 'inherit' },
  };
  const legendStyle = { fontSize: '12px', fontFamily: 'inherit', paddingTop: '8px' };
  const activeDot = { r: 6, stroke: c.surface, strokeWidth: 2 };

  return (
    <div className="w-full h-[300px]" aria-label="Progress Trend Chart">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} cursor={cursor} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
            <Line
              type="monotone"
              dataKey="interview"
              stroke={c.interview}
              strokeWidth={2}
              name="Interview Skills"
              dot={{ fill: c.interview, stroke: c.surface, strokeWidth: 2, r: 4 }}
              activeDot={activeDot}
            />
            <Line
              type="monotone"
              dataKey="cvSkill"
              stroke={c.cvSkill}
              strokeWidth={2}
              name="CV Skills"
              dot={{ fill: c.cvSkill, stroke: c.surface, strokeWidth: 2, r: 4 }}
              activeDot={activeDot}
            />
            <Line
              type="monotone"
              dataKey="overall"
              stroke={c.overall}
              strokeWidth={2}
              name="Overall"
              dot={{ fill: c.overall, stroke: c.surface, strokeWidth: 2, r: 4 }}
              activeDot={activeDot}
            />
          </LineChart>
        ) : (
          // Overlapping, not stacked: these are percentages, and a stack summed them past 100.
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis {...axisProps} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} cursor={cursor} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
            <Area
              type="monotone"
              dataKey="interview"
              stroke={c.interview}
              strokeWidth={2}
              fill={c.interview}
              fillOpacity={0.14}
              name="Interview Skills"
              activeDot={activeDot}
            />
            <Area
              type="monotone"
              dataKey="cvSkill"
              stroke={c.cvSkill}
              strokeWidth={2}
              fill={c.cvSkill}
              fillOpacity={0.14}
              name="CV Skills"
              activeDot={activeDot}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
