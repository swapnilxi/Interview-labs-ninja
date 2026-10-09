import React from 'react';

/** Ported from AI-Bootcamp-reference's `components/ui/SectionHeading.tsx`. */
export function AbSectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  className = '',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  const isCenter = align === 'center';

  return (
    <div
      className={`max-w-2xl ${isCenter ? 'mx-auto text-center' : 'text-left'} mb-12 sm:mb-16 relative z-10 ${className}`}
    >
      {eyebrow && (
        <span className="reveal inline-flex items-center gap-3 text-xs font-medium tracking-[0.2em] uppercase text-ab-text mb-4">
          <span
            className="eyebrow-line from-right w-8 h-px bg-gradient-to-r from-transparent to-ab-cream/70"
            aria-hidden="true"
          />
          <span>{eyebrow}</span>
          <span
            className="eyebrow-line from-left w-8 h-px bg-gradient-to-l from-transparent to-ab-cream/70"
            aria-hidden="true"
          />
        </span>
      )}

      <h2
        className="reveal text-3xl sm:text-4xl md:text-5xl font-ab-serif font-normal tracking-tight text-ab-text leading-[1.18] text-balance"
        style={{ '--d': '100ms' } as React.CSSProperties}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className="reveal mt-4 text-base sm:text-lg leading-relaxed text-ab-text-muted max-w-xl mx-auto"
          style={{ '--d': '200ms' } as React.CSSProperties}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
