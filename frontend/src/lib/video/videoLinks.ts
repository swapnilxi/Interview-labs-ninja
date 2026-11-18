/**
 * Video links: what a link may be, and how each kind of link is shown.
 *
 * One pure file (no React, no I/O) used by the browser (the add form and the cards) and by the Next.js API
 * (fe-apis/lms/videos.ts, fe-apis/labSections/videos.ts). Python's twin of the VALIDATION is
 * backend/modules/common/video_links.py; the two accept and refuse exactly the same strings and say the same words,
 * so change both. Showing a link (`describeVideo`) happens only in the browser.
 *
 * What is stored for a video is only its url and an optional title. Everything else (provider, playlist or video,
 * start time, embed address) is derived from the url here, so nothing needs migrating when an embed rule improves.
 *
 * ── YouTube embeds: www.youtube.com/embed, deliberately NOT youtube-nocookie.com ────────────────────────────────
 * The nocookie domain never sends the viewer's YouTube login, so a PRIVATE video or playlist could not play even for
 * its owner. The normal embed sends it, so the owner (and anyone the video is shared with) can watch inside the page,
 * as long as the browser allows third-party cookies. The price is that YouTube may set cookies once the viewer
 * presses Play. That is why the iframe is only created AFTER the click (no request to Google before it), why the
 * card always has an "Open on YouTube" link as well (a private video only plays inside the page for its owner), and
 * why the add form tells people to set shared videos to Unlisted. YouTube also refuses an embed that sends no
 * referrer, so the iframe uses `strict-origin-when-cross-origin`, which next.config.mjs already sends for the site.
 *
 * Embeds exist ONLY for the providers below. Anything else is a plain link. A user's text never reaches an iframe
 * `src` except through these builders (ids are matched against strict patterns first).
 */

export const VIDEO_MAX_PER_ITEM = 20;
export const VIDEO_URL_MAX = 500;
export const VIDEO_TITLE_MAX = 120;

export const VIDEO_URL_ERROR = 'Enter a full link that starts with https://.';
export const VIDEO_URL_TOO_LONG = `That link is too long. Links can be at most ${VIDEO_URL_MAX} characters.`;
export const VIDEO_TITLE_TOO_LONG = `A title can be at most ${VIDEO_TITLE_MAX} characters.`;
export const VIDEO_TITLE_NOT_TEXT = 'A title must be text.';
export const VIDEO_LIMIT_ERROR = `At most ${VIDEO_MAX_PER_ITEM} videos per item.`;
export const VIDEO_DUPLICATE_ERROR = 'That video is already added.';

// Presentation of a lab link (an admin sets it): a rectangular card shape and a preview image. Not used by AI LMS.
// Mirrored in backend/modules/common/video_links.py.
export const VIDEO_SHAPES = ['wide', 'side', 'slim'] as const;
export type VideoShape = (typeof VIDEO_SHAPES)[number];
export const VIDEO_SHAPE_DEFAULT: VideoShape = 'wide';
/** The decoded size of an uploaded image: 200 KB. */
export const PREVIEW_BYTES_MAX = 204800;
/** ...as base64 characters (273068). */
export const PREVIEW_PAYLOAD_MAX = Math.ceil(PREVIEW_BYTES_MAX / 3) * 4;
export const VIDEO_SHAPE_ERROR = 'A shape must be wide, side or slim.';
export const PREVIEW_ERROR =
  'A preview image must be an https:// link or a JPEG, PNG, WebP or GIF image.';
export const PREVIEW_URL_TOO_LONG = `That image link is too long. Links can be at most ${VIDEO_URL_MAX} characters.`;
export const PREVIEW_TOO_BIG = 'That image is too large. A preview image can be at most 200 KB.';
export const VIDEO_SHARED_ERROR = 'Shared must be true or false.';

// ── Validation (mirrored in backend/modules/common/video_links.py) ─────────────────────────────────────────────

