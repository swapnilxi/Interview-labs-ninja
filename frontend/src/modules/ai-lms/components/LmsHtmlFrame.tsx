'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { lmsService } from '../services/lmsService';
import { withVisibilitySafetyNet } from '../utils/lessonVisibilitySafetyNet';
import {
  lmsTargetHref,
  resolveClassesPath,
  withLinkBridge,
  type LmsBridgeMessage,
} from '../utils/lmsLinkBridge';

interface LmsHtmlFrameProps {
  html: string;
  /** This page's path in the classes folder (e.g. "computer-vision/landingpage.html");
   * relative links resolve against it, exactly as they would on a static host. */
  filePath: string;
  classSlug: string;
  title: string;
  /** Identity of the document shown (lesson id, landing class). Scroll is kept across
   * re-renders of the same document (an edit or auto-refresh) and reset for a new one. */
  docKey: string;
  className?: string;
}

/**
 * Lesson / landing HTML in a sandboxed iframe: scripts run, but without allow-same-origin
 * so page scripts can't reach the app's auth token. Links are routed through the app --
 * relative links to other class-folder files open the matching app page, external links
 * open in a new tab, #anchors scroll inside the frame.
 */
export default function LmsHtmlFrame({
  html,
  filePath,
  classSlug,
  title,
  docKey,
  className,
}: LmsHtmlFrameProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const shownKey = useRef(docKey);

  const srcDoc = useMemo(() => {
    if (shownKey.current !== docKey) {
      shownKey.current = docKey;
      scrollY.current = 0;
    }
    return withLinkBridge(withVisibilitySafetyNet(html), scrollY.current);
  }, [html, docKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as LmsBridgeMessage | null;
      if (!data || data.__lms !== 1) return;
      if (data.type === 'scroll') {
        scrollY.current = Number(data.y) || 0;
        return;
      }
      if (data.type === 'external') {
        if (data.href && /^(https?:|mailto:|tel:)/i.test(data.href)) {
          window.open(data.href, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (data.route === 'class') {
        router.push(`/ai-lms/classes/${classSlug}`);
        return;
      }
      const resolved = data.href
        ? resolveClassesPath(data.href, filePath || `${classSlug}/`)
        : null;
      if (!resolved) return;
      lmsService
        .resolvePath(resolved.path)
        .then((target) => router.push(lmsTargetHref(target) + resolved.hash))
        .catch(() => console.warn(`[ai-lms] no app page matches ${resolved.path}`));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router, classSlug, filePath]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      title={title}
      sandbox="allow-scripts"
      className={className ?? 'w-full h-full flex-1 border-0'}
    />
  );
}
