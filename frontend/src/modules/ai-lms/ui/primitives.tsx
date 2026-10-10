import React from 'react';
import Link from 'next/link';

/**
 * Small presentational pieces shared by ai-bootcamp's learning surfaces —
 * courses, labs, projects, practice, instructors. Ported from
 * AI-Bootcamp-reference's `components/learning/primitives.tsx`. They exist so
 * the catalogue reads as one system: a difficulty pill means the same thing
 * and looks the same whether it sits on a lab or a capstone.
 *
 * Only renders correctly inside a `.ab-theme`-wrapped tree (see ab-theme.css).
 */

/* ------------------------------------------------------------------ */
/* Difficulty                                                          */
/* ------------------------------------------------------------------ */
const DIFFICULTY_STYLE: Record<string, string> = {
  BEGINNER: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  INTERMEDIATE: 'border-ab-cream/30 bg-ab-cream/10 text-ab-text',
  ADVANCED: 'border-ab-cream/45 bg-ab-cream/15 text-ab-text',
  PRODUCTION: 'border-purple-500/35 bg-purple-500/10 text-purple-300',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  PRODUCTION: 'Production',
};

export function DifficultyPill({ level, className = '' }: { level: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider ${
        DIFFICULTY_STYLE[level] ?? DIFFICULTY_STYLE.BEGINNER
      } ${className}`}
    >
      {DIFFICULTY_LABEL[level] ?? level}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Meta pill                                                           */
/* ------------------------------------------------------------------ */
export function MetaPill({
  icon,
  children,
  className = '',
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-[11px] text-ab-text-muted ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */
export function ProgressBar({
  value,
  label,
  className = '',
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      {label && (
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-ab-text-muted">{label}</span>
          <span className="text-sm font-semibold text-ab-text tabular-nums">{pct}%</span>
        </div>
      )}
      <div
        className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#F0E6D4,#FAF6F0_55%,#FFFFFF)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */
export function StatTile({
  value,
  label,
  hint,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="editorial-card glow-tl p-5 rounded-2xl">
      <p className="font-ab-serif text-3xl text-ab-text leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-wider text-ab-text-muted">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-ab-text-muted/70">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-ab-black-line pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <span className="inline-flex items-center px-3 py-1 rounded-full border border-ab-cream/25 bg-ab-cream/[0.08] text-[11px] font-semibold uppercase tracking-widest text-ab-text">
          {eyebrow}
        </span>
        <h1 className="mt-4 font-ab-serif text-4xl font-normal leading-tight text-ab-text sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ab-text-muted sm:text-lg">{lede}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Catalogue card                                                      */
/* ------------------------------------------------------------------ */
export function CatalogueCard({
  href,
  title,
  summary,
  pills,
  footer,
  glow = 'glow-tl',
}: {
  href: string;
  title: string;
  summary: string;
  pills?: React.ReactNode;
  footer?: React.ReactNode;
  glow?: string;
}) {
  return (
    <Link
      href={href}
      className={`editorial-card ${glow} group flex flex-col gap-4 p-6 rounded-2xl h-full`}
    >
      <div className="flex-1 space-y-3">
        <h3 className="text-gold-metal font-ab-heading text-lg font-semibold tracking-tight leading-snug">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-ab-text-muted">{summary}</p>
      </div>
      {pills && <div className="flex flex-wrap gap-2">{pills}</div>}
      {footer && (
        <div className="pt-3 border-t border-white/[0.06] text-xs text-ab-text-muted">{footer}</div>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="editorial-card glow-tl rounded-2xl p-10 text-center space-y-3">
      {icon && (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-ab-cream/20 bg-ab-cream/[0.06] text-ab-cream shadow-[0_0_24px_-10px_rgba(249,115,22,0.45)]">
          {icon}
        </div>
      )}
      <h3 className="font-ab-serif text-xl text-ab-text">{title}</h3>
      <p className="mx-auto max-w-md text-sm text-ab-text-muted">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
