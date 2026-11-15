import Icon from '@/components/ui/AppIcon';
import { Tag } from './ui';

/** Small "Week 2" pill for a question that sits in a week. Optional: a question in no week gets no pill. */
export default function WeekPill({
  week,
  className = '',
}: {
  week: number | null | undefined;
  className?: string;
}) {
  if (!week) return null;
  return (
    <Tag
      tone="accent"
      title={`Week ${week} of your study plan`}
      className={`gap-1 tabular-nums ${className}`}
    >
      <Icon name="CalendarDaysIcon" size={12} aria-hidden="true" />
      Week {week}
    </Tag>
  );
}
