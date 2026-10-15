import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import PublicPortfolioClient from '@/modules/career-studio/public/PublicPortfolioClient';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'A specific past snapshot of a portfolio shared via Career Studio.',
};

// A specific historical snapshot (kept reachable even after the owner
// re-publishes with new content) — see PublicPortfolioClient's `version` prop.
export default async function PublicPortfolioVersionPage({ params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version } = await params;
  // /p/<slug>/v/abc, /v/0, /v/-1 or /v/1.5 are not versions: fall back to the current page instead of a broken one.
  const versionNumber = /^\d+$/.test(version) ? Number(version) : 0;
  if (versionNumber < 1) redirect(`/p/${encodeURIComponent(slug)}`);
  return <PublicPortfolioClient slug={slug} version={versionNumber} />;
}
