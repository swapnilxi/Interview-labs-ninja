import type { Metadata } from 'next';
import PublicPortfolioClient from '@/modules/career/PublicPortfolioClient';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'A portfolio shared via Career Studio.',
};

// Public, unauthenticated shared portfolio. Content is fetched client-side from
// the backend's public snapshot endpoint (no auth, frozen at publish time).
export default async function PublicPortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicPortfolioClient slug={slug} />;
}
