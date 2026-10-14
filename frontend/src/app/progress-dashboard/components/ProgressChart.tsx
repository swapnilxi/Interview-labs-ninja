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

export default function ProgressChart({ data, chartType }: ProgressChartProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <div className="w-full h-[300px] bg-muted rounded-lg animate-pulse flex items-center justify-center">
        <p className="text-muted-foreground font-caption">Loading chart...</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-12 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-6">{label}</p>
          {payload.map((entry: any) => (
            <p
              key={entry.dataKey}
              className="text-xs text-muted-foreground font-caption"
              style={{ color: entry.color }}
            >
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[300px]" aria-label="Progress Trend Chart">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
            <XAxis
              dataKey="date"
              stroke="#94A3B8"
              style={{ fontSize: '12px', fontFamily: 'inherit' }}
            />
            <YAxis
              stroke="#94A3B8"
              style={{ fontSize: '12px', fontFamily: 'inherit' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                fontSize: '12px',
                fontFamily: 'inherit',
              }}
            />
            <Line
              type="monotone"
              dataKey="interview"
              stroke="#2563EB"
              strokeWidth={2}
              name="Interview Skills"
              dot={{ fill: '#2563EB', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="cvSkill"
              stroke="#7C3AED"
              strokeWidth={2}
              name="CV Skills"
              dot={{ fill: '#7C3AED', r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="overall"
              stroke="#10B981"
              strokeWidth={2}
              name="Overall"
              dot={{ fill: '#10B981', r: 4 }}
            />
          </LineChart>
        ) : (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
            <XAxis
              dataKey="date"
              stroke="#94A3B8"
              style={{ fontSize: '12px', fontFamily: 'inherit' }}
            />
            <YAxis
              stroke="#94A3B8"
              style={{ fontSize: '12px', fontFamily: 'inherit' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{
                fontSize: '12px',
                fontFamily: 'inherit',
              }}
            />
            <Area
              type="monotone"
              dataKey="interview"
              stackId="1"
              stroke="#2563EB"
              fill="#2563EB"
              fillOpacity={0.6}
              name="Interview Skills"
            />
            <Area
              type="monotone"
              dataKey="cvSkill"
              stackId="1"
              stroke="#7C3AED"
              fill="#7C3AED"
              fillOpacity={0.6}
              name="CV Skills"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}