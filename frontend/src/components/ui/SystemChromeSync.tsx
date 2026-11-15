'use client';

import { useEffect } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** The page background of each theme (tailwind.css --color-background): what the status / address bar should match. */
const THEME_COLOR = { dark: '#080b12', light: '#f5f6fa' } as const;

function applySystemChrome(isDark: boolean) {
  // Android Chrome / installed PWAs tint the status + address bar from theme-color. The in-app theme can differ from
  // the system one, so the meta follows the app (the pre-paint script in app/layout.tsx sets it before first paint).
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', isDark ? THEME_COLOR.dark : THEME_COLOR.light));

  // The Android app (Capacitor): status-bar icons must contrast with the app's own bar, not the phone's theme —
  // otherwise a dark app on a light phone gets dark icons on a dark bar. `Dark` = light icons for a dark background.
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {
      /* older shell without SystemBars: the bar keeps its default style */
    });
  }
}

/**
 * Keeps the system chrome (status bar icons, browser theme-color) on the in-app theme. Mounted once in the root
 * layout; it watches <html class="dark">, so every way of switching theme (header, More sheet, Settings) is covered.
 */
export default function SystemChromeSync() {
  useEffect(() => {
    const root = document.documentElement;
    let last: boolean | null = null;
    const sync = () => {
      const isDark = root.classList.contains('dark');
      if (isDark === last) return;
      last = isDark;
      applySystemChrome(isDark);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return null;
}