/** Whitespace and control characters of every kind, as explicit ranges so Python's twin matches exactly. */
const FORBIDDEN_RANGE = '\\u0000-\\u0020\\u007f-\\u00a0\\u1680\\u2000-\\u200f\\u2028-\\u202f\\u205f\\u3000\\ufeff';
const FORBIDDEN = new RegExp(`[${FORBIDDEN_RANGE}]`);
const EDGE_WHITESPACE = new RegExp(`^[${FORBIDDEN_RANGE}]+|[${FORBIDDEN_RANGE}]+$`, 'g');
const RUN_OF_FORBIDDEN = new RegExp(`[${FORBIDDEN_RANGE}]+`, 'g');

/** One host label: letters, digits and inner hyphens. No underscore, no unicode (use the punycode form). */
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
/** http(s)://host[:port][/path?query#fragment], and no `user:pass@` (an `@` before the path cannot match). */
const URL_SHAPE = new RegExp(`^https?://${LABEL}(?:\\.${LABEL})*(?::([0-9]{1,5}))?(?:[/?#].*)?$`, 'i');

/** Characters as a person counts them (a code point), the same way Python's len() does. */
const charCount = (text: string) => Array.from(text).length;

/** Not a discriminated union on purpose: the project builds without strictNullChecks, where `if (!r.ok)` would not narrow one. */
export interface VideoUrlResult {
  ok: boolean;
  /** The trimmed link; '' when not ok. */
  url: string;
  /** The plain message to show; '' when ok. */
  error: string;
}

const urlFail = (error: string): VideoUrlResult => ({ ok: false, url: '', error });

/** The trimmed link when it is a valid video link, else the plain message to show. Never throws. */
export function normalizeVideoUrl(input: unknown): VideoUrlResult {
  if (typeof input !== 'string') return urlFail(VIDEO_URL_ERROR);
  const url = input.replace(EDGE_WHITESPACE, '');
  if (url.length === 0 || FORBIDDEN.test(url)) return urlFail(VIDEO_URL_ERROR);
  if (charCount(url) > VIDEO_URL_MAX) return urlFail(VIDEO_URL_TOO_LONG);
  const match = URL_SHAPE.exec(url);
  if (!match) return urlFail(VIDEO_URL_ERROR);
  const port = match[1];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return urlFail(VIDEO_URL_ERROR);
  }
  return { ok: true, url, error: '' };
}

export interface VideoTitleResult {
  ok: boolean;
  /** The cleaned title ('' is allowed); '' when not ok. */
  title: string;
  /** The plain message to show; '' when ok. */
  error: string;
}

/** A title is optional: runs of whitespace and control characters become one space, then it is trimmed. */
export function cleanVideoTitle(input: unknown): VideoTitleResult {
  if (input === undefined || input === null) return { ok: true, title: '', error: '' };
  if (typeof input !== 'string') return { ok: false, title: '', error: VIDEO_TITLE_NOT_TEXT };
  const title = input.replace(RUN_OF_FORBIDDEN, ' ').replace(/^ +| +$/g, '');
  if (charCount(title) > VIDEO_TITLE_MAX) return { ok: false, title: '', error: VIDEO_TITLE_TOO_LONG };
  return { ok: true, title, error: '' };
}

export interface VideoShapeResult {
  ok: boolean;
  /** null = not sent (leave as it is / use the default); never set when not ok. */
  shape: VideoShape | null;
  error: string;
}

/** undefined and null stay "not sent"; otherwise one of VIDEO_SHAPES. */
export function normalizeVideoShape(input: unknown): VideoShapeResult {
  if (input === undefined || input === null) return { ok: true, shape: null, error: '' };
  if (typeof input !== 'string' || !(VIDEO_SHAPES as readonly string[]).includes(input)) {
    return { ok: false, shape: null, error: VIDEO_SHAPE_ERROR };
  }
  return { ok: true, shape: input as VideoShape, error: '' };
}

export interface PreviewImageResult {
  ok: boolean;
  /** '' for no image (undefined, null and '' all mean that); else the https link or data URL to store. */
  image: string;
  error: string;
}

/** An https link or an uploaded image as a data URL (JPEG, PNG, WebP, GIF, up to PREVIEW_BYTES_MAX); nothing else. */
const HTTPS_PREFIX = /^https:\/\//i;
const HTTPS_SHAPE = new RegExp(
  `^https://${LABEL}(?:\\.${LABEL})*(?::([0-9]{1,5}))?(?:[/?#].*)?$`,
  'i'
);
const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

