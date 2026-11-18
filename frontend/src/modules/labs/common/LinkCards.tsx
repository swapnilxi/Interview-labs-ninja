'use client';

import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import { fileToPreviewDataUrl } from '@/lib/video/previewImage';
import {
  VIDEO_SHAPES,
  VIDEO_SHAPE_DEFAULT,
  VIDEO_URL_ERROR,
  cleanVideoTitle,
  describeVideo,
  looksLikeYouTube,
  normalizePreviewImage,
  normalizeVideoUrl,
  youTubeThumbnail,
  type VideoDescription,
  type VideoShape,
} from '@/lib/video/videoLinks';
import { LAB_CHIP } from '@/modules/labs/common/WikiParts';

/**
 * Links and videos on a lab page, as rectangular cards, with an inline form to add more. Lab-only (the AI LMS keeps its own
 * list, components/ui/VideoLinks.tsx).
 *
 * Every item is a card: a video plays in place after Play (nothing from a provider is loaded for the player until then, and
 * a card never fetches a page to make a preview); a plain link is a card that opens in a new tab. The preview is, in order,
 * the image an admin attached, the thumbnail of a YouTube video (a fixed address built from its id), or a neutral tile
 * with the host. An admin picks each card's shape (wide: image on top; side: image on the left; slim: a small row), attaches
 * the image (an https link, or an upload that is made small first), and chooses who sees the link ("Only me" or
 * "Everyone"). Everyone else adds and removes their own.
 *
 * Presentational: the caller owns the list and passes `onAdd` / `onUpdate` / `onRemove`, which reject with a readable
 * message. `headerExtra` sits beside "Add link" and `children` under the header (the page's video script).
 */

export interface LinkCardItem {
  id: string | number;
  url: string;
  title: string;
  /** Added for everyone: shown with a tag. */
  shared?: boolean;
  /** The viewer cannot change or remove this one. */
  locked?: boolean;
  /** An https link or a data URL; '' or absent = none. */
  previewImage?: string;
  shape?: VideoShape;
}

export interface LinkCardAdd {
  url: string;
  title: string;
  shared: boolean;
  /** '' for none. Only sent by an admin. */
  previewImage: string;
  /** null when the viewer cannot choose one. */
  shape: VideoShape | null;
}

export interface LinkCardPatch {
  title?: string;
  preview_image?: string;
  shape?: VideoShape;
  shared?: boolean;
}

interface LinkCardsProps {
  items: LinkCardItem[];
  /** An admin: the add form and every card get the preview image, shape and audience controls. */
  canCurate: boolean;
  onAdd: (input: LinkCardAdd) => Promise<void>;
  onUpdate: (id: string | number, patch: LinkCardPatch) => Promise<void>;
  onRemove: (id: string | number) => Promise<void>;
  heading?: string;
  /** The line shown while the list is empty. */
  emptyHint: string;
  headerExtra?: ReactNode;
  children?: ReactNode;
}

const BTN =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
/** The secondary button of the section, for a control beside "Add link" (the script button). */
export const LINK_CARD_BTN = BTN;
const BTN_PRIMARY =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
const BTN_QUIET =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';
const ICON_BTN =
  'inline-flex h-[2.75rem] w-[2.75rem] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:h-[2.25rem] sm:w-[2.25rem]';
const INPUT =
  'w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:mix-ring-primary/40';
const LABEL = 'mb-1.5 block text-sm font-semibold text-foreground';

const PROVIDER_NAME: Record<VideoDescription['provider'], string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
  file: 'Video file',
  link: 'Link',
};

const SHAPE_LABEL: Record<VideoShape, string> = { wide: 'Wide', side: 'Side', slim: 'Slim' };

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

/** The image to draw for a stored preview: only what the servers would accept (https or an image data URL), else none. */
function safeImage(value: string | undefined): string {
  const checked = normalizePreviewImage(value ?? '');
  return checked.ok ? checked.image : '';
}

