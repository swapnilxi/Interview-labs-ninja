'use client';

import { useEffect, useState } from 'react';

/**
 * Label for the distraction-capture shortcut: "Option+D" on a Mac, "Alt+D" elsewhere.
 * Resolved after mount so the server-rendered and first client markup match.
 */
export function useDistractionShortcutLabel(): string {
  const [label, setLabel] = useState('Alt+D');
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setLabel('Option+D');
  }, []);
  return label;
}
