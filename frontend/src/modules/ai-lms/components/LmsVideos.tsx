'use client';

import { useCallback, useEffect, useState } from 'react';
import VideoLinks from '@/components/ui/VideoLinks';
import {
  createLmsVideo,
  deleteLmsVideo,
  listLmsVideos,
  type LmsVideo,
  type LmsVideoScope,
} from '../services/lmsVideoService';

/**
 * The video links of one class or one subject (a project is a subject). Shared content: every signed-in user sees
 * them and `canEdit` (instructors and admins, and not while previewing as a student) can add and remove.
 *
 * A viewer of a class with no videos sees nothing at all. Removing is optimistic and rolls back with a message when
 * the server refuses.
 */
export default function LmsVideos({
  scope,
  refId,
  canEdit,
  heading = 'Videos',
}: {
  scope: LmsVideoScope;
  /** The class id or slug (scope 'class') or the subject id (scope 'subject'). */
  refId: string;
  canEdit: boolean;
  heading?: string;
}) {
  const key = `${scope}|${refId}`;
  const [state, setState] = useState<{
    key: string;
    videos: LmsVideo[];
    status: 'loading' | 'ready' | 'error';
  }>({ key, videos: [], status: 'loading' });
  const current = state.key === key ? state : { key, videos: [] as LmsVideo[], status: 'loading' as const };

  const load = useCallback(() => {
    let cancelled = false;
    setState({ key, videos: [], status: 'loading' });
    listLmsVideos(scope, refId)
      .then((videos) => {
        if (!cancelled) setState({ key, videos, status: 'ready' });
      })
      .catch((err) => {
        console.error('lms videos:', err);
        if (!cancelled) setState({ key, videos: [], status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [key, scope, refId]);

  useEffect(() => load(), [load]);

  if (current.status === 'loading') return null;
  if (current.status === 'error') {
    // Only someone who can fix it needs to hear about it; a learner just does not see the section.
    if (!canEdit) return null;
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>The video links could not be loaded.</span>
        <button type="button" onClick={() => load()} className="font-semibold text-primary hover:underline">
          Try again
        </button>
      </p>
    );
  }

  return (
    <VideoLinks
      videos={current.videos}
      canEdit={canEdit}
      heading={heading}
      audience="class"
      onAdd={async (url, title) => {
        const created = await createLmsVideo(scope, refId, url, title);
        setState((prev) => (prev.key === key ? { ...prev, videos: [...prev.videos, created] } : prev));
      }}
      onRemove={async (id) => {
        const before = current.videos;
        setState((prev) =>
          prev.key === key ? { ...prev, videos: prev.videos.filter((v) => v.id !== id) } : prev
        );
        try {
          await deleteLmsVideo(Number(id));
        } catch (err) {
          setState((prev) => (prev.key === key ? { ...prev, videos: before } : prev));
          throw err;
        }
      }}
    />
  );
}