// ── Small controls ───────────────────────────────────────────────────────────────────────────────────────────────

/** A glyph of each shape, 24 x 16: the wide card (image over text), the side card, the slim row. */
function ShapeGlyph({ shape }: { shape: VideoShape }) {
  return (
    <svg
      width="24"
      height="16"
      viewBox="0 0 24 16"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <rect
        x="0.75"
        y="0.75"
        width="22.5"
        height="14.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {shape === 'wide' && (
        <>
          <rect x="3" y="3" width="18" height="5.5" rx="1" fill="currentColor" opacity="0.55" />
          <rect x="3" y="10.5" width="11" height="1.5" rx="0.75" fill="currentColor" />
        </>
      )}
      {shape === 'side' && (
        <>
          <rect x="3" y="3" width="8" height="10" rx="1" fill="currentColor" opacity="0.55" />
          <rect x="13" y="4.5" width="8" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="13" y="8" width="5.5" height="1.5" rx="0.75" fill="currentColor" />
        </>
      )}
      {shape === 'slim' && (
        <>
          <rect x="3" y="5" width="5" height="6" rx="1" fill="currentColor" opacity="0.55" />
          <rect x="10" y="6" width="11" height="1.5" rx="0.75" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** A radio group drawn as a segmented control (the repo's `todo-segmented` look is for tabs; this one carries a glyph). */
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; glyph?: ReactNode }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold transition-colors sm:min-h-[2.25rem] ${
              on
                ? 'mix-border-primary/50 lab-tint lab-ink'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {option.glyph}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The preview image of a link: an https link to paste, or a file to upload (made small in the browser first). */
function PreviewField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploaded = value.startsWith('data:');
  const shown = safeImage(value);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await fileToPreviewDataUrl(file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <label htmlFor={`${id}-url`} className={LABEL}>
        Preview image <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <div className="flex items-start gap-3">
        <div className="relative aspect-video w-[7.5rem] flex-shrink-0 overflow-hidden rounded-lg border border-border mix-bg-foreground/[0.05]">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Icon name="PhotoIcon" size={20} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={`${id}-url`}
            type="text"
            inputMode="url"
            value={uploaded ? '' : value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={uploaded ? 'Uploaded image in use' : 'Paste an https:// link to an image'}
            autoComplete="off"
            spellCheck={false}
            className={INPUT}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={BTN}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Icon name="ArrowUpTrayIcon" size={14} />
              <span>{busy ? 'Preparing…' : 'Upload image'}</span>
            </button>
            {value && (
              <button
                type="button"
                className={BTN_QUIET}
                onClick={() => onChange('')}
                disabled={busy}
              >
                Remove image
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            JPEG, PNG, WebP or GIF. An upload is resized to fit 200 KB.
          </p>
          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ShapeField({
  value,
  onChange,
}: {
  value: VideoShape;
  onChange: (shape: VideoShape) => void;
}) {
  return (
    <div>
      <p className={LABEL}>Shape</p>
      <Segmented
        label="Card shape"
        value={value}
        onChange={(v) => onChange(v as VideoShape)}
        options={VIDEO_SHAPES.map((shape) => ({
          value: shape,
          label: SHAPE_LABEL[shape],
          glyph: <ShapeGlyph shape={shape} />,
        }))}
      />
    </div>
  );
}

function AudienceField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (shared: boolean) => void;
}) {
  return (
    <div>
      <p className={LABEL}>Visible to</p>
      <Segmented
        label="Who can see this link"
        value={value ? 'everyone' : 'me'}
        onChange={(v) => onChange(v === 'everyone')}
        options={[
          { value: 'me', label: 'Only me' },
          { value: 'everyone', label: 'Everyone' },
        ]}
      />
    </div>
  );
}

// ── The player and the media block ───────────────────────────────────────────────────────────────────────────────

function Player({ desc, title }: { desc: VideoDescription; title: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
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
  );
}

/** The picture area of a card: the preview image, else a neutral tile with the host. `fill` = it takes the height of its row. */
function Media({
  src,
  failed,
  onFailed,
  desc,
  canEmbed,
  className,
}: {
  src: string;
  failed: boolean;
  onFailed: () => void;
  desc: VideoDescription;
  canEmbed: boolean;
  className: string;
}) {
  const showImage = !!src && !failed;
  return (
    <div className={`relative overflow-hidden mix-bg-foreground/[0.05] ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onFailed}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground">
          <Icon
            name={
              desc.kind === 'playlist' ? 'QueueListIcon' : canEmbed ? 'PlayCircleIcon' : 'LinkIcon'
            }
            size={24}
          />
          {desc.host && (
            <span className="max-w-full break-all text-xs font-medium leading-tight">
              {desc.host}
            </span>
          )}
        </span>
      )}
      {canEmbed && showImage && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
            <Icon name="PlayIcon" variant="solid" size={16} />
          </span>
        </span>
      )}
    </div>
  );
}

// ── One card ─────────────────────────────────────────────────────────────────────────────────────────────────────

function LinkCard({
  item,
  canEdit,
  canCurate,
  busy,
  playing,
  onPlay,
  onStop,
  onRemove,
  onUpdate,
}: {
  item: LinkCardItem;
  canEdit: boolean;
  canCurate: boolean;
  busy: boolean;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRemove: () => Promise<void>;
  onUpdate: (patch: LinkCardPatch) => Promise<void>;
}) {
  const editId = useId();
  const desc = useMemo(() => describeVideo(item.url), [item.url]);
  const shape: VideoShape =
    item.shape && (VIDEO_SHAPES as readonly string[]).includes(item.shape)
      ? item.shape
      : VIDEO_SHAPE_DEFAULT;
  const attached = safeImage(item.previewImage);
  const src = attached || youTubeThumbnail(desc) || '';
  const [failedSrc, setFailedSrc] = useState('');
  const title = item.title || desc.label;
  const canEmbed = !!desc.embedUrl;
  const openLabel = desc.provider === 'youtube' ? 'Open on YouTube' : 'Open link';

  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPreview, setDraftPreview] = useState('');
  const [draftShape, setDraftShape] = useState<VideoShape>(shape);
  const [draftShared, setDraftShared] = useState(false);

  const openEditor = () => {
    setDraftTitle(item.title);
    setDraftPreview(item.previewImage ?? '');
    setDraftShape(shape);
    setDraftShared(!!item.shared);
    setEditError(null);
    setEditing(true);
  };

  const save = async () => {
    const patch: LinkCardPatch = {};
    const cleaned = cleanVideoTitle(draftTitle);
    if (!cleaned.ok) {
      setEditError(cleaned.error);
      return;
    }
    const preview = normalizePreviewImage(draftPreview);
    if (!preview.ok) {
      setEditError(preview.error);
      return;
    }
    if (cleaned.title !== item.title) patch.title = cleaned.title;
    if (preview.image !== (item.previewImage ?? '')) patch.preview_image = preview.image;
    if (draftShape !== shape) patch.shape = draftShape;
    if (draftShared !== !!item.shared) patch.shared = draftShared;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await onUpdate(patch);
      setEditing(false);
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

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
  if (item.title && desc.provider !== 'link') chips.push(PROVIDER_NAME[desc.provider]);
  if (desc.kind === 'playlist') chips.push('Playlist');
  else if (desc.playlistId) chips.push('In a playlist');
  if (desc.start) chips.push(`Starts at ${formatStart(desc.start)}`);

  const media = (
    <Media
      src={src}
      failed={failedSrc === src}
      onFailed={() => setFailedSrc(src)}
      desc={desc}
      canEmbed={canEmbed}
      className={
        shape === 'wide'
          ? 'aspect-video w-full'
          : shape === 'side'
            ? 'aspect-video w-full self-stretch'
            : 'h-[3rem] w-[5.25rem] rounded-md'
      }
    />
  );
  /** The sizing lives on the button / link around the picture, so a percentage width has a definite parent. */
  const pictureWrap =
    shape === 'wide'
      ? 'w-full'
      : shape === 'side'
        ? 'flex w-[40%] min-w-[8.5rem] max-w-[17rem] flex-shrink-0 self-stretch'
        : 'flex-shrink-0';

  /** What a press on the picture does: play a video, or open a plain link. A button / link of its own is below, so it is not a tab stop. */
  const pictureAction = (content: ReactNode, extra = '') =>
    canEmbed ? (
      <button
        type="button"
        tabIndex={-1}
        onClick={onPlay}
        aria-label={`Play ${title}`}
        className={`block cursor-pointer text-left ${extra}`}
      >
        {content}
      </button>
    ) : (
      <a
        href={desc.href}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        aria-label={`Open ${title} (opens in a new tab)`}
        className={`block ${extra}`}
      >
        {content}
      </a>
    );

  const titleBlock = (
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm font-semibold leading-snug text-foreground">{title}</p>
      {(item.shared || chips.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {item.shared && <span className={LAB_CHIP}>Everyone</span>}
          {chips.map((chip) => (
            <span key={chip} className={LAB_CHIP}>
              {chip}
            </span>
          ))}
        </div>
      )}
      {item.title && desc.provider === 'link' && desc.host && (
        <p className="mt-1 break-all text-xs text-muted-foreground">{desc.host}</p>
      )}
    </div>
  );

  const openLink = (
    <a href={desc.href} target="_blank" rel="noopener noreferrer" className={BTN}>
      <Icon name="ArrowTopRightOnSquareIcon" size={14} />
      <span>{openLabel}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );

  const actions = (
    <div
      className={`flex flex-wrap items-center gap-2 ${shape === 'wide' ? 'border-t border-border p-2.5' : 'pt-2.5'}`}
    >
      {confirming ? (
        <>
          <p className="mr-auto text-sm text-foreground">Remove this link?</p>
          <button
            type="button"
            className={BTN}
            onClick={() => setConfirming(false)}
            disabled={removing}
          >
            Keep it
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={remove}
            disabled={removing || busy}
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </>
      ) : (
        <>
          {canEmbed &&
            (playing ? (
              <button
                type="button"
                className={BTN}
                onClick={onStop}
                aria-label={`Close the player for ${title}`}
              >
                <Icon name="XMarkIcon" size={14} />
                <span>Close player</span>
              </button>
            ) : (
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={onPlay}
                aria-label={`Play ${title}`}
              >
                <Icon name="PlayIcon" size={14} />
                <span>Play</span>
              </button>
            ))}
          {openLink}
          {canEdit && (
            <span className="ml-auto flex items-center gap-1">
              {canCurate && (
                <button
                  type="button"
                  className={BTN_QUIET}
                  onClick={() => (editing ? setEditing(false) : openEditor())}
                  aria-expanded={editing}
                  aria-controls={editId}
                  disabled={busy}
                  aria-label={`Edit ${title}`}
                >
                  <Icon name="PencilSquareIcon" size={14} />
                  <span>Edit</span>
                </button>
              )}
              <button
                type="button"
                className={BTN_QUIET}
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
            </span>
          )}
        </>
      )}
    </div>
  );

  const slimActions = (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      {canEmbed && (
        <button
          type="button"
          className={ICON_BTN}
          onClick={playing ? onStop : onPlay}
          aria-label={playing ? `Close the player for ${title}` : `Play ${title}`}
        >
          <Icon name={playing ? 'XMarkIcon' : 'PlayIcon'} size={16} />
        </button>
      )}
      <a
        href={desc.href}
        target="_blank"
        rel="noopener noreferrer"
        className={ICON_BTN}
        aria-label={`${openLabel}: ${title} (opens in a new tab)`}
      >
        <Icon name="ArrowTopRightOnSquareIcon" size={16} />
      </a>
      {canEdit && canCurate && (
        <button
          type="button"
          className={ICON_BTN}
          onClick={() => (editing ? setEditing(false) : openEditor())}
          aria-expanded={editing}
          aria-controls={editId}
          aria-label={`Edit ${title}`}
          disabled={busy}
        >
          <Icon name="PencilSquareIcon" size={16} />
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          className={ICON_BTN}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          aria-label={`Remove ${title}`}
          disabled={busy}
        >
          <Icon name="TrashIcon" size={16} />
        </button>
      )}
    </div>
  );

  const editor = editing && (
    <form
      id={editId}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) {
          event.stopPropagation();
          setEditing(false);
        }
      }}
      className="space-y-3 border-t border-border p-3 sm:p-4"
    >
      <div>
        <label htmlFor={`${editId}-title`} className={LABEL}>
          Title <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={`${editId}-title`}
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          maxLength={120}
          autoComplete="off"
          className={INPUT}
        />
      </div>
      <PreviewField id={editId} value={draftPreview} onChange={setDraftPreview} />
      <ShapeField value={draftShape} onChange={setDraftShape} />
      <AudienceField value={draftShared} onChange={setDraftShared} />
      {editError && (
        <p role="alert" className="text-xs text-error">
          {editError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={BTN_QUIET}
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={saving || busy}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );

  const errorLine = error && (
    <p role="alert" className="border-t border-border px-3 py-2 text-xs text-error">
      {error}
    </p>
  );

  // The player of a side or slim card opens under its row, across the card; a wide card plays in place of its picture.
  const belowPlayer = playing && canEmbed && shape !== 'wide' && (
    <div className="border-t border-border p-3">
      <div className="max-w-[44rem] overflow-hidden rounded-lg">
        <Player desc={desc} title={title} />
      </div>
    </div>
  );

  const span = shape === 'wide' ? '' : 'sm:col-span-2';

  if (shape === 'wide') {
    return (
      <li className={`lab-edge lab-edge-link overflow-hidden rounded-xl border bg-card ${span}`}>
        {playing && canEmbed ? (
          <Player desc={desc} title={title} />
        ) : (
          pictureAction(media, pictureWrap)
        )}
        <div className="p-3">{titleBlock}</div>
        {actions}
        {editor}
        {errorLine}
      </li>
    );
  }

  if (shape === 'side') {
    return (
      <li className={`lab-edge lab-edge-link overflow-hidden rounded-xl border bg-card ${span}`}>
        <div className="flex">
          {pictureAction(media, pictureWrap)}
          <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
            {titleBlock}
            {actions}
          </div>
        </div>
        {belowPlayer}
        {editor}
        {errorLine}
      </li>
    );
  }

  // slim
  return (
    <li className={`lab-edge lab-edge-link overflow-hidden rounded-xl border bg-card ${span}`}>
      <div className="flex items-center gap-3 p-2.5">
        {pictureAction(media, pictureWrap)}
        {confirming ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-foreground">Remove this link?</p>
            <button
              type="button"
              className={BTN}
              onClick={() => setConfirming(false)}
              disabled={removing}
            >
              Keep it
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={remove}
              disabled={removing || busy}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ) : (
          <>
            {titleBlock}
            {slimActions}
          </>
        )}
      </div>
      {belowPlayer}
      {editor}
      {errorLine}
    </li>
  );
}

// ── The list with its add form ───────────────────────────────────────────────────────────────────────────────────

export default function LinkCards({
  items,
  canCurate,
  onAdd,
  onUpdate,
  onRemove,
  heading = 'Videos and links',
  emptyHint,
  headerExtra,
  children,
}: LinkCardsProps) {
  const formId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [shared, setShared] = useState(false);
  const [preview, setPreview] = useState('');
  const [shape, setShape] = useState<VideoShape>(VIDEO_SHAPE_DEFAULT);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const urlRef = useRef<HTMLTextAreaElement>(null);

  // The video being played is gone (removed, or the list changed under it): stop showing a player for it.
  useEffect(() => {
    if (playingId !== null && !items.some((v) => v.id === playingId)) setPlayingId(null);
  }, [items, playingId]);

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
    setShared(false);
    setPreview('');
    setShape(VIDEO_SHAPE_DEFAULT);
    setFormErrors([]);
    addButtonRef.current?.focus();
  };

  const submit = async () => {
    if (submitting) return;
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
      const image = normalizePreviewImage(preview);
      if (canCurate && !image.ok) {
        setFormErrors([image.error]);
        return;
      }
    }
    setSubmitting(true);
    const failed: { line: string; number: number; reason: string }[] = [];
    let added = 0;
    for (let i = 0; i < lines.length; i++) {
      try {
        await onAdd({
          url: lines[i],
          title: several ? '' : titleText,
          shared: canCurate && shared,
          previewImage: canCurate && !several ? preview : '',
          shape: canCurate ? shape : null,
        });
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
        ? [
            `Added ${added} of ${lines.length}.`,
            ...failed.map((f) => `Line ${f.number}: ${f.reason}`),
          ]
        : [failed[0].reason]
    );
  };

  const empty = items.length === 0;

  return (
    <section aria-label={heading} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
          <Icon name="VideoCameraIcon" size={18} className="text-muted-foreground" />
          <span>{heading}</span>
          {!empty && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {items.length}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          {!formOpen && (
            <button
              ref={addButtonRef}
              type="button"
              className={BTN}
              onClick={() => setFormOpen(true)}
              aria-expanded={false}
              aria-controls={formId}
            >
              <Icon name="PlusIcon" size={14} />
              <span>Add link</span>
            </button>
          )}
        </div>
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
          className="lab-edge space-y-3 rounded-xl border bg-card p-3 sm:p-4"
        >
          <div>
            <label htmlFor={`${formId}-url`} className={LABEL}>
              Link (YouTube, video or any resource)
            </label>
            <textarea
              id={`${formId}-url`}
              ref={urlRef}
              rows={Math.min(
                5,
                Math.max(1, several ? lines.length + 1 : Math.ceil(urlText.length / 52))
              )}
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
              <label htmlFor={`${formId}-title`} className={LABEL}>
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
          {canCurate && (
            <>
              {!several && <PreviewField id={formId} value={preview} onChange={setPreview} />}
              <ShapeField value={shape} onChange={setShape} />
              <AudienceField value={shared} onChange={setShared} />
            </>
          )}
          {showYouTubeHelper && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Private videos and playlists play only for the YouTube account that owns them.
            </p>
          )}
          {formErrors.length > 0 && (
            <div id={`${formId}-errors`} role="alert" className="space-y-0.5 text-xs text-error">
              {formErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={BTN_QUIET} onClick={closeForm} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={submitting}>
              {submitting ? 'Adding…' : several ? `Add ${lines.length} links` : 'Add link'}
            </button>
          </div>
        </form>
      )}

      {children}

      {empty && !formOpen && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
          {emptyHint}
        </p>
      )}

      {!empty && (
        <ul className="grid grid-flow-row-dense gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <LinkCard
              key={item.id}
              item={item}
              canEdit={!item.locked}
              canCurate={canCurate}
              busy={false}
              playing={playingId === item.id}
              onPlay={() => setPlayingId(item.id)}
              onStop={() => setPlayingId(null)}
              onRemove={async () => {
                await onRemove(item.id);
                setAnnouncement('Link removed.');
              }}
              onUpdate={async (patch) => {
                await onUpdate(item.id, patch);
                setAnnouncement('Link updated.');
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
