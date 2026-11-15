/**
 * LabNinja frontend design system — "Graphite & Fern".
 *
 * Keep shared visual decisions here first, then consume them from Tailwind and
 * global CSS (the live tokens are the CSS variables in src/styles/tailwind.css).
 * iOS-inspired on every platform: the UI is set in one neo-grotesque family —
 * SF Pro on Apple devices (-apple-system), Inter everywhere else (Android,
 * Windows, Linux), so an Android phone gets the same look as an iPhone —
 * for headings, body text, labels, numbers (use `tabular-nums` where digits must
 * line up), badges and form fields. Monospace (`code`) is reserved for real code: <code>,
 * <pre>, and editors for code / JSON / HTML. Never use mono or script faces for
 * UI text. The AI LMS has its own editorial pairing (ab-theme) and the career-studio
 * templates ship their own fonts; both are left alone.
 *
 * Icons (To-Do area): illustrations are flat colour icons from react-icons (`FlatIcon`, named by
 * meaning); plain controls — chevron, close, plus, trash, arrows — are the outline Heroicons (`Icon`).
 * No emoji, except an icon the user picked for a project. `npm run check:tailwind` enforces this.
 */

const designSystem = {
  fonts: {
    sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif'],
    display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif'],
    code: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },

  /** Light mode colour tokens — also set as CSS vars in :root */
  light: {
    background:           '#f5f6fa',
    foreground:           '#111827',
    card:                 '#ffffff',
    cardForeground:       '#111827',
    popover:              '#ffffff',
    popoverForeground:    '#111827',
    primary:              '#357316',
    primaryForeground:    '#ffffff',
    secondary:            '#0e7490',
    secondaryForeground:  '#ffffff',
    accent:               '#b45309',
    accentForeground:     '#ffffff',
    muted:                '#eceef3',
    mutedForeground:      '#5c6679',
    border:               'rgba(17, 24, 39, 0.10)',
    input:                '#ffffff',
    ring:                 '#4c9a26',
    success:              '#0b7f55',
    successForeground:    '#ffffff',
    warning:              '#a65a00',
    warningForeground:    '#ffffff',
    error:                '#d1344a',
    errorForeground:      '#ffffff',
    destructive:          '#d1344a',
    destructiveForeground:'#ffffff',
    sidebar:              '#eef0f5',
    surface:              '#ffffff',
    elevated:             '#ffffff',
    subtle:               '#e3e6ed',
    glow:                 'rgba(53, 115, 22, 0.14)',
  },

  /** Dark mode colour tokens — set as CSS vars inside .dark */
  dark: {
    background:           '#080b12',
    foreground:           '#f5f7fa',
    card:                 '#151b27',
    cardForeground:       '#f5f7fa',
    popover:              '#202938',
    popoverForeground:    '#f5f7fa',
    primary:              '#a6f36a',
    primaryForeground:    '#0a1104',
    secondary:            '#5cc8d7',
    secondaryForeground:  '#04161a',
    accent:               '#f6b654',
    accentForeground:     '#1f1405',
    muted:                '#1e2533',
    mutedForeground:      '#929aaa',
    border:               'rgba(255, 255, 255, 0.08)',
    input:                '#1a2130',
    ring:                 '#b9f68a',
    success:              '#3ddc97',
    successForeground:    '#04170e',
    warning:              '#ffb547',
    warningForeground:    '#1f1405',
    error:                '#ff6b73',
    errorForeground:      '#2b0a0e',
    destructive:          '#ff6b73',
    destructiveForeground:'#2b0a0e',
    sidebar:              '#0c1019',
    surface:              '#151b27',
    elevated:             '#202938',
    subtle:               '#2a3344',
    glow:                 'rgba(166, 243, 106, 0.16)',
  },

  /**
   * Per-lab accent colour system.
   * Each lab has:
   *   primary       – base accent (used in CSS var --lab-<x>)
   *   soft          – low-opacity fill for active states (--lab-<x>-soft)
   *   border        – accent border tint
   *   text          – lighter shade for dark-mode text
   *   heroGradient  – radial gradient stop for the wiki hero banner
   *   heroGlow      – bottom-right ambient glow
   *   wikiHoverLight – card title hover colour in LIGHT mode (darker, readable on cream)
   *   wikiHoverDark  – card title hover colour in DARK mode  (lighter, readable on dark bg)
   *                    Both are set via --wiki-<lab>-hover CSS var that flips between modes.
   *   iconFrom/To   – gradient used in the hero banner icon pill
   */
  labs: {
    dsa: {
      primary:          '#6d6be8',
      soft:             'rgba(109, 107, 232, 0.12)',
      border:           'rgba(109, 107, 232, 0.28)',
      text:             '#8f8cf7',
      heroGradient:     'rgba(99, 102, 241, 0.18)',
      heroGlow:         'rgba(59, 130, 246, 0.05)',
      wikiHoverLight:   '#4040c0',
      wikiHoverDark:    '#a8a6ff',
      iconFrom:         '#3b82f6',
      iconTo:           '#7c3aed',
    },
    cv: {
      primary:          '#1a9d8f',
      soft:             'rgba(26, 157, 143, 0.13)',
      border:           'rgba(26, 157, 143, 0.28)',
      text:             '#5fc6bd',
      heroGradient:     'rgba(26, 157, 143, 0.18)',
      heroGlow:         'rgba(20, 184, 166, 0.05)',
      wikiHoverLight:   '#0f6b62',
      wikiHoverDark:    '#7ad8d0',
      iconFrom:         '#14b8a6',
      iconTo:           '#0891b2',
    },
    system: {
      primary:          '#b36b17',
      soft:             'rgba(179, 107, 23, 0.13)',
      border:           'rgba(179, 107, 23, 0.30)',
      text:             '#f1ad55',
      heroGradient:     'rgba(179, 107, 23, 0.18)',
      heroGlow:         'rgba(245, 158, 11, 0.05)',
      wikiHoverLight:   '#8a4f0e',
      wikiHoverDark:    '#ffc87a',
      iconFrom:         '#f59e0b',
      iconTo:           '#ea580c',
    },
  },

  /**
   * Wiki Index layout constants.
   * Shared design pattern used by DSA, CV, and System Design labs.
   *
   * Card anatomy:
   *   .display-card  group relative overflow-hidden cursor-pointer h-full
   *   │
   *   ├─ left accent bar  (absolute, w=[3px], lab colour, opacity 0.40 → 0.80 on hover)
   *   └─ content div  pl-4 pr-4 pt-3.5 pb-3
   *       ├─ header row: title + badges
   *       ├─ brief paragraph
   *       └─ subtopic chips  (hover: bg-<lab>/15, text-<lab>)
   *
   * Title hover colour: group-hover:text-[var(--wiki-<lab>-hover)]
   * Category index: grid-cols-2, anchor links with #<lab>-cat-<name>
   * Topic grid: grid-cols-1 / md:2 / xl:3
   */
  wikiIndex: {
    cardBarIdleOpacity:  0.40,
    cardBarHoverOpacity: 0.80,
    heroGradientStop:    '60%',
    categoryIndexCols:   2,
    topicCardCols:       { sm: 1, md: 2, xl: 3 },
  },

  /** Radius grows with hierarchy: chips are pills, controls md/lg, cards lg/xl, sheets 28px (--radius-sheet). */
  radius: {
    sm: '8px',
    md: '10px',
    lg: '14px',
    xl: '20px',
  },

  /** Restrained and theme-aware: `card` / `lg` read the per-theme CSS variables (dark mode leans on surface tone). */
  shadow: {
    sm:   '0 1px 2px rgba(16, 24, 40, 0.06)',
    md:   '0 4px 12px -2px rgba(16, 24, 40, 0.10)',
    lg:   'var(--shadow-float)',
    glow: '0 0 0 1px var(--color-border), 0 12px 32px var(--color-glow)',
    card: 'var(--shadow-card)',
  },

  layout: {
    headerHeight:          '60px',
    sidebarWidth:          '264px',
    sidebarCollapsedWidth: '48px',
    copilotWidth:          '300px',
    copilotCollapsedWidth: '48px',
    readableWidth:         '900px',
    cardMaxWidth:          '820px',
    pageMaxWidth:          '1100px',
    pagePadding:           '24px',
  },

  components: {
    card:           'rounded-lg border border-border bg-card text-card-foreground shadow-card',
    cardMuted:      'rounded-lg border border-border bg-card/70 text-card-foreground',
    /** h-screen + overflow-hidden caps layout at exactly 100vh; pt-[60px] clears the fixed header */
    labShell:       'h-screen overflow-hidden bg-background pt-[60px] text-foreground',
    labSidebar:     'bg-[var(--color-sidebar)] border-border',
    labMain:        'bg-background',
    labCard:        'rounded-lg border border-border bg-card shadow-card',
    labHero:        'rounded-lg border border-border bg-card shadow-card',
    /** Wiki index topic card — lab accent bar + hover title colour applied inline */
    wikiTopicCard:  'display-card group relative overflow-hidden cursor-pointer h-full',
    button:         'rounded-md font-medium transition-smooth focus-ring',
    /** Nav link active: soft tint via color-mix(primary 10%) — no filled pill, no shadow-glow */
    navLinkActive:  '.app-nav-link-active  (CSS class — color-mix, not @apply)',
    /** Page-level layout utilities (max-w-[1100px] mx-auto px-24 py-24) */
    pageWrapper:    'max-w-[1100px] mx-auto px-24 py-24',
    pageHeader:     'mb-24',
    pageTitle:      'font-heading text-3xl font-bold text-foreground mb-6',
    pageSubtitle:   'text-sm text-muted-foreground max-w-xl leading-relaxed',
  },
};

module.exports = designSystem;
