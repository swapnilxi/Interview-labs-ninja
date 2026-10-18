'use client';

import { useId, useMemo, useState } from 'react';
import Markdown from '@/modules/common/lab/Markdown';
import { parseApproachTabs } from './parseApproaches';

const optimalPill =
  'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';

/**
 * The Approaches section as horizontal tabs, one per approach plus a Summary, in the order a learner
 * should meet them (each approach ends by pointing at the next). Falls back to the plain document when
 * the text has no recognisable approaches (a customised prompt can produce any shape).
 */
export default function ApproachTabs({ content }: { content: string }) {
  const parsed = useMemo(() => parseApproachTabs(content), [content]);
  const [selected, setSelected] = useState(0);
  const uid = useId();
  if (!parsed) return <Markdown content={content} />;

  const { preface, tabs } = parsed;
  const index = Math.min(selected, tabs.length - 1);
  const current = tabs[index];
  const tabId = (n: number) => `${uid}-tab-${n}`;
  const panelId = (n: number) => `${uid}-panel-${n}`;

  const go = (n: number, focus = false) => {
    setSelected(n);
    if (focus) document.getElementById(tabId(n))?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = tabs.length - 1;
    const target =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    go(target, true);
  };

  const prev = index > 0 ? tabs[index - 1] : null;
  const next = index < tabs.length - 1 ? tabs[index + 1] : null;

  return (
    <div>
      {preface && (
        <div className="mb-3">
          <Markdown content={preface} />
        </div>
      )}

      <div
        role="tablist"
        aria-label="Approaches, from first attempt to optimal"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {tabs.map((t, n) => {
          const active = n === index;
          return (
            <button
              key={t.id}
              id={tabId(n)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId(n)}
              tabIndex={active ? 0 : -1}
              onClick={() => go(n)}
              className={`flex-shrink-0 flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                active
                  ? 'border-primary text-primary mix-bg-primary/10'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span className="flex items-center gap-2 text-[12px] font-bold leading-tight whitespace-nowrap">
                {t.label}
                {t.optimal && <span className={optimalPill}>Optimal</span>}
              </span>
              {t.name && (
                <span className="text-[11px] font-medium leading-tight max-w-[22ch] truncate">
                  {t.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId(index)}
        aria-labelledby={tabId(index)}
        tabIndex={0}
        className="pt-3 focus:outline-none"
      >
        <Markdown content={current.body} />
      </div>

      {(prev || next) && (
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
          {prev ? (
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              ← {prev.label}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {next.kind === 'summary' ? 'Summary →' : `Next: ${next.label} →`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
