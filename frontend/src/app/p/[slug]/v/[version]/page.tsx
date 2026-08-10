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
  return <PublicPortfolioClient slug={slug} version={Number(version)} />;
}
