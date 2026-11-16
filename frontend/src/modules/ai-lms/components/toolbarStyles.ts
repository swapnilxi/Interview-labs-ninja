/**
 * The one button look of the class page's toolbar and of the buttons that sit beside it (Share, Join class,
 * Send update, Import from labs). One height, one horizontal padding and one radius, so a row of actions
 * reads as a set and never as buttons of three different sizes.
 *
 * `h-9` / `px-3.5` are not redefined in tailwind.config.js (only the keys 6, 12, 18, 24, 36, 48, 72, 96, 144
 * are, in pixels), so these are the 2.25rem / 0.875rem they look like.
 */
export const LMS_TOOLBAR_BTN =
  'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-60';

/** The class page's one filled action (Generate Lesson). */
export const LMS_TOOLBAR_BTN_PRIMARY =
  'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3.5 text-xs font-medium text-white shadow-sm transition-colors hover:mix-bg-primary/90 disabled:opacity-60';

/** An action that is on but still secondary (an indigo outline: Add Project). */
export const LMS_TOOLBAR_BTN_ACCENT =
  'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3.5 text-xs font-medium text-indigo-500 shadow-sm transition-colors hover:bg-indigo-500/10 disabled:opacity-60';
