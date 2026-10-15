/** Small "Wk 2" tag for a question that sits in a week. Optional: a question in no week gets no pill. */
export default function WeekPill({
  week,
  className = '',
}: {
  week: number | null | undefined;
  className?: string;
}) {
  if (!week) return null;
  return (
    <span
      title={`Week ${week} of your study plan`}
      className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold leading-none whitespace-nowrap
        bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 ${className}`}
    >
      Wk {week}
    </span>
  );
}
