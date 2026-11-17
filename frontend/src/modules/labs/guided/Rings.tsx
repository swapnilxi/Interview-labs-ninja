'use client';

import { useEffect, useState } from 'react';

/**
 * Three concentric rings, as on an activity tracker: the path (outer), today's goal (middle) and the progress through the
 * current level (inner), with the level number in the middle. One hue in three weights; the arcs fill from empty the first
 * time they are seen, and every change after that tweens.
 */
const SIZE = 148;
const MID = SIZE / 2;
const RINGS = [
  { ring: 1, r: 62 },
  { ring: 2, r: 46 },
  { ring: 3, r: 30 },
] as const;
const STROKE = 12;

export default function Rings({
  path,
  today,
  level,
  levelNumber,
  label,
}: {
  /** 0..1 each */
  path: number;
  today: number;
  level: number;
  levelNumber: number;
  label: string;
}) {
  // Arcs start empty and are set on the next frame, so the CSS transition draws them in.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const values = [path, today, level];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {RINGS.map(({ ring, r }, i) => {
        const c = 2 * Math.PI * r;
        const value = ready ? Math.min(1, Math.max(0, values[i])) : 0;
        return (
          <g key={ring} transform={`rotate(-90 ${MID} ${MID})`}>
            <circle className="gp-ring-track" cx={MID} cy={MID} r={r} strokeWidth={STROKE} />
            <circle
              className="gp-ring-arc"
              data-ring={ring}
              cx={MID}
              cy={MID}
              r={r}
              strokeWidth={STROKE}
              strokeDasharray={c}
              strokeDashoffset={c * (1 - value)}
              // A ring with nothing in it draws no cap at all, instead of a dot at 12 o'clock.
              opacity={value > 0 ? 1 : 0}
            />
          </g>
        );
      })}
      <text
        x={MID}
        y={MID}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="600"
        style={{ fill: 'var(--color-foreground)', fontVariantNumeric: 'tabular-nums' }}
      >
        {levelNumber}
      </text>
    </svg>
  );
}
