'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  const [hostTheme, setHostTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  useEffect(() => {
    const handleThemeSync = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const theme: 'light' | 'dark' = isDark ? 'dark' : 'light';
      setHostTheme(theme);
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { __lms: 1, type: 'set-theme', theme },
          '*'
        );
      }
    };
    handleThemeSync();

    const observer = new MutationObserver(handleThemeSync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onCustomThemeChange = () => {
      handleThemeSync();
    };
    window.addEventListener('interview-ninja-theme-change', onCustomThemeChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('interview-ninja-theme-change', onCustomThemeChange);
    };
  }, []);

  const srcDoc = useMemo(() => {
    if (shownKey.current !== docKey) {
      shownKey.current = docKey;
      scrollY.current = 0;
    }
    return withLinkBridge(withVisibilitySafetyNet(html), scrollY.current, hostTheme);
  }, [html, docKey, hostTheme]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as LmsBridgeMessage | null;
      if (!data || data.__lms !== 1) return;
      if (data.type === 'scroll') {
        scrollY.current = Number(data.y) || 0;
        return;
      }
      if (data.type === 'theme-toggle' && (data.theme === 'light' || data.theme === 'dark')) {
        const nextTheme = data.theme;
        setHostTheme(nextTheme);
        try {
          localStorage.setItem('interview-ninja-theme', nextTheme);
        } catch (e) {}
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
        window.dispatchEvent(new CustomEvent('interview-ninja-theme-change', { detail: nextTheme }));
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
