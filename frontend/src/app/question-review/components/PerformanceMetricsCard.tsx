'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface AttemptHistory {
  date: string;
  score: number;
  timeSpent: string;
}

interface PerformanceMetricsCardProps {
  attempts: AttemptHistory[];
  improvementAreas: string[];
}

export default function PerformanceMetricsCard({
  attempts,
  improvementAreas,
}: PerformanceMetricsCardProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const latestScore = attempts[attempts.length - 1]?.score || 0;
  const firstScore = attempts[0]?.score || 0;
  const improvement = latestScore - firstScore;

  if (!isHydrated) {
    return (
      <div className="bg-card rounded-lg p-24 shadow-md border border-border">
        <div className="h-[200px] flex items-center justify-center">
          <div className="w-24 h-24 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-24 shadow-md border border-border">
      <div className="flex items-center gap-12 mb-24">
        <Icon
          name="ChartBarIcon"
          size={20}
          variant="outline"
          className="text-primary"
        />
        <h3 className="font-heading text-lg font-medium text-foreground">
          Performance Metrics
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-18 mb-24">
        <div className="bg-muted/50 rounded-md p-18">
          <div className="flex items-center gap-6 mb-6">
            <Icon name="TrophyIcon" size={16} variant="outline" className="text-accent" />
            <span className="text-xs font-caption text-muted-foreground">
              Latest Score
            </span>
          </div>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {latestScore}%
          </p>
        </div>

        <div className="bg-muted/50 rounded-md p-18">
          <div className="flex items-center gap-6 mb-6">
            <Icon
              name="ArrowTrendingUpIcon"
              size={16}
              variant="outline"
              className="text-success"
            />
            <span className="text-xs font-caption text-muted-foreground">
              Improvement
            </span>
          </div>
          <p className="font-heading text-2xl font-semibold text-success">
            +{improvement}%
          </p>
        </div>

        <div className="bg-muted/50 rounded-md p-18">
          <div className="flex items-center gap-6 mb-6">
            <Icon
              name="ClockIcon"
              size={16}
              variant="outline"
              className="text-secondary"
            />
            <span className="text-xs font-caption text-muted-foreground">
              Attempts
            </span>
          </div>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {attempts.length}
          </p>
        </div>
      </div>

      <div className="mb-24">
        <h4 className="text-sm font-medium text-foreground mb-12 font-heading">
          Attempt History
        </h4>
        <div className="space-y-12">
          {attempts.map((attempt, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-12 rounded-md bg-muted/30"
            >
              <div className="flex items-center gap-12">
                <span className="text-xs font-caption text-muted-foreground">
                  {attempt.date}
                </span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs font-caption text-muted-foreground">
                  {attempt.timeSpent}
                </span>
              </div>
              <span className="tabular-nums text-sm font-medium text-foreground">
                {attempt.score}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-foreground mb-12 font-heading">
          Focus Areas
        </h4>
        <div className="flex flex-wrap gap-6">
          {improvementAreas.map((area, index) => (
            <span
              key={index}
              className="px-12 py-6 rounded-md bg-warning/20 text-warning text-xs font-caption border border-warning/30"
            >
              {area}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}