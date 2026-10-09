'use client';

import Icon from '@/components/ui/AppIcon';
import { AbSkeleton, AbSkeletonCard, AbSkeletonStat } from './Skeleton';

/**
 * Shared bodies for an ai-bootcamp route's `loading.tsx` / `error.tsx`. Every
 * route segment still needs its own thin file (Next.js requirement), but the
 * look lives here once. Ported from AI-Bootcamp-reference's
 * `components/ui/RouteFallback.tsx`.
 */

export function AbRoutePageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="space-y-4">
        <AbSkeleton className="h-4 w-28 rounded-full" />
        <AbSkeleton className="h-9 w-72" />
        <AbSkeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <AbSkeletonStat key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <AbSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function AbRouteError({
  reset,
  title = "Something didn't load",
  message = 'An unexpected error occurred. You can try again.',
}: {
  reset: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <div className="max-w-md mx-auto px-4 py-24">
      <div role="alert" className="editorial-card glow-tl rounded-2xl p-10 text-center space-y-4">
        <Icon name="ExclamationTriangleIcon" size={40} className="text-ab-gold mx-auto" />
        <h2 className="font-ab-serif text-xl text-ab-text">{title}</h2>
        <p className="text-sm text-ab-text-muted">{message}</p>
        <button
          onClick={reset}
          className="btn-sheen inline-flex items-center justify-center rounded-full border border-ab-cream/40 px-6 py-2.5 text-sm font-medium text-ab-cream transition-colors hover:border-ab-gold hover:shadow-[0_0_18px_-4px_rgba(249,115,22,0.45)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
