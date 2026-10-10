'use client';

export type SidebarMode = 'hidden' | 'icon-only';

const STORAGE_KEY = 'labninja.sidebar_mode.v1';
const EVENT_NAME = 'labninja:sidebar-mode-change';

/**
 * Gets the stored sidebar mode. Defaults to 'icon-only' so the user has immediate
 * access to the icon menu rather than it being completely hidden.
 */
export function getStoredSidebarMode(): SidebarMode {
  if (typeof window === 'undefined') return 'icon-only';
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'hidden' || val === 'icon-only') return val;
  } catch (e) {
    // ignore
  }
  return 'icon-only';
}

/**
 * Persists the sidebar mode and applies the required document classes.
 */
export function setStoredSidebarMode(mode: SidebarMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {
    // ignore
  }
  applySidebarMode(mode);
}

/**
 * Applies the sidebar rail class to document.documentElement and document.body,
 * and notifies any listening components.
 */
export function applySidebarMode(mode: SidebarMode): void {
  if (typeof document === 'undefined') return;
  const isIconOnly = mode === 'icon-only';
  document.documentElement.classList.toggle('has-sidebar-rail', isIconOnly);
  if (document.body) {
    document.body.classList.toggle('has-sidebar-rail', isIconOnly);
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { mode } }));
}

/**
 * Subscribes to sidebar mode changes across components.
 */
export function subscribeSidebarMode(callback: (mode: SidebarMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ mode: SidebarMode }>;
    if (custom.detail?.mode) {
      callback(custom.detail.mode);
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}
