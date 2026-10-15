'use client';

/**
 * Navigation shared by the CV, DSA and System Design labs. Which screen is open lives in the URL, one
 * scheme for all three labs, so Back/Forward, a refresh, a bookmark or a shared link land on the same screen:
 *
 *   /cv-lab                               Wiki Index: the lab's overview (no params). A missing or unknown
 *                                         topic falls back to it.
 *   /cv-lab?topic=<topicId>               one topic
 *   /cv-lab?topic=<topicId>&sub=<subId>   one subtopic of that topic (an unknown sub falls back to the topic)
 *
 * Opening a topic or subtopic (wiki card, sidebar, Recent chip, Previous/Next) pushes a history entry.
 * Other params are carried along (the DSA Wiki's `view=week`), so a Back link returns to the same view.
 * Content inside a screen (the on-demand sections, the quiz carousel, the "Generate practice material"
 * panel) is not a screen: it is not persisted and has no URL.
 */

import { MouseEvent, RefObject, useCallback, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';

export const LAB_WIKI_ID = 'wiki';

interface LabTopicLike {
  id: string;
  subtopics: { id: string }[];
}

/**
 * The open screen, read from `?topic=` and `?sub=` and checked against `topics`.
 * `ready` says the topic list has finished loading: until then a topic (or subtopic) that is not in the list
 * yet (a custom one, or any topic while the DSA list is still empty) is `pending`, not "unknown", so a deep
 * link shows a loading state instead of flashing the parent screen. Once the list is ready, an unknown or
 * hand-edited id falls back to the parent screen and the address bar is corrected to match (one `replace`).
 */
export function useLabNav(topics: LabTopicLike[], ready: boolean) {
  const { pathname, searchParams, update } = useUrlState();
  const query = searchParams.toString();
  const topicParam = searchParams.get('topic');
  const subParam = searchParams.get('sub');

  const topic = topicParam ? topics.find((t) => t.id === topicParam) : undefined;
  const sub = topic && subParam ? topic.subtopics.find((s) => s.id === subParam) : undefined;

  const unknownTopic = topicParam !== null && !topic;
  const unknownSub = subParam !== null && !sub;
  useEffect(() => {
    if (!ready || (!unknownTopic && !unknownSub)) return;
    update({ topic: topic ? topic.id : null, sub: null }, 'replace');
  }, [ready, unknownTopic, unknownSub, topic, update]);

  const openTopic = useCallback(
    (id: string) =>
      update(id === LAB_WIKI_ID ? { topic: null, sub: null } : { topic: id, sub: null }),
    [update]
  );
  const openSub = useCallback(
    (topicId: string, subId: string) => update({ topic: topicId, sub: subId }),
    [update]
  );

  return {
    /** The open topic's id, or 'wiki' for the overview. */
    topicId: topic ? topic.id : LAB_WIKI_ID,
    /** The open subtopic's id, or null. */
    subId: sub ? sub.id : null,
    /** The raw `?topic=` value (used to pre-expand that topic in the sidebar on a deep link). */
    topicParam,
    /** The URL names a topic or subtopic that is not in the list yet and the list is still loading. */
    pending:
      !ready && ((Boolean(topicParam) && !topic) || (Boolean(subParam) && Boolean(topic) && !sub)),
    /** Parent of a topic screen. */
    wikiHref: buildUrl(pathname, query, { topic: null, sub: null }),
    /** Parent of a subtopic screen. */
    topicHref: buildUrl(pathname, query, { topic: topic?.id ?? null, sub: null }),
    openTopic,
    openSub,
  };
}

/** Scrolls the content pane to its top whenever `key` changes, so every screen opens at its top (also on Back/Forward). */
export function useScrollToTopOnChange(pane: RefObject<HTMLElement | null>, key: string) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pane.current) pane.current.scrollTop = 0;
  }, [pane, key]);
}

/**
 * Jump to an in-page anchor (`href="#sec-theory"`) without touching the address bar or the history. A plain
 * fragment link adds a history entry that has no router state: Back onto it changes the URL but not the screen
 * (the router ignores that entry), so the Category Index and Content Outline links use this instead.
 */
export function jumpToAnchor(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const href = e.currentTarget.getAttribute('href') ?? '';
  if (!href.startsWith('#')) return;
  e.preventDefault();
  document.getElementById(href.slice(1))?.scrollIntoView({ block: 'start' });
}

/**
 * The bar above a topic or subtopic screen: Back to the parent screen, then where you are. It stays at the
 * top of the content pane while scrolling from `md` up; on phones it scrolls with the page, so it never
 * stacks under (and hides) the sticky Topics / Copilot bar.
 */
export function LabBackBar({
  href,
  parentName,
  currentName,
}: {
  href: string;
  parentName: string;
  currentName: string;
}) {
  return (
    <div className="md:sticky md:top-0 z-20 flex items-center gap-2 px-4 py-2.5 border-b border-border mix-bg-background/95 backdrop-blur-sm">
      <BackButton
        href={href}
        label={`Back to ${parentName}`}
        className="min-w-0 shrink [&>span]:truncate"
      />
      {/* "where you are" is shown from sm up; on phones the sticky Topics bar above and the heading below already say it */}
      <Icon
        name="ChevronRightIcon"
        size={10}
        className="hidden sm:block flex-shrink-0 text-muted-foreground"
      />
      <span className="hidden sm:block min-w-0 shrink-[4] text-xs font-medium text-foreground truncate">
        {currentName}
      </span>
    </div>
  );
}

/** Shown while a deep-linked topic is still being loaded. */
export function LabScreenLoading() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="h-[40px] w-[40px] animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}
