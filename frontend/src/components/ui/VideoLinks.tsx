'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  VIDEO_URL_ERROR,
  cleanVideoTitle,
  describeVideo,
  looksLikeYouTube,
  normalizeVideoUrl,
  type VideoDescription,
} from '@/lib/video/videoLinks';

/**
 * A list of video links with an editor: cards that play in place, and an inline form to add more.
 *
 * Presentational: it keeps no copy of the list. The caller owns the data and passes `onAdd` / `onRemove`, which
 * reject with a readable message (shown under the form or the card). The data-bound wrappers are
 * `LmsVideos` / `ModuleVideos` (AI LMS) and `LabPageVideos` (labs).
 *
 * Nothing from a video provider is requested until the person presses Play: the card is plain text and icons, and the
 * iframe (or the <video>) is created only then. A YouTube card always has an "Open on YouTube" link next to Play,
 * because an embedded private video only plays for the account that owns it (see src/lib/video/videoLinks.ts).
 *
 * A viewer with no videos sees nothing; an editor sees an invitation.
 */

export interface VideoLinkItem {
  id: string | number;
  url: string;
  title: string;
}

interface VideoLinksProps {
  videos: VideoLinkItem[];
  canEdit: boolean;
  /** Adds one link; rejects with a readable message (duplicate, limit, not allowed...). */
  onAdd: (url: string, title: string) => Promise<void>;
  onRemove: (id: string | number) => Promise<void>;
  /** Default "Videos". */
  heading?: string;
  /** The line an editor sees while the list is empty. */
  emptyHint?: string;
  /** Tighter spacing and a smaller heading, for places that sit inside another card. */
  compact?: boolean;
  /** The caller is loading or saving: the buttons wait. */
  busy?: boolean;
  /** Who can watch: a class (shared) or only the person who added them. Changes one helper sentence. */
  audience?: 'class' | 'personal';
}

const BTN =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
const BTN_PRIMARY =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
const BTN_QUIET =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
const INPUT =
  'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:mix-ring-primary/40';

const PROVIDER_NAME: Record<VideoDescription['provider'], string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
  file: 'Video file',
  link: 'Link',
};

