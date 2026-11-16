'use client';

import { useCallback, useEffect, useState } from 'react';
import VideoLinks from '@/components/ui/VideoLinks';
import type { LabName } from '@/lib/services/labSectionsService';
import {
  addLabPageVideo,
  fetchLabPageVideos,
  removeLabPageVideo,
  type PageVideo,
} from '@/lib/services/videoService';

/**
 * The signed-in user's own video links for the open lab page (a topic, or one of its subtopics). Personal, like their
 * saved sections and progress: nobody else sees them, so the person can always add and remove.
 *
 * The list belongs to the page it was loaded for (`key`), so the first render after navigating can never show the
 * previous page's videos. Saved links are an extra: when they cannot be loaded the page still works and says so here.
 */
export default function LabPageVideos({
  lab,
  topicId,
  subtopicId,
}: {
  lab: LabName;
  topicId: string;
  /** '' for the topic's own page. */
  subtopicId: string;
}) {
  const key = `${lab}|${topicId}|${subtopicId}`;
  const [state, setState] = useState<{
    key: string;
    videos: PageVideo[];
    status: 'loading' | 'ready' | 'error';
  }>({ key, videos: [], status: 'loading' });
  const current = state.key === key ? state : { key, videos: [] as PageVideo[], status: 'loading' as const };

  const load = useCallback(() => {
    let cancelled = false;
    setState({ key, videos: [], status: 'loading' });
    fetchLabPageVideos(lab, topicId, subtopicId)
      .then((videos) => {
        if (!cancelled) setState({ key, videos, status: 'ready' });
      })
      .catch((err) => {
        console.error('lab videos:', err);
        if (!cancelled) setState({ key, videos: [], status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [key, lab, topicId, subtopicId]);

  useEffect(() => load(), [load]);

  if (current.status === 'loading') return null;
  if (current.status === 'error') {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>Your video links could not be loaded.</span>
        <button type="button" onClick={() => load()} className="font-semibold lab-ink hover:underline">
          Try again
        </button>
      </p>
    );
  }

  return (
    <VideoLinks
      videos={current.videos}
      canEdit
      audience="personal"
      heading="Videos"
      emptyHint="Add a video that goes with this page. Only you can see it."
      onAdd={async (url, title) => {
        const created = await addLabPageVideo(lab, topicId, subtopicId, url, title);
        setState((prev) =>
          prev.key === key ? { ...prev, videos: [...prev.videos, created] } : prev
        );
      }}
      onRemove={async (id) => {
        const before = current.videos;
        setState((prev) =>
          prev.key === key ? { ...prev, videos: prev.videos.filter((v) => v.id !== id) } : prev
        );
        try {
          await removeLabPageVideo(Number(id));
        } catch (err) {
          setState((prev) => (prev.key === key ? { ...prev, videos: before } : prev));
          throw err;
        }
      }}
    />
  );
}