export function normalizePreviewImage(input: unknown): PreviewImageResult {
  const fail = (error: string): PreviewImageResult => ({ ok: false, image: '', error });
  if (input === undefined || input === null) return { ok: true, image: '', error: '' };
  if (typeof input !== 'string') return fail(PREVIEW_ERROR);
  const text = input.replace(EDGE_WHITESPACE, '');
  if (text === '') return { ok: true, image: '', error: '' };
  const data = DATA_IMAGE.exec(text);
  if (data) {
    const payload = data[1];
    if (payload.length % 4 !== 0) return fail(PREVIEW_ERROR);
    if (payload.length > PREVIEW_PAYLOAD_MAX) return fail(PREVIEW_TOO_BIG);
    return { ok: true, image: text, error: '' };
  }
  if (!HTTPS_PREFIX.test(text) || FORBIDDEN.test(text)) return fail(PREVIEW_ERROR);
  if (charCount(text) > VIDEO_URL_MAX) return fail(PREVIEW_URL_TOO_LONG);
  const match = HTTPS_SHAPE.exec(text);
  if (!match) return fail(PREVIEW_ERROR);
  const port = match[1];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return fail(PREVIEW_ERROR);
  return { ok: true, image: text, error: '' };
}

// ── Showing a link (browser) ───────────────────────────────────────────────────────────────────────────────────

export type VideoProvider = 'youtube' | 'vimeo' | 'loom' | 'file' | 'link';

export interface VideoDescription {
  provider: VideoProvider;
  /** The host without "www.", e.g. "youtube.com". */
  host: string;
  /** YouTube only: a single video, or a whole playlist. A video opened inside a playlist is a 'video' with a `playlistId`. */
  kind?: 'video' | 'playlist';
  videoId?: string;
  playlistId?: string;
  /** YouTube start time in seconds (`t=`, `start=`: 90, 90s, 1m30s, 1h2m3s). */
  start?: number;
  /**
   * What Play shows. An iframe address for youtube, vimeo and loom; for a direct file the file itself (it goes in a
   * <video> element). Undefined for a plain link.
   */
  embedUrl?: string;
  /** What the card says when the person typed no title. Never a raw address. */
  label: string;
  /** Where "Open" goes: the link exactly as it was saved. */
  href: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** PL…, UU…, OLAK5uy_…, RD… mixes, LL, WL: 2 to 80 url-safe characters. */
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{2,80}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,16}$/;
const LOOM_ID = /^[A-Za-z0-9]{16,64}$/;
const VIDEO_FILE = /\.(?:mp4|webm|mov|m4v)$/i;

