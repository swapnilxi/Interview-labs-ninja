'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Installing LabNinja: the Android app (an APK the site hosts, see app/install_app.sh --publish) and the web app
 * (the manifest in app/manifest.ts). Settings > Install app is the one place that offers both.
 */

/** Where the APK is served. NEXT_PUBLIC_ANDROID_APK_URL can point at a release page or bucket instead. */
export const APK_URL = process.env.NEXT_PUBLIC_ANDROID_APK_URL || '/downloads/labninja.apk';
/** Written next to the APK by `./app/install_app.sh --publish`. */
export const APK_META_URL = '/downloads/labninja-apk.json';

export interface ApkMeta {
  version: string;
  versionCode: number;
  bytes: number;
  builtAt: string;
}

/** Chrome / Edge / Samsung Internet's install event (not in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    /** Set by the root layout's inline script, so an event that fires before React loads is not lost. */
    __labninjaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type InstallPlatform = 'android' | 'ios' | 'desktop';

export interface InstallEnv {
  /** Running inside the Capacitor Android app. */
  native: boolean;
  /** Running as the installed web app (opened from the home screen or dock). */
  standalone: boolean;
  platform: InstallPlatform;
}

export function detectInstallEnv(): InstallEnv {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    native: Capacitor.isNativePlatform(),
    standalone,
    platform: ios ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop',
  };
}

/** Inside the Android app. False on the server and the first client render, so markup matches while hydrating. */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(Capacitor.isNativePlatform()), []);
  return native;
}

export async function fetchApkMeta(): Promise<ApkMeta | null> {
  try {
    const res = await fetch(APK_META_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ApkMeta>;
    if (typeof data.bytes !== 'number' || data.bytes <= 0) return null;
    return {
      version: String(data.version ?? ''),
      versionCode: Number(data.versionCode ?? 0),
      bytes: data.bytes,
      builtAt: String(data.builtAt ?? ''),
    };
  } catch {
    return null;
  }
}

// ── The browser's install prompt ──────────────────────────────────────────────────────────────────────────────
// Chrome fires `beforeinstallprompt` once per page load, often before Settings is open, so it is kept here (and by
// the layout's inline script) until someone taps Install. The event is not cancelled: the browser's own install
// UI keeps working as before.

interface PromptState {
  event: BeforeInstallPromptEvent | null;
  installed: boolean;
}

const SERVER_STATE: PromptState = { event: null, installed: false };
let state: PromptState = SERVER_STATE;
const subscribers = new Set<() => void>();
let listening = false;

function setState(next: Partial<PromptState>) {
  state = { ...state, ...next };
  subscribers.forEach((notify) => notify());
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  if (window.__labninjaInstallPrompt) state = { ...state, event: window.__labninjaInstallPrompt };
  window.addEventListener('beforeinstallprompt', (e) => {
    setState({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    window.__labninjaInstallPrompt = null;
    setState({ event: null, installed: true });
  });
}

function subscribe(notify: () => void) {
  listen();
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** `canInstall`: the browser handed over its install prompt; `install()` shows it (each event can be used once). */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE
  );

  const install = async (): Promise<InstallOutcome> => {
    const event = state.event;
    if (!event) return 'unavailable';
    window.__labninjaInstallPrompt = null;
    setState({ event: null });
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setState({ installed: true });
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  };

  return { canInstall: snapshot.event !== null, installed: snapshot.installed, install };
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
