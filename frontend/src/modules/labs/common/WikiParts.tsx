'use client';

/**
 * Wiki building blocks shared by the DSA, CV and System Design wikis: the hero (identity, metrics, progress), the index
 * panel, the section heading, and the card / chip class strings. Every colour is a theme token, so light/dark and every
 * Settings accent follow live; the only fixed hues are the difficulty dots (semantic, `data-semantic="difficulty"`).
 *
 * Class-string rules: theme-colour opacity goes through `mix-*`, rem spacing is written `[1.5rem]` (the spacing keys
 * 6/12/18/24/... are pixels in this repo), small accent text is `lab-ink` (>= 4.5:1 for every preset), weights are 500 body /
 * 600 titles and labels (never 700), and a name is never cut with an ellipsis: it wraps.
 *
 * Data hooks for tests and the accent-leak scan: `data-wiki-hero`, `data-wiki-metrics`, `data-wiki-progress`,
 * `data-wiki-index`, `data-wiki-index-list`.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { jumpToAnchor } from '@/modules/labs/common/labNavigation';
import { difficultyDotClass } from '@/modules/labs/common/LabTags';

/* ───────────────────────────── 1. hero: identity, metrics, progress ───────────────────────────── */

/** The three hues of a lab, as whole class names (a class built from a template string is purged by Tailwind's scanner). */
const LAB_HUES = ['lab-hue-1', 'lab-hue-2', 'lab-hue-3'];

export interface WikiMetric {
  label: string;
  value: number;
  /** Semantic dot for difficulty only (the number stays plain). Every other metric takes the next of the lab's three hues
   *  (`lab-hue-1..3`: identity and its two companions) for its number and key dot. */
  tone?: 'easy' | 'medium' | 'hard';
}

/**
 * The hero: identity (tile, title, description), then the compact metrics, then the overall progress, all in ONE surface.
 * `.lab-hero` (tailwind.css) is the card with the signature wash, tinted by `--lab-identity` (the Settings accent for DSA,
 * teal for CV, amber for System Design). Secondary text is the foreground mix, not `text-muted-foreground`: the muted
 * colour fails contrast on the wash. Anyone adding a line to the hero must do the same.
 */
