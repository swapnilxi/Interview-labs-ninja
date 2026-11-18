'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import { labConfig, type GuidedLab } from './labs';
import { fetchGuidedSummary } from './service';
import type { GuidedSummary } from './types';

/**
 * The "Guided Practice" card on a lab topic's page (every lab), under "Generate practice material". It is a real link: it
 * opens the lab's dedicated page (`/dsa-lab/guided-practice`, `/cv-lab/guided-practice`, ...) for this topic or subtopic, carrying
 * the lab view the topic was opened from so Back returns to the same place. With progress it shows where the learner is;
 * without, what the page offers.
 */
export default function GuidedPracticeCard({
  lab,
  topicId,
  subtopicId,
  name,
}: {
  lab: GuidedLab;
  topicId: string;
  subtopicId: string;
  name: string;
}) {
  const { get } = useUrlState();
  const [summary, setSummary] = useState<GuidedSummary | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSummary(undefined);
    fetchGuidedSummary(lab, topicId, subtopicId)
      .then((s) => live && setSummary(s))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [lab, topicId, subtopicId]);

  const weekView = get('view') === 'week';
  const href = buildUrl(labConfig(lab).pagePath, '', {
    topic: topicId,
    sub: subtopicId || null,
    view: weekView ? 'week' : null,
    organize: weekView && get('organize') === '1' ? '1' : null,
  });
  const started = !!summary && (summary.completed > 0 || summary.xp > 0);

  return (
    <Link
      href={href}
      aria-label={`Guided Practice for ${name}${started ? `, ${summary?.percent}% complete` : ''}`}
      className="todo-focus group lab-card lab-edge-link flex items-center gap-4 p-4 sm:p-[1.25rem]"
    >
      <span className="lab-tile h-11 w-11 shrink-0" aria-hidden="true">
        <Icon name="MapIcon" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug text-foreground">
          Guided Practice
        </span>
        {started && summary ? (
          <>
            <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
              <span className="tabular-nums">{summary.percent}%</span> complete · level{' '}
              <span className="tabular-nums">{summary.level}</span> ·{' '}
              <span className="tabular-nums">{summary.xp}</span> XP
            </span>
            <span
              className="mt-2 block h-1.5 overflow-hidden rounded-full mix-bg-foreground/10"
              role="progressbar"
              aria-label="Guided Practice progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.percent}
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${summary.percent}%` }}
              />
            </span>
          </>
        ) : (
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {labConfig(lab).cardLine}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium lab-ink">
        <span className="hidden sm:inline">{started ? 'Continue' : 'Start'}</span>
        <Icon
          name="ArrowRightIcon"
          size={18}
          className="transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
