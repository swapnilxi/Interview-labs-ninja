'use client';

import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/labs/common/Markdown';
import { LinkMark, guessLinkIcon, hostOf, linkIconLabel } from '@/modules/labs/common/linkIcons';

/**
 * The "References & Resources" section drawn as link cards: every list item that holds a link becomes a card (the site's
 * mark, title, the note the AI wrote beside it, host); headings group the cards and any other text stays Markdown. A body
 * without a single link renders as plain Markdown.
 */

interface Resource {
  title: string;
  url: string;
  note: string;
  kind: string;
}

interface Group {
  heading: string;
  intro: string[];
  items: Resource[];
}

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const BARE_URL = /<?(https?:\/\/[^\s>)]+)>?/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const BOLD_HEADING = /^\s*\*\*([^*]+)\*\*:?\s*$/;

const strip = (text: string) =>
  text
    .replace(/\*\*|__|`/g, '')
    .replace(/^[\s:–—-]+/, '')
    .replace(/[\s:–—-]+$/, '')
    .trim();

function parseItem(line: string): Resource | null {
  const md = line.match(MD_LINK);
  let title: string;
  let url: string;
  let rest: string;
  if (md) {
    title = strip(md[1]);
    url = md[2];
    rest = line.replace(md[0], ' ');
  } else {
    const bare = line.match(BARE_URL);
    if (!bare) return null;
    url = bare[1].replace(/[.,;]+$/, '');
    rest = line.replace(bare[0], ' ');
    title = '';
  }
  // "**Book:** [Title](url) — why it helps": the bold prefix is a label, the tail is the note.
  const label = rest.match(/^\s*\*\*([^*]+)\*\*:?/);
  let note = rest;
  if (label) note = note.replace(label[0], ' ');
  note = strip(note.replace(/\s+/g, ' '));
  if (!title) {
    title = label ? strip(label[1]) : hostOf(url) || url;
  } else if (label && !note) {
    note = strip(label[1]);
  }
  return { title, url, note, kind: linkIconLabel(guessLinkIcon(url)) };
}

function parse(content: string): Group[] {
  const groups: Group[] = [{ heading: '', intro: [], items: [] }];
  for (const line of content.split(/\r?\n/)) {
    const cur = groups[groups.length - 1];
    const h = line.match(HEADING) ?? line.match(BOLD_HEADING);
    if (h) {
      groups.push({ heading: strip(h[1]), intro: [], items: [] });
      continue;
    }
    const li = line.match(LIST_ITEM);
    const item = li ? parseItem(li[1]) : null;
    if (item) {
      cur.items.push(item);
      continue;
    }
    if (line.trim()) cur.intro.push(line);
  }
  return groups.filter((g) => g.heading || g.intro.length || g.items.length);
}

function ResourceCard({ r }: { r: Resource }) {
  const host = hostOf(r.url);
  return (
    <li>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className="todo-focus group lab-edge lab-edge-link flex h-full items-start gap-3 rounded-xl border bg-card p-3"
      >
        <LinkMark url={r.url} size={2.5} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-snug text-foreground">
            {r.title}
          </span>
          {r.note && (
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {r.note}
            </span>
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
            <span>{r.kind}</span>
            {host && (
              <>
                <span aria-hidden="true">·</span>
                <span className="break-all">{host}</span>
              </>
            )}
          </span>
        </span>
        <Icon
          name="ArrowTopRightOnSquareIcon"
          size={14}
          className="mt-0.5 flex-shrink-0 text-muted-foreground transition-colors group-hover:lab-ink"
        />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}

export default function ResourceCards({ content }: { content: string }) {
  const groups = parse(content);
  if (!groups.some((g) => g.items.length > 0)) return <Markdown content={content} />;
  return (
    <div className="space-y-5">
      {groups.map((g, i) => (
        <section key={`${g.heading}-${i}`} className="space-y-2.5">
          {g.heading && <h4 className="text-sm font-semibold text-foreground">{g.heading}</h4>}
          {g.intro.length > 0 && <Markdown content={g.intro.join('\n')} />}
          {g.items.length > 0 && (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {g.items.map((r, j) => (
                <ResourceCard key={`${r.url}-${j}`} r={r} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
