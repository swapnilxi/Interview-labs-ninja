import React from 'react';

/**
 * Skeleton loaders shaped like the real cards they stand in for. Ported from
 * AI-Bootcamp-reference's `components/ui/Skeleton.tsx`.
 */

export function AbSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white/[0.04] ${className}`}
      aria-hidden="true"
    >
      <div className="skeleton-sweep" />
    </div>
  );
}

/** Mirrors `CatalogueCard` / `editorial-card`: title, two text lines, a pill row. */
export function AbSkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`editorial-card rounded-2xl p-6 h-full space-y-4 ${className}`}
      aria-hidden="true"
    >
      <AbSkeleton className="h-5 w-3/5" />
      <div className="space-y-2">
        <AbSkeleton className="h-3.5 w-full" />
        <AbSkeleton className="h-3.5 w-4/5" />
      </div>
      <div className="flex gap-2 pt-2">
        <AbSkeleton className="h-6 w-16 rounded-full" />
        <AbSkeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

/** Mirrors an instructor card: avatar tile beside two lines of identity. */
export function AbSkeletonAvatarCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`editorial-card rounded-2xl p-6 h-full space-y-5 ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-start gap-4">
        <AbSkeleton className="h-20 w-20 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          <AbSkeleton className="h-4 w-2/3" />
          <AbSkeleton className="h-3 w-1/2" />
          <AbSkeleton className="h-3 w-5/6" />
        </div>
      </div>
      <div className="flex gap-2">
        <AbSkeleton className="h-9 flex-1 rounded-xl" />
        <AbSkeleton className="h-9 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

/** Mirrors `StatTile`. */
export function AbSkeletonStat({ className = '' }: { className?: string }) {
  return (
    <div className={`editorial-card rounded-2xl p-5 space-y-3 ${className}`} aria-hidden="true">
      <AbSkeleton className="h-7 w-14" />
      <AbSkeleton className="h-2.5 w-20" />
    </div>
  );
}

/** A grid of `AbSkeletonCard`s, for a catalogue page's loading state. */
export function AbSkeletonGrid({
  count = 6,
  columns = 'md:grid-cols-2 lg:grid-cols-3',
  variant = 'card',
}: {
  count?: number;
  columns?: string;
  variant?: 'card' | 'avatar';
}) {
  const Item = variant === 'avatar' ? AbSkeletonAvatarCard : AbSkeletonCard;
  return (
    <div className={`grid grid-cols-1 ${columns} gap-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}
