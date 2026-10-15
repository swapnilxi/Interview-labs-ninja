import { redirect } from 'next/navigation';
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
  // /r/<slug>/v/abc, /v/0, /v/-1 or /v/1.5 are not versions: fall back to the current page instead of a broken one.
  const versionNumber = /^\d+$/.test(version) ? Number(version) : 0;
  if (versionNumber < 1) redirect(`/r/${encodeURIComponent(slug)}`);
  return <PublicResumeClient slug={slug} version={versionNumber} />;
}
