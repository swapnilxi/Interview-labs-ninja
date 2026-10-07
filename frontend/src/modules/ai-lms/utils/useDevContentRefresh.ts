'use client';

import { useEffect, useRef } from 'react';
import type { LmsContentStatus } from '../types';

const POLL_MS = 2000;

/**
 * Development only: while the tab is visible, polls `check()` every 2s and calls
 * `onChange()` when the reported content hash differs from `currentHash`. This is how an
 * IDE save of a lesson or landingpage.html file shows up in the open page. Polling stops
 * when the server reports there is no classes folder to edit.
 */
export function useDevContentRefresh(opts: {
  enabled: boolean;
  currentHash: string | undefined;
  check: () => Promise<LmsContentStatus>;
  onChange: () => void;
}): void {
  const { enabled, currentHash } = opts;
  const checkRef = useRef(opts.check);
  const onChangeRef = useRef(opts.onChange);

  useEffect(() => {
    checkRef.current = opts.check;
    onChangeRef.current = opts.onChange;
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !enabled || !currentHash) return;
    let stopped = false;
    let busy = false;
    const timer = window.setInterval(async () => {
      if (stopped || busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const status = await checkRef.current();
        if (stopped) return;
        if (!status.file_sync) {
          stopped = true;
          window.clearInterval(timer);
        } else if (status.content_hash !== currentHash) {
          onChangeRef.current();
        }
      } catch {
        // Backend briefly unavailable: try again on the next tick.
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, currentHash]);
}
