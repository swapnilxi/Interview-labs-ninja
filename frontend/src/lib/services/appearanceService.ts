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
  /** null = the app's built-in default (lime on dark, fern on light: --accent-default in tailwind.css), i.e. no override. */
  hex: string | null;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'default', label: 'Default', hex: null },
  // The pre-2026-11 built-in indigo, kept selectable after the default moved to lime / fern.
  { key: 'classic', label: 'Classic', hex: '#7C7AF0' },
  { key: 'orange', label: 'Orange', hex: '#F97316' },
  { key: 'indigo-purple', label: 'Indigo', hex: '#7131CC' },
  { key: 'violet', label: 'Violet', hex: '#6B4F8A' },
  { key: 'emerald', label: 'Emerald', hex: '#10B981' },
  { key: 'sky', label: 'Sky Blue', hex: '#0EA5E9' },
  { key: 'rose', label: 'Rose', hex: '#EC4899' },
  // Apple system colours (iOS / visionOS), so the picker offers the familiar native palette.
  { key: 'ios-blue', label: 'Blue', hex: '#0A84FF' },
  { key: 'ios-teal', label: 'Teal', hex: '#30B0C7' },
  { key: 'ios-mint', label: 'Mint', hex: '#00C7BE' },
  { key: 'ios-green', label: 'Green', hex: '#30D158' },
  { key: 'ios-yellow', label: 'Yellow', hex: '#FFD60A' },
  { key: 'ios-red', label: 'Red', hex: '#FF453A' },
  { key: 'ios-pink', label: 'Pink', hex: '#FF375F' },
  { key: 'ios-purple', label: 'Purple', hex: '#BF5AF2' },
  { key: 'ios-indigo', label: 'Indigo (iOS)', hex: '#5E5CE6' },
  { key: 'ios-brown', label: 'Brown', hex: '#AC8E68' },
  { key: 'vision-graphite', label: 'Graphite', hex: '#8E8E93' },
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

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const INK: RGB = [11, 16, 32]; // #0b1020: the dark text used on light accent fills
/** The surface accent TEXT is hardest to read on: the light page background, and the lightest dark surface (elevated). */
const LIGHT_SURFACE: RGB = [245, 246, 250]; // --color-background (light)
const DARK_SURFACE: RGB = [32, 41, 56]; // --color-elevated (dark)
/** `text-primary` is used as running text in ~450 places, so the accent must read as small text (WCAG AA). */
const MIN_TEXT_CONTRAST = 4.5;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Derives the four CSS custom properties an accent colour drives, per theme. The hue is kept; the shade is stepped
 * until the accent reads as text (>= 4.5:1) on that theme's hardest surface: toward black on light (at least the old
 * 12% darker shade, so a deep preset looks as before), toward white on dark. The foreground on an accent fill is
 * whichever of white / ink contrasts more. KEEP IN SYNC with the pre-paint script in app/layout.tsx (same steps), or
 * the page would flash a different shade before hydration.
 */
export function deriveAccentTokens(hex: string, isDark: boolean): DerivedAccentTokens {
  const base = hexToRgb(hex);
  const surface = isDark ? DARK_SURFACE : LIGHT_SURFACE;
  const toward = isDark ? WHITE : BLACK;
  let step = isDark ? 0 : 0.12;
  let primaryRgb = mixRgb(base, toward, step);
  while (step < 0.7 && contrastRatio(primaryRgb, surface) < MIN_TEXT_CONTRAST) {
    step += 0.04;
    primaryRgb = mixRgb(base, toward, step);
  }
  const ringRgb = mixRgb(primaryRgb, WHITE, isDark ? 0.14 : 0.08);
  const glowAlpha = isDark ? 0.22 : 0.16;
  return {
    primary: rgbToHex(primaryRgb),
    primaryForeground: contrastRatio(primaryRgb, WHITE) >= contrastRatio(primaryRgb, INK) ? '#ffffff' : '#0b1020',
    ring: rgbToHex(ringRgb),
    glow: `rgba(${Math.round(primaryRgb[0])},${Math.round(primaryRgb[1])},${Math.round(primaryRgb[2])},${glowAlpha})`,
  };
}

let colorTransitionTimer: number | undefined;

/**
 * Runs a colour change (accent or theme) with a short cross-fade: `html.color-transition` (tailwind.css) eases colour,
 * background, border, fill and shadow for ~0.35s, then is removed. Skipped for reduced motion.
 */
export function withColorTransition(run: () => void): void {
  if (typeof document === 'undefined') {
    run();
    return;
  }
  const root = document.documentElement;
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('color-transition');
    window.clearTimeout(colorTransitionTimer);
    colorTransitionTimer = window.setTimeout(() => root.classList.remove('color-transition'), 420);
  }
  run();
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
  withColorTransition,
  applyAccent,
  getStoredAccent,
  setStoredAccent,
  reapplyStoredAccent,
};
