'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * The mark a link, resource or code card shows when it has no preview image: the icon its owner picked, else the site's own
 * favicon (loaded from that site, no third-party service), else an icon guessed from the url. The slugs are LINK_ICONS in
 * backend/modules/lab_sections/videos.py and fe-apis/labSections/videos.ts; keep the three lists in step.
 */

export const LINK_ICON_OPTIONS = [
  { slug: 'link', label: 'Link', icon: 'LinkIcon' },
  { slug: 'video', label: 'Video', icon: 'PlayCircleIcon' },
  { slug: 'article', label: 'Article', icon: 'NewspaperIcon' },
  { slug: 'doc', label: 'Doc', icon: 'DocumentTextIcon' },
  { slug: 'pdf', label: 'PDF', icon: 'DocumentIcon' },
  { slug: 'code', label: 'Code', icon: 'CodeBracketIcon' },
  { slug: 'repo', label: 'Repo', icon: 'CommandLineIcon' },
  { slug: 'slides', label: 'Slides', icon: 'PresentationChartBarIcon' },
  { slug: 'sheet', label: 'Sheet', icon: 'TableCellsIcon' },
  { slug: 'book', label: 'Book', icon: 'BookOpenIcon' },
  { slug: 'course', label: 'Course', icon: 'AcademicCapIcon' },
  { slug: 'image', label: 'Image', icon: 'PhotoIcon' },
  { slug: 'audio', label: 'Audio', icon: 'MusicalNoteIcon' },
  { slug: 'tool', label: 'Tool', icon: 'WrenchScrewdriverIcon' },
] as const;

export type LinkIconSlug = (typeof LINK_ICON_OPTIONS)[number]['slug'];

const ICON_BY_SLUG: Record<string, string> = Object.fromEntries(
  LINK_ICON_OPTIONS.map((o) => [o.slug, o.icon])
);
const LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  LINK_ICON_OPTIONS.map((o) => [o.slug, o.label])
);

export function linkIconName(slug: string): string {
  return ICON_BY_SLUG[slug] ?? 'LinkIcon';
}

export function linkIconLabel(slug: string): string {
  return LABEL_BY_SLUG[slug] ?? 'Link';
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  return parse(url)?.hostname.replace(/^www\./, '') ?? '';
}

/** What kind of resource a url most likely is, from its host and file extension. */
export function guessLinkIcon(url: string): LinkIconSlug {
  const u = parse(url);
  if (!u) return 'link';
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname.toLowerCase();
  const ext = path.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['py', 'js', 'ts', 'java', 'cpp', 'c', 'go', 'rs', 'ipynb'].includes(ext)) return 'code';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (['doc', 'docx', 'md', 'txt'].includes(ext)) return 'doc';
  if (/(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/.test(host)) return 'repo';
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|loom\.com)$/.test(host)) return 'video';
  if (/(^|\.)(leetcode\.com|neetcode\.io|hackerrank\.com|codeforces\.com|replit\.com|codepen\.io|colab\.research\.google\.com)$/.test(host))
    return 'code';
  if (host === 'docs.google.com') {
    if (path.startsWith('/presentation')) return 'slides';
    if (path.startsWith('/spreadsheets')) return 'sheet';
    return 'doc';
  }
  if (/(^|\.)(notion\.so|notion\.site|readthedocs\.io)$/.test(host) || host.startsWith('docs.')) return 'doc';
  if (/(^|\.)(coursera\.org|udemy\.com|edx\.org|khanacademy\.org)$/.test(host)) return 'course';
  if (/(^|\.)(medium\.com|substack\.com|dev\.to|hashnode\.dev|geeksforgeeks\.org|wikipedia\.org)$/.test(host))
    return 'article';
  if (/(^|\.)(arxiv\.org|oreilly\.com|books\.google\.com)$/.test(host)) return 'book';
  return 'link';
}

/** The site's own favicon (https only; nothing is fetched for any other scheme). */
export function faviconUrl(url: string): string {
  const u = parse(url);
  return u && u.protocol === 'https:' ? `${u.origin}/favicon.ico` : '';
}

/**
 * A rounded tile with the card's mark. `icon` = the owner's pick ('' = automatic: favicon, then a guess from the url).
 * `size` is the tile's edge in rem.
 */
export function LinkMark({
  url,
  icon = '',
  size = 2.5,
  className = '',
}: {
  url: string;
  icon?: string;
  size?: number;
  className?: string;
}) {
  const fav = icon ? '' : faviconUrl(url);
  const [failed, setFailed] = useState('');
  const showFav = !!fav && failed !== fav;
  const glyph = linkIconName(icon || guessLinkIcon(url));
  const px = Math.round(size * 16);
  return (
    <span
      aria-hidden="true"
      style={{ width: `${size}rem`, height: `${size}rem` }}
      className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card lab-ink ${className}`}
    >
      {showFav ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fav}
          alt=""
          width={Math.round(px * 0.55)}
          height={Math.round(px * 0.55)}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(fav)}
          onLoad={(e) => {
            // Some sites answer /favicon.ico with a 1x1 or empty image: treat that like no favicon.
            if (e.currentTarget.naturalWidth < 8) setFailed(fav);
          }}
          className="object-contain"
        />
      ) : (
        <Icon name={glyph} size={Math.round(px * 0.5)} />
      )}
    </span>
  );
}

/** A picker for the mark: Automatic, or one of the icons. */
export function LinkIconPicker({
  value,
  onChange,
  label = 'Icon',
}: {
  value: string;
  onChange: (slug: string) => void;
  label?: string;
}) {
  const chip = (on: boolean) =>
    `inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors sm:min-h-[2.25rem] ${
      on
        ? 'mix-border-primary/50 lab-tint lab-ink'
        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;
  return (
    <div>
      <p className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground">(shown when there is no preview image)</span>
      </p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        <button type="button" role="radio" aria-checked={value === ''} onClick={() => onChange('')} className={chip(value === '')}>
          <Icon name="SparklesIcon" size={14} />
          <span>Automatic</span>
        </button>
        {LINK_ICON_OPTIONS.map((o) => (
          <button
            key={o.slug}
            type="button"
            role="radio"
            aria-checked={value === o.slug}
            onClick={() => onChange(o.slug)}
            className={chip(value === o.slug)}
          >
            <Icon name={o.icon} size={14} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
