const ui = require('./config');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modules/**/*.{js,ts,jsx,tsx,mdx}',
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '2rem',
        lg: '4rem',
        xl: '5rem',
        '2xl': '6rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        subtle: 'var(--color-subtle)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          foreground: 'var(--color-secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--color-destructive)',
          foreground: 'var(--color-destructive-foreground)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          foreground: 'var(--color-success-foreground)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          foreground: 'var(--color-warning-foreground)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          foreground: 'var(--color-error-foreground)',
        },
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--color-popover)',
          foreground: 'var(--color-popover-foreground)',
        },
        lab: {
          dsa: 'var(--lab-dsa)',
          cv: 'var(--lab-cv)',
          system: 'var(--lab-system)',
        },
        // ai-bootcamp's own editorial theme (scoped under .ab-theme, see
        // frontend/src/modules/ai-lms/ui/ab-theme.css) — prefixed so it never
        // shadows the app-wide tokens above or Tailwind's own `black`/`orange`.
        'ab-black': {
          DEFAULT: 'rgb(var(--ab-black-rgb-ch) / <alpha-value>)',
          raised: 'rgb(var(--ab-black-raised-rgb-ch) / <alpha-value>)',
          card: 'rgb(var(--ab-black-card-rgb-ch) / <alpha-value>)',
          line: 'var(--ab-black-line)',
        },
        'ab-gold': {
          DEFAULT: 'rgb(var(--ab-gold-rgb-ch) / <alpha-value>)',
          bright: 'var(--ab-gold-bright)',
          pale: 'var(--ab-gold-pale)',
          deep: 'var(--ab-gold-deep)',
        },
        'ab-cream': {
          DEFAULT: 'rgb(var(--ab-cream-rgb-ch) / <alpha-value>)',
          dim: 'var(--ab-cream-dim)',
        },
        'ab-text': {
          DEFAULT: 'rgb(var(--ab-text-rgb-ch) / <alpha-value>)',
          muted: 'rgb(var(--ab-text-muted-rgb-ch) / <alpha-value>)',
        },
      },
      borderRadius: {
        sm: ui.radius.sm,
        md: ui.radius.md,
        lg: ui.radius.lg,
        xl: ui.radius.xl,
        'ab-pill': '9999px',
        'ab-card': '1.15rem',
        'ab-panel': '1.5rem',
      },
      boxShadow: {
        sm: ui.shadow.sm,
        md: ui.shadow.md,
        lg: ui.shadow.lg,
        glow: ui.shadow.glow,
        card: ui.shadow.card,
      },
      fontFamily: {
        heading: ui.fonts.display,
        body: ui.fonts.sans,
        caption: ui.fonts.sans,
        code: ui.fonts.code,
        sans: ui.fonts.sans,
        // ai-bootcamp's editorial type pairing (Cormorant Garamond + Montserrat),
        // loaded only by the bootcamp layout — see ab-theme.css comment above.
        'ab-serif': ['var(--font-ab-cormorant)', 'Georgia', 'serif'],
        'ab-heading': ['var(--font-ab-montserrat)', 'ui-sans-serif', 'sans-serif'],
      },
      maxWidth: {
        readable: ui.layout.readableWidth,
        card: ui.layout.cardMaxWidth,
      },
      spacing: {
        '6': '6px',
        '12': '12px',
        '18': '18px',
        '24': '24px',
        '36': '36px',
        '48': '48px',
        '72': '72px',
        '96': '96px',
        '144': '144px',
      },
      transitionDuration: {
        '250': '250ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