/** 90 -> "1:30", 3723 -> "1:02:03". */
function formatStart(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The player starts as soon as the person has asked for it: one press, not two. (Loom does not take the parameter.) */
function autoplayUrl(desc: VideoDescription): string {
  const url = desc.embedUrl ?? '';
  if (desc.provider !== 'youtube' && desc.provider !== 'vimeo') return url;
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.';
}

// ── One card ─────────────────────────────────────────────────────────────────────────────────────────────────────

function VideoCard({
  video,
  canEdit,
  compact,
  busy,
  playing,
  onPlay,
  onStop,
  onRemove,
}: {
  video: VideoLinkItem;
  canEdit: boolean;
  compact: boolean;
  busy: boolean;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRemove: () => Promise<void>;
}) {
  const desc = useMemo(() => describeVideo(video.url), [video.url]);
  const title = video.title || desc.label;
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isYouTube = desc.provider === 'youtube';
  const canEmbed = !!desc.embedUrl;
  const openLabel = isYouTube ? 'Open on YouTube' : 'Open link';

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
    } catch (err) {
      setError(errorMessage(err));
      setRemoving(false);
      setConfirming(false);
    }
  };

  const chips: string[] = [];
  if (video.title && desc.provider !== 'link') chips.push(PROVIDER_NAME[desc.provider]);
  if (desc.kind === 'playlist') chips.push('Playlist');
  else if (desc.playlistId) chips.push('In a playlist');
  if (desc.start) chips.push(`Starts at ${formatStart(desc.start)}`);

  return (
    <li className="rounded-xl border border-border bg-card">
      {playing && canEmbed ? (
        <div className={compact ? 'p-2.5' : 'p-3'}>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {desc.provider === 'file' ? (
              <video
                src={desc.embedUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full"
              >
                Your browser cannot play this video file. Use “Open link”.
              </video>
            ) : (
              <iframe
                src={autoplayUrl(desc)}
                title={`${title}, video player`}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
          <p className="mt-2 break-words text-sm font-semibold leading-snug text-foreground">{title}</p>
        </div>
      ) : (
        <div className={`flex items-start gap-3 ${compact ? 'p-2.5' : 'p-3'}`}>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Icon
              name={desc.kind === 'playlist' ? 'QueueListIcon' : canEmbed ? 'PlayCircleIcon' : 'LinkIcon'}
              size={18}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-snug text-foreground">{title}</p>
            {chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {video.title && desc.provider === 'link' && desc.host && (
              <p className="mt-0.5 break-all text-xs text-muted-foreground">{desc.host}</p>
            )}
          </div>
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-2 border-t border-border ${compact ? 'p-2' : 'p-2.5'}`}>
        {confirming ? (
          <>
            <p className="mr-auto text-sm text-foreground">Remove this video?</p>
            <button type="button" className={BTN} onClick={() => setConfirming(false)} disabled={removing}>
              Keep it
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={remove} disabled={removing || busy}>
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </>
        ) : (
          <>
            {canEmbed &&
              (playing ? (
                <button type="button" className={BTN} onClick={onStop} aria-label={`Close the player for ${title}`}>
                  <Icon name="XMarkIcon" size={14} />
                  <span>Close player</span>
                </button>
              ) : (
                <button type="button" className={BTN_PRIMARY} onClick={onPlay} aria-label={`Play ${title}`}>
                  <Icon name="PlayIcon" size={14} />
                  <span>Play</span>
                </button>
              ))}
            <a href={desc.href} target="_blank" rel="noopener noreferrer" className={BTN}>
              <Icon name="ArrowTopRightOnSquareIcon" size={14} />
              <span>{openLabel}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {canEdit && (
              <button
                type="button"
                className={`${BTN_QUIET} ml-auto`}
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                disabled={busy}
                aria-label={`Remove ${title}`}
              >
                <Icon name="TrashIcon" size={14} />
                <span>Remove</span>
              </button>
            )}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="border-t border-border px-3 py-2 text-xs text-rose-500">
          {error}
        </p>
      )}
    </li>
  );
}

// ── The list with its add form ───────────────────────────────────────────────────────────────────────────────────

export default function VideoLinks({
  videos,
  canEdit,
  onAdd,
  onRemove,
  heading = 'Videos and links',
  emptyHint = 'Add a YouTube video or playlist, Vimeo, Loom, a video file, or any other resource link.',
  compact = false,
  busy = false,
  audience = 'class',
}: VideoLinksProps) {
  const formId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const urlRef = useRef<HTMLTextAreaElement>(null);

  // The video being played is gone (removed, or the list changed under it): stop showing a player for it.
  useEffect(() => {
    if (playingId !== null && !videos.some((v) => v.id === playingId)) setPlayingId(null);
  }, [videos, playingId]);

  useEffect(() => {
    if (formOpen) urlRef.current?.focus();
  }, [formOpen]);

  const lines = splitLines(urlText);
  const several = lines.length > 1;
  const showYouTubeHelper = lines.some((line) => looksLikeYouTube(line));

  const closeForm = () => {
    setFormOpen(false);
    setUrlText('');
    setTitleText('');
    setFormErrors([]);
    addButtonRef.current?.focus();
  };

  const submit = async () => {
    if (submitting || busy) return;
    setFormErrors([]);
    if (lines.length === 0) {
      setFormErrors([VIDEO_URL_ERROR]);
      return;
    }
    // Check every line before anything is sent, so a typo never leaves half a list added.
    for (let i = 0; i < lines.length; i++) {
      const checked = normalizeVideoUrl(lines[i]);
      if (!checked.ok) {
        setFormErrors([several ? `Line ${i + 1}: ${checked.error}` : checked.error]);
        return;
      }
    }
    if (!several) {
      const title = cleanVideoTitle(titleText);
      if (!title.ok) {
        setFormErrors([title.error]);
        return;
      }
    }
    setSubmitting(true);
    const failed: { line: string; number: number; reason: string }[] = [];
    let added = 0;
    for (let i = 0; i < lines.length; i++) {
      try {
        await onAdd(lines[i], several ? '' : titleText);
        added += 1;
      } catch (err) {
        failed.push({ line: lines[i], number: i + 1, reason: errorMessage(err) });
      }
    }
    setSubmitting(false);
    if (failed.length === 0) {
      setAnnouncement(added === 1 ? 'Link added.' : `Added ${added} links.`);
      closeForm();
      return;
    }
    // What did not go in stays in the box, so it can be fixed and sent again.
    setUrlText(failed.map((f) => f.line).join('\n'));
    setFormErrors(
      several
        ? [`Added ${added} of ${lines.length}.`, ...failed.map((f) => `Line ${f.number}: ${f.reason}`)]
        : [failed[0].reason]
    );
  };

  const empty = videos.length === 0;
  if (empty && !canEdit) return null;

  const youTubeHelper =
    audience === 'class'
      ? 'Private videos and playlists play only for the YouTube account that owns them. Set them to Unlisted so everyone in the class can watch.'
      : 'Private videos and playlists play only for the YouTube account that owns them.';

  return (
    <section aria-label={heading} className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3
          className={`flex items-center gap-2 font-heading font-semibold text-foreground ${compact ? 'text-sm' : 'text-base'}`}
        >
          <Icon name="VideoCameraIcon" size={compact ? 16 : 18} className="text-muted-foreground" />
          <span>{heading}</span>
          {!empty && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {videos.length}
            </span>
          )}
        </h3>
        {canEdit && !formOpen && (
          <button
            ref={addButtonRef}
            type="button"
            className={BTN}
            onClick={() => setFormOpen(true)}
            disabled={busy}
            aria-expanded={false}
            aria-controls={formId}
          >
            <Icon name="PlusIcon" size={14} />
            <span>Add link</span>
          </button>
        )}
      </div>

      {formOpen && (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !submitting) {
              event.stopPropagation();
              closeForm();
            }
          }}
          className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4"
        >
          <div>
            <label htmlFor={`${formId}-url`} className="mb-1.5 block text-sm font-semibold text-foreground">
              Link (YouTube, video or any resource)
            </label>
            <textarea
              id={`${formId}-url`}
              ref={urlRef}
              rows={Math.min(5, Math.max(1, several ? lines.length + 1 : Math.ceil(urlText.length / 52)))}
              value={urlText}
              onChange={(event) => setUrlText(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter starts another line (a list of links, one per line).
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Paste a link. To add several, put one on each line."
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={formErrors.length > 0}
              aria-describedby={formErrors.length > 0 ? `${formId}-errors` : undefined}
              className={`${INPUT} resize-none break-all`}
            />
          </div>
          {!several && (
            <div>
              <label htmlFor={`${formId}-title`} className="mb-1.5 block text-sm font-semibold text-foreground">
                Title <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id={`${formId}-title`}
                type="text"
                value={titleText}
                onChange={(event) => setTitleText(event.target.value)}
                maxLength={120}
                autoComplete="off"
                className={INPUT}
              />
            </div>
          )}
          {showYouTubeHelper && (
            <p className="text-xs leading-relaxed text-muted-foreground">{youTubeHelper}</p>
          )}
          {formErrors.length > 0 && (
            <div id={`${formId}-errors`} role="alert" className="space-y-0.5 text-xs text-rose-500">
              {formErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={BTN_QUIET} onClick={closeForm} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={submitting || busy}>
              {submitting ? 'Adding…' : several ? `Add ${lines.length} links` : 'Add link'}
            </button>
          </div>
        </form>
      )}

      {empty && !formOpen && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
          {emptyHint}
        </p>
      )}

      {!empty && (
        <ul className="space-y-2.5">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              canEdit={canEdit}
              compact={compact}
              busy={busy}
              playing={playingId === video.id}
              onPlay={() => setPlayingId(video.id)}
              onStop={() => setPlayingId(null)}
              onRemove={async () => {
                await onRemove(video.id);
                setAnnouncement('Video removed.');
              }}
            />
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
