import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import PortfolioBuilder from '@/modules/career/PortfolioBuilder';

export const metadata: Metadata = {
  title: 'Portfolio Builder - Career Studio',
  description: 'Build a one-page developer portfolio with widgets, versioning, and AI review.',
};

export default async function PortfolioBuilderPage({ params }: { params: Promise<{ masterId: string }> }) {
  const { masterId } = await params;
  return (
    <>
      <Header />
      <PortfolioBuilder masterId={masterId} />
    </>
  );
}
