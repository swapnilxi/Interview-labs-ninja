import type { Metadata } from 'next';
import PublicResumeClient from '@/modules/career-studio/public/PublicResumeClient';

export const metadata: Metadata = {
  title: 'Resume',
  description: 'A specific past snapshot of a resume shared via Career Studio.',
};

// A specific historical snapshot (kept reachable even after the owner
// re-publishes with new content) — see PublicResumeClient's `version` prop.
export default async function PublicResumeVersionPage({ params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version } = await params;
  return <PublicResumeClient slug={slug} version={Number(version)} />;
}