export function WikiHero({
  icon,
  title,
  description,
  metrics,
  children,
  onOpenGuide,
  managementHref,
  guideLabel = 'How to use this lab',
}: {
  /** A Heroicons name for AppIcon, e.g. 'BookOpenIcon' (DSA), 'EyeIcon' (CV), 'ServerStackIcon' (System Design). */
  icon: string;
  title: string;
  description: string;
  metrics: WikiMetric[];
  /** The progress row (`<LabProgressSummary />`). Rendered under a hairline. */
  children?: ReactNode;
  /** Callback to open the lab guide modal */
  onOpenGuide?: () => void;
  /** The lab's management page (a gear next to the guide button). */
  managementHref?: string;
  /** Label for the guide button */
  guideLabel?: string;
}) {
  return (
    // .lab-hero = relative + overflow-hidden + the ::before wash (tailwind.css). Its children sit in a `relative` wrapper so
    // they paint above the ::before.
    <header className="lab-hero" data-wiki-hero>
      <div className="relative">
        <div className="flex items-center gap-[1rem]">
          {/* Phones: the large title carries the identity; the tile would push the title off its gutter. */}
          <span
            aria-hidden="true"
            className="lab-tile lab-tile-duo hidden h-11 w-11 sm:inline-flex"
          >
            <Icon name={icon} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="break-words text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-2xl sm:font-semibold">
                {title}
              </h1>
              {onOpenGuide && (
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:mix-border-primary/40"
                >
                  <Icon name="BookOpenIcon" size={14} className="lab-ink flex-shrink-0" />
                  <span>{guideLabel}</span>
                </button>
              )}
              {managementHref && (
                <Link
                  href={managementHref}
                  aria-label="Lab management"
                  title="Lab management"
                  className="todo-focus inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:mix-border-primary/40 hover:text-foreground"
                >
                  <Icon name="Cog6ToothIcon" size={16} />
                </Link>
              )}
            </div>
            <p className="mt-1 text-sm font-medium leading-snug mix-text-foreground/[0.74]">
              {description}
            </p>
          </div>
        </div>

        {/* Compact metrics: inline numbers with hairline dividers. The -ml + overflow-hidden pair clips the first divider on
            every wrapped row, so a divider never dangles. */}
        {/* Phones: a three-column stat grid, value over label. From sm: inline numbers with hairline dividers. */}
        <div className="mt-[1.25rem] overflow-hidden">
          <dl
            data-wiki-metrics
            aria-label="The lab at a glance"
            className="grid grid-cols-3 gap-x-3 gap-y-4 sm:-ml-[1rem] sm:flex sm:flex-wrap sm:gap-y-[0.5rem]"
          >
            {metrics.map((m, i) => {
              // Counts take the lab's hues in turn (identity, then its two companions); a difficulty keeps its semantic dot.
              const hue = m.tone
                ? ''
                : LAB_HUES[metrics.slice(0, i).filter((x) => !x.tone).length % 3];
              return (
                <div
                  key={m.label}
                  className={`flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-[0.5rem] sm:border-l sm:border-border sm:px-[1rem] ${hue}`}
                >
                  <dt className="order-2 inline-flex items-center gap-1.5 text-xs font-medium mix-text-foreground/[0.74]">
                    {m.tone ? (
                      <span
                        aria-hidden="true"
                        data-semantic="difficulty"
                        className={`h-1.5 w-1.5 rounded-full ${difficultyDotClass(m.tone)}`}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        data-semantic="identity"
                        className="lab-hue-dot h-1.5 w-1.5 rounded-full"
                      />
                    )}
                    {m.label}
                  </dt>
                  <dd
                    className={`order-1 text-[1.375rem] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-lg sm:tracking-normal ${
                      m.tone ? 'text-foreground' : 'lab-hue-ink'
                    }`}
                  >
                    {m.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        {children && (
          <div data-wiki-progress className="mt-[1.25rem] border-t border-border pt-[1rem]">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

/* ───────────────────────────── 2. the index: the page's main block ───────────────────────────── */

export interface WikiIndexItem {
  name: string;
  count: number;
  /** '#pattern-Two-Pointers' etc. Each lab keeps its own anchor scheme. */
  href: string;
}

/**
 * The index: a numbered list of anchor links to every section, the page's main block. Rows are at least 40px high, names wrap
 * (never an ellipsis) and the number and count columns stay aligned on the first line. Columns follow the panel's width, not
 * the window's, because the side panes take a varying share of it.
 */
export function WikiIndexNav({
  id,
  title,
  countLabel,
  items,
}: {
  id: string;
  title: string;
  /** '20 patterns' / '14 categories' */
  countLabel: string;
  items: WikiIndexItem[];
}) {
  return (
    <nav data-wiki-index aria-labelledby={id}>
      <div className="mb-[0.75rem] flex items-baseline justify-between gap-[0.75rem]">
        <h2 id={id} className="text-base font-semibold leading-snug text-foreground">
          {title}
        </h2>
        <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {countLabel}
        </span>
      </div>
      {/* Wide columns (19rem) so most names fit on one line; the rest wrap and the rows grow with them. Each row is a tile (soft fill + a hairline that still reads on a dimmed screen) so the rows read as separate items; hover = the accent tint. */}
      <ol
        data-wiki-index-list
        className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-[0.5rem] rounded-lg border bg-card p-[0.5rem] lab-edge"
      >
        {items.map((item, i) => (
          <li key={item.href}>
            <a
              href={item.href}
              onClick={jumpToAnchor}
              className="todo-focus group flex h-full min-h-[2.5rem] items-baseline gap-[0.75rem] rounded-md border mix-border-foreground/[0.22] mix-bg-foreground/[0.07] px-[1rem] py-[0.5625rem] text-sm font-medium text-foreground transition-smooth hover:mix-border-primary/50 hover:mix-bg-primary/[0.12]"
            >
              <span
                aria-hidden="true"
                className="w-[1.5rem] flex-shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 break-words leading-snug transition-colors group-hover:lab-ink">
                {item.name}
              </span>
              <span className="w-[1.5rem] flex-shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {item.count}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ───────────────────────────── 3. section heading + card shell + chips ───────────────────────────── */

/**
 * One heading style for every pattern / category section: name, hairline, count. Flush left with the cards and the index
 * panel. A long name wraps; the hairline keeps at least 1rem and centres on the block.
 */
export function WikiSectionHeading({
  id,
  name,
  count,
}: {
  id: string;
  name: string;
  /** '4 questions' / '6 topics' / '5 problems' */
  count: string;
}) {
  return (
    <div className="flex items-baseline gap-[0.75rem]">
      <h2
        id={id}
        className="min-w-0 break-words text-base font-semibold leading-snug text-foreground"
      >
        {name}
      </h2>
      <span aria-hidden="true" className="h-px min-w-[1rem] flex-1 self-center bg-border" />
      <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/**
 * Card shell for a question / topic / problem in the wiki. Replaces `display-card` (shared with Career Studio, carries a
 * shadow, a lift and a glow): a soft lab-hue glow edge at rest (`lab-edge`), hover = the edge turns to the accent. Add the lab's rail + body inside.
 * `cursor-pointer` because the whole card opens the page.
 */
export const WIKI_CARD =
  'group relative h-full cursor-pointer overflow-hidden rounded-lg border bg-card lab-edge lab-edge-link';

/** Title colour on card hover (the card carries `group`). `lab-ink` = accent text that stays >= 4.5:1. */
export const WIKI_CARD_TITLE_HOVER = 'group-hover:lab-ink';

/** A subtopic chip. Soft neutral at rest, accent tint on hover. A long name wraps inside it. */
export const WIKI_CHIP =
  'todo-focus rounded-md px-2 py-1 text-left text-xs font-medium leading-snug text-muted-foreground mix-bg-foreground/[0.05] transition-smooth hover:mix-bg-primary/[0.12] hover:lab-ink';

/** A neutral meta pill (category, "Subtopic", "Custom"): soft fill with a hairline inset ring. */
export const LAB_CHIP =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-[0.1875rem] text-xs font-medium leading-none mix-text-foreground/[0.78] mix-bg-foreground/[0.05] ring-1 ring-inset mix-ring-foreground/[0.1]';

/** The same pill in the accent: the lab's own category or label. */
export const LAB_CHIP_ACCENT =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-[0.1875rem] text-xs font-medium leading-none lab-ink lab-tint ring-1 ring-inset mix-ring-primary/25';

/** DOM id for a category block on a lab's wiki index (`cv-cat-Classical-CV`), used by the category nav's anchors. */
export const wikiAnchor = (prefix: string, name: string) => `${prefix}-cat-${name.replace(/[\s&/()']/g, '-')}`;
