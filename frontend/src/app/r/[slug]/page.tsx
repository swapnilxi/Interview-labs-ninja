import type { Metadata } from 'next';
import PublicResumeClient from '@/modules/career/PublicResumeClient';

export const metadata: Metadata = {
  title: 'Resume',
  description: 'A resume shared via Career Studio.',
};

// Public, unauthenticated shared resume. Content is fetched client-side from
// the backend's public snapshot endpoint (no auth, frozen at publish time).
export default async function PublicResumePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicResumeClient slug={slug} />;
}
