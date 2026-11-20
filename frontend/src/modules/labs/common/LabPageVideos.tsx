'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import type { LabName, LabPage } from '@/lib/services/labSectionsService';
import {
  addLabPageVideo,
  fetchLabPageVideos,
  fetchLabVideoScript,
  generateLabVideoScript,
  removeLabPageVideo,
  updateLabPageVideo,
  type PageVideo,
  type VideoScript,
} from '@/lib/services/videoService';
import LinkCards, { LINK_CARD_BTN, type LinkCardItem } from '@/modules/labs/common/LinkCards';
import { resolveSelectedProject } from '@/modules/labs/common/project/projectStore';
import { useLabSettings } from '@/modules/labs/common/useLabSettings';
import VideoScriptPanel, { type ScriptStatus } from '@/modules/labs/common/VideoScriptPanel';

/** The settings row id whose lab-wide and topic add-ons and context the script is written with (it has no row of its own). */
const SCRIPT_SETTINGS_ID = 'video-script';

/** What the empty section says: only what this viewer can actually do. */
const EMPTY_ADMIN = 'Add links and video cards, and set a preview.';
const EMPTY_USER = 'Add links, videos, docs or code repos as cards. Only you can see them.';

/** The ones shared with everyone come first (the server answers in that order). */
const sharedFirst = (videos: PageVideo[]) => [
  ...videos.filter((v) => v.shared),
  ...videos.filter((v) => !v.shared),
];

/**
 * The links and videos of the open lab page (a topic, or one of its subtopics), as cards: the signed-in user's own (private to
 * them), plus any an admin added for everyone. Anyone adds and removes their own; an admin also chooses who sees a link, attaches
 * its preview image and picks its card shape. Beside "Add link" is "Generate Video Script", for everyone: the AI writes a script
 * for this page, kept per user and page and shown in a panel under the header.
 *
 * The list belongs to the page it was loaded for (`key`), so the first render after navigating can never show the previous
 * page's items. Saved links are an extra: when they cannot be loaded the page still works and says so here.
 */
export default function LabPageVideos({
  lab,
  topic,
  subtopic,
}: {
  lab: LabName;
  topic: LabPage;
  /** null on the topic's own page. */
  subtopic: LabPage | null;
}) {
  const { isAdmin } = useAuth();
  const topicId = topic.id;
  const subtopicId = subtopic?.id ?? '';
  const key = `${lab}|${topicId}|${subtopicId}`;
  const settings = useLabSettings(lab);

  const [state, setState] = useState<{
    key: string;
    videos: PageVideo[];
    status: 'loading' | 'ready' | 'error';
  }>({ key, videos: [], status: 'loading' });
  const current =
    state.key === key ? state : { key, videos: [] as PageVideo[], status: 'loading' as const };

  const [script, setScript] = useState<{ key: string; data: VideoScript | null }>({
    key,
    data: null,
  });
  const [gen, setGen] = useState<{ key: string; status: ScriptStatus; error: string | null }>({
    key,
    status: 'idle',
    error: null,
  });
  const [scriptOpen, setScriptOpen] = useState(false);
  const scriptNow = script.key === key ? script.data : null;
  const genNow = gen.key === key ? gen : { key, status: 'idle' as const, error: null };

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

  // The saved script is read on arrival (collapsed). Nothing here writes one: only the button does.
  useEffect(() => {
    let cancelled = false;
    setScript({ key, data: null });
    setGen({ key, status: 'idle', error: null });
    setScriptOpen(false);
    fetchLabVideoScript(lab, topicId, subtopicId)
      .then((data) => {
        if (!cancelled) setScript({ key, data });
      })
      .catch((err) => console.error('lab video script:', err));
    return () => {
      cancelled = true;
    };
  }, [key, lab, topicId, subtopicId]);

  const generate = async () => {
    if (genNow.status === 'generating') return;
    const forKey = key;
    setGen({ key: forKey, status: 'generating', error: null });
    setScriptOpen(true);
    try {
      // Read at click time, so the stored project selection is honoured.
      const project = await resolveSelectedProject();
      const instructions = settings.effective(SCRIPT_SETTINGS_ID, '', topicId);
      const saved = await generateLabVideoScript({
        lab,
        topic,
        subtopic,
        standingContext: instructions.standingContext,
        // The add-ons arrive under a heading of their own; the server adds one, so it is not repeated here.
        promptAddon: instructions.guidance.replace(
          /^Additional instructions from the learner:\n/,
          ''
        ),
        projectId: project?.id ?? null,
      });
      setScript((prev) => (prev.key === forKey ? { key: forKey, data: saved } : prev));
      setGen((prev) => (prev.key === forKey ? { key: forKey, status: 'idle', error: null } : prev));
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not write the script. Try again.';
      setGen((prev) =>
        prev.key === forKey ? { key: forKey, status: 'error', error: message } : prev
      );
    }
  };

  if (current.status === 'loading') return null;
  if (current.status === 'error') {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>Your links could not be loaded.</span>
        <button
          type="button"
          onClick={() => load()}
          className="font-semibold lab-ink hover:underline"
        >
          Try again
        </button>
      </p>
    );
  }

  const items: LinkCardItem[] = current.videos.map((v) => ({
    id: v.id,
    url: v.url,
    title: v.title,
    shared: !!v.shared,
    locked: !!v.shared && !isAdmin,
    previewImage: v.preview_image ?? '',
    shape: v.shape,
    icon: v.icon ?? '',
  }));
  const writing = genNow.status === 'generating';

  return (
    <LinkCards
      items={items}
      canCurate={isAdmin}
      emptyHint={isAdmin ? EMPTY_ADMIN : EMPTY_USER}
      headerExtra={
        <button
          type="button"
          className={LINK_CARD_BTN}
          onClick={() => void generate()}
          disabled={writing}
        >
          <Icon
            name="SparklesIcon"
            size={14}
            className={writing ? 'animate-pulse motion-reduce:animate-none' : ''}
          />
          <span>{writing ? 'Writing the script…' : 'Generate Video Script'}</span>
        </button>
      }
      onAdd={async (input) => {
        const created = await addLabPageVideo(
          lab,
          topicId,
          subtopicId,
          input.url,
          input.title,
          input.shared,
          {
            preview_image: input.previewImage || undefined,
            shape: input.shape ?? undefined,
            icon: input.icon || undefined,
          }
        );
        setState((prev) =>
          prev.key === key ? { ...prev, videos: sharedFirst([...prev.videos, created]) } : prev
        );
      }}
      onUpdate={async (id, patch) => {
        const updated = await updateLabPageVideo(Number(id), patch);
        setState((prev) =>
          prev.key === key
            ? {
                ...prev,
                videos: sharedFirst(prev.videos.map((v) => (v.id === updated.id ? updated : v))),
              }
            : prev
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
    >
      <VideoScriptPanel
        script={scriptNow}
        status={genNow.status}
        error={genNow.error}
        open={scriptOpen}
        onToggle={() => setScriptOpen((o) => !o)}
        onRegenerate={() => void generate()}
        pageName={subtopic ? `${topic.name} ${subtopic.name}` : topic.name}
      />
    </LinkCards>
  );
}