function bareHost(hostname: string): string {
  const host = hostname.toLowerCase();
  return host.startsWith('www.') ? host.slice(4) : host;
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** True when the text looks like a YouTube link (host only), valid or not: the add form uses it for its helper line. */
export function looksLikeYouTube(raw: string): boolean {
  const url = parseUrl(raw.trim());
  return !!url && YOUTUBE_HOSTS.has(bareHost(url.hostname));
}

/** `90`, `90s`, `1m30s`, `1h2m3s` to seconds; anything else (or 0, or more than 99:59:59) to undefined. */
export function parseStartTime(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /^(?:([0-9]{1,3})h)?(?:([0-9]{1,4})m)?(?:([0-9]{1,6})s?)?$/i.exec(raw.trim());
  if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 && seconds <= 359999 ? seconds : undefined;
}

function describeYouTube(url: URL, raw: string): VideoDescription | null {
  const query = url.searchParams;
  const parts = url.pathname.split('/').filter(Boolean);
  const list = query.get('list');
  const playlistId = list && YOUTUBE_LIST_ID.test(list) ? list : undefined;
  let videoId: string | undefined;

  if (bareHost(url.hostname) === 'youtu.be') {
    if (parts[0] && YOUTUBE_VIDEO_ID.test(parts[0])) videoId = parts[0];
  } else if (parts[0] === 'watch') {
    const v = query.get('v');
    if (v && YOUTUBE_VIDEO_ID.test(v)) videoId = v;
  } else if (parts[0] === 'playlist') {
    // A playlist page: only its list id matters.
  } else if (parts[0] === 'embed' && parts[1] === 'videoseries') {
    // An embedded playlist: the list id is in the query.
  } else if (['shorts', 'live', 'embed', 'v'].includes(parts[0] ?? '')) {
    if (parts[1] && YOUTUBE_VIDEO_ID.test(parts[1])) videoId = parts[1];
  } else {
    return null; // a channel, a search, the home page: a plain link
  }
  if (!videoId && !playlistId) return null;

  const start = videoId ? parseStartTime(query.get('t') ?? query.get('start')) : undefined;
  const params: string[] = [];
  let path: string;
  if (videoId) {
    path = `/embed/${videoId}`;
    if (playlistId) params.push(`list=${playlistId}`);
  } else {
    path = '/embed/videoseries';
    params.push(`list=${playlistId}`);
  }
  params.push('rel=0', 'playsinline=1');
  if (start) params.push(`start=${start}`);

  return {
    provider: 'youtube',
    host: bareHost(url.hostname) === 'youtu.be' ? 'youtu.be' : 'youtube.com',
    kind: videoId ? 'video' : 'playlist',
    videoId,
    playlistId,
    start,
    embedUrl: `https://www.youtube.com${path}?${params.join('&')}`,
    label: videoId ? 'YouTube video' : 'YouTube playlist',
    href: raw,
  };
}

function describeVimeo(url: URL, raw: string): VideoDescription | null {
  const host = bareHost(url.hostname);
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  let hash: string | undefined = url.searchParams.get('h') ?? undefined;

  if (host === 'player.vimeo.com') {
    if (parts[0] === 'video' && parts[1] && VIMEO_ID.test(parts[1])) id = parts[1];
  } else if (parts[0] && VIMEO_ID.test(parts[0])) {
    id = parts[0];
    if (parts[1] && VIMEO_HASH.test(parts[1])) hash = parts[1];
  } else if (parts[0] === 'channels' && parts[2] && VIMEO_ID.test(parts[2])) {
    id = parts[2];
  } else if (parts[0] === 'groups' && parts[2] === 'videos' && parts[3] && VIMEO_ID.test(parts[3])) {
    id = parts[3];
  }
  if (!id) return null;
  if (hash && !VIMEO_HASH.test(hash)) hash = undefined;
  return {
    provider: 'vimeo',
    host: 'vimeo.com',
    videoId: id,
    embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`,
    label: 'Vimeo video',
    href: raw,
  };
}

function describeLoom(url: URL, raw: string): VideoDescription | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if ((parts[0] === 'share' || parts[0] === 'embed') && parts[1] && LOOM_ID.test(parts[1])) {
    return {
      provider: 'loom',
      host: 'loom.com',
      videoId: parts[1],
      embedUrl: `https://www.loom.com/embed/${parts[1]}`,
      label: 'Loom video',
      href: raw,
    };
  }
  return null;
}

/**
 * The thumbnail a card shows when no preview image was attached: only for a YouTube video (not a playlist), built from the
 * video id by a fixed rule. Nothing about a link is ever fetched to make a preview (that would be a server-side request
 * to an address a user typed).
 */
export function youTubeThumbnail(desc: VideoDescription): string | undefined {
  return desc.provider === 'youtube' && desc.videoId
    ? `https://i.ytimg.com/vi/${desc.videoId}/hqdefault.jpg`
    : undefined;
}

/** How a saved link is shown. Pass a link that passed `normalizeVideoUrl`; anything else comes back as a plain link. */
export function describeVideo(raw: string): VideoDescription {
  const url = parseUrl(raw);
  const plain = (host: string): VideoDescription => ({ provider: 'link', host, label: host || 'Link', href: raw });
  if (!url) return plain('');
  const host = bareHost(url.hostname);

  let described: VideoDescription | null = null;
  if (YOUTUBE_HOSTS.has(host)) described = describeYouTube(url, raw);
  else if (host === 'vimeo.com' || host === 'player.vimeo.com') described = describeVimeo(url, raw);
  else if (host === 'loom.com') described = describeLoom(url, raw);
  if (described) return described;

  if (VIDEO_FILE.test(url.pathname)) {
    return { provider: 'file', host, embedUrl: raw, label: 'Video file', href: raw };
  }
  return plain(host);
}
