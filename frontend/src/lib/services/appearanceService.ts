'use client';

// Global accent-color theme setting. Unlike the per-class/subject/project
// accent_color in modules/ai-lms (DB-backed, per-entity), this is a single
// app-wide choice stored per-browser (like the AI provider settings in
// settingsService.ts) that re-points the core --color-primary/--color-ring/
// --color-glow CSS variables every component already consumes, so buttons,
// links, focus rings, and glow/hover effects update everywhere at once.

const STORAGE_KEY = 'labninja.appearance.v1';

export interface AccentPreset {
  key: string;
  label: string;
  /** null = the app's built-in default indigo, i.e. no override applied. */
  hex: string | null;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'default', label: 'Default', hex: null },
  { key: 'orange', label: 'Orange', hex: '#F97316' },
  { key: 'indigo-purple', label: 'Indigo', hex: '#7131CC' },
  { key: 'violet', label: 'Violet', hex: '#6B4F8A' },
  { key: 'emerald', label: 'Emerald', hex: '#10B981' },
  { key: 'sky', label: 'Sky Blue', hex: '#0EA5E9' },
  { key: 'rose', label: 'Rose', hex: '#EC4899' },
];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

function mixRgb(from: RGB, toward: RGB, amount: number): RGB {
  return [
    from[0] + (toward[0] - from[0]) * amount,
    from[1] + (toward[1] - from[1]) * amount,
    from[2] + (toward[2] - from[2]) * amount,
  ];
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export interface DerivedAccentTokens {
  primary: string;
  primaryForeground: string;
  ring: string;
  glow: string;
}

/**
 * Derives the four CSS custom properties an accent color drives, adjusted
 * for light vs. dark mode the same way the app's built-in default tokens
 * are (a darker shade on the light cream background, a brighter shade and
 * lighter ring on the dark background).
 */
export function deriveAccentTokens(hex: string, isDark: boolean): DerivedAccentTokens {
  const base = hexToRgb(hex);
  const primaryRgb = isDark ? base : mixRgb(base, [0, 0, 0], 0.12);
  const ringRgb = mixRgb(primaryRgb, [255, 255, 255], isDark ? 0.14 : 0.08);
  const luminance =
    (0.2126 * primaryRgb[0] + 0.7152 * primaryRgb[1] + 0.0722 * primaryRgb[2]) / 255;
  const glowAlpha = isDark ? 0.22 : 0.16;
  return {
    primary: rgbToHex(primaryRgb),
    primaryForeground: luminance > 0.55 ? '#17131f' : '#ffffff',
    ring: rgbToHex(ringRgb),
    glow: `rgba(${Math.round(primaryRgb[0])}, ${Math.round(primaryRgb[1])}, ${Math.round(primaryRgb[2])}, ${glowAlpha})`,
  };
}

/** Applies (or clears, for hex === null) the accent to the live document. */
export function applyAccent(hex: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!hex || !isValidHex(hex)) {
    root.style.removeProperty('--color-primary');
    root.style.removeProperty('--color-primary-foreground');
    root.style.removeProperty('--color-ring');
    root.style.removeProperty('--color-glow');
    return;
  }
  const isDark = root.classList.contains('dark');
  const tokens = deriveAccentTokens(hex, isDark);
  root.style.setProperty('--color-primary', tokens.primary);
  root.style.setProperty('--color-primary-foreground', tokens.primaryForeground);
  root.style.setProperty('--color-ring', tokens.ring);
  root.style.setProperty('--color-glow', tokens.glow);
}

export function getStoredAccent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.accentHex === 'string' && isValidHex(parsed.accentHex)
      ? parsed.accentHex
      : null;
  } catch {
    return null;
  }
}

export function setStoredAccent(hex: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accentHex: hex }));
  } catch {
    // Ignore storage errors (private browsing, quota, etc.) — the in-memory
    // apply still happened, it just won't persist across reloads.
  }
}

/** Re-applies whatever accent is currently stored — call after a dark/light toggle. */
export function reapplyStoredAccent(): void {
  applyAccent(getStoredAccent());
}

export const appearanceService = {
  ACCENT_PRESETS,
  isValidHex,
  deriveAccentTokens,
  applyAccent,
  getStoredAccent,
  setStoredAccent,
  reapplyStoredAccent,
};
