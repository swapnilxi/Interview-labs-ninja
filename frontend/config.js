/**
 * LabNinja frontend design system.
 *
 * Keep shared visual decisions here first, then consume them from Tailwind and
 * global CSS. The UI uses clean sans fonts for long reading and avoids mono
 * fonts except inside code blocks.
 */

const designSystem = {
  fonts: {
    sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    display: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    code: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },

  /** Light mode colour tokens — also set as CSS vars in :root */
  light: {
    background:           '#f7f3ec',
    foreground:           '#24201b',
    card:                 '#fffaf2',
    cardForeground:       '#24201b',
    popover:              '#fffaf2',
    popoverForeground:    '#24201b',
    primary:              '#5b5bd6',
    primaryForeground:    '#ffffff',
    secondary:            '#127c7a',
    secondaryForeground:  '#ffffff',
    accent:               '#b36b17',
    accentForeground:     '#fffaf2',
    muted:                '#eee6da',
    mutedForeground:      '#71695f',
    border:               'rgba(64, 55, 45, 0.18)',
    input:                '#fffdf8',
    ring:                 '#6d6be8',
    success:              '#14845f',
    successForeground:    '#ffffff',
    warning:              '#a45d12',
    warningForeground:    '#fffaf2',
    error:                '#c24151',
    errorForeground:      '#ffffff',
    destructive:          '#c24151',
    destructiveForeground:'#ffffff',
    sidebar:              '#f0e8dc',
    surface:              '#fbf4ea',
    elevated:             '#ffffff',
    subtle:               '#e7dfd2',
    glow:                 'rgba(91, 91, 214, 0.16)',
  },

  /** Dark mode colour tokens — set as CSS vars inside .dark */
  dark: {
    background:           '#181511',
    foreground:           '#f4efe7',
    card:                 '#211d18',
    cardForeground:       '#f4efe7',
    popover:              '#252019',
    popoverForeground:    '#f4efe7',
    primary:              '#8f8cf7',
    primaryForeground:    '#17131f',
    secondary:            '#5fc6bd',
    secondaryForeground:  '#10201f',
    accent:               '#f1ad55',
    accentForeground:     '#25190b',
    muted:                '#302a22',
    mutedForeground:      '#b9ad9f',
    border:               'rgba(255, 246, 235, 0.17)',
    input:                '#29231c',
    ring:                 '#a9a5ff',
    success:              '#54c79a',
    successForeground:    '#0e2119',
    warning:              '#f4b75e',
    warningForeground:    '#25190b',
    error:                '#fb7185',
    errorForeground:      '#2b1015',
    destructive:          '#fb7185',
    destructiveForeground:'#2b1015',
    sidebar:              '#1d1914',
    surface:              '#211d18',
    elevated:             '#29231c',
    subtle:               '#383026',
    glow:                 'rgba(143, 140, 247, 0.22)',
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

  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },

  shadow: {
    sm:   '0 1px 2px rgba(15, 12, 8, 0.08)',
    md:   '0 10px 26px rgba(15, 12, 8, 0.10)',
    lg:   '0 20px 48px rgba(15, 12, 8, 0.14)',
    glow: '0 0 0 1px var(--color-border), 0 12px 32px var(--color-glow)',
    card: '0 1px 3px rgba(15, 12, 8, 0.07), 0 10px 28px rgba(15, 12, 8, 0.07)',
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
