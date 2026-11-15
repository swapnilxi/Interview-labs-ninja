'use client';

/**
 * Header of one block of four weeks on the organizer board. It sticks to the top of the board's scroll
 * pane as a thin glass strip (SPEC 4.7), so the block you are in stays named while you scroll: a real heading
 * ("Weeks 1–4"), the numbers, then a fixed-width progress line right beside them (not pushed to the far edge).
 * Progress line: planned slots (soft accent) with the solved ones on top (solid accent).
 */
export default function BlockHeader({
  id,
  label,
  planned,
  capacity,
  done,
}: {
  id: string;
  /** "Weeks 1–4" (or "Week 9" for a one-week block). */
  label: string;
  planned: number;
  /** Slots in the block: its weeks times 7. */
  capacity: number;
  done: number;
}) {
  const pct = (n: number) => `${capacity ? Math.min(100, (n / capacity) * 100) : 0}%`;
  return (
    <div className="dsa-glass-bar sticky top-0 z-10 -mx-[1rem] px-[1rem] py-2.5 md:-mx-[1.5rem] md:px-[1.5rem]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        <h2
          id={id}
          className="dsa-heading text-sm font-semibold normal-case leading-none text-foreground"
        >
          {label}
        </h2>
        <span className="text-[13px] font-medium tabular-nums mix-text-foreground/[0.74]">
          {planned} of {capacity} planned · {done} done
        </span>
        <span
          role="img"
          aria-label={`${planned} of ${capacity} slots planned, ${done} solved`}
          className="relative h-1.5 w-[10rem] max-w-full shrink-0 overflow-hidden rounded-full mix-bg-foreground/10"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full mix-bg-primary/35 transition-[width] duration-300"
            style={{ width: pct(planned) }}
          />
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300"
            style={{ width: pct(done) }}
          />
        </span>
      </div>
    </div>
  );
}
