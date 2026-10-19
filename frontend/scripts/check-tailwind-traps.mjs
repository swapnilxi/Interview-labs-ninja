#!/usr/bin/env node
/**
 * Fails if an enforced area (TODO_ROOTS below: the To-Do module, the shared UI, the three labs (DSA, CV, System
 * Design), Daily Session, Labs Project, Config and the shared lab components) uses a Tailwind class that silently
 * does the wrong thing in this repo. Every rule below is a class that compiles to NOTHING (or to something other
 * than it says) with no warning:
 *
 *  1. An opacity modifier on a theme colour — `bg-muted/20`, `border-border/60`, `hover:bg-primary/90`,
 *     `shadow-primary/30`. The theme colours are plain `var(--color-x)` strings, so Tailwind cannot apply the
 *     modifier and emits NOTHING (no CSS, no warning). Use the `mix-*` utilities instead: `mix-bg-muted/20`
 *     (tailwind/mix-colors.js). Palette colours such as `bg-amber-500/10` are fine. The same trap catches the
 *     lab tokens and any arbitrary `var()` colour: `bg-lab-dsa/20`, `bg-[var(--lab-cv)]/20`,
 *     `border-[color:var(--x)]/40` (rule `dead-opacity`).
 *  2. A spacing class on one of the keys tailwind.config.js redefines in PIXELS (6, 12, 18, 24, 36, 48,
 *     72, 96, 144): `px-6` is 6px here, not 1.5rem (rule `pixel`). Policy for a hit: where the pixel value was
 *     intended, rewrite VALUE-PRESERVING (6px = `1.5`, 12px = `3`, 18px = `[1.125rem]`, 24px = `[1.5rem]`,
 *     36px = `9`, 48px = `[3rem]`, 72px = `[4.5rem]`); where a rem value was intended (the checker's suggestion
 *     is the rem value) write that. Never "fix" the key in tailwind.config.js: it restyles every module.
 *  3. Text under the readability floor: `text-[10px]` and friends. Anything you read is at least 12px
 *     (`text-xs`); titles 14px (`text-sm`). Only uppercase caption labels may be 11px (`text-[11px]` on a
 *     line that also says `uppercase`) (rule `tiny-text`).
 *  4. An emoji used as an icon. The To-Do UI draws its illustrations with `FlatIcon` (react-icons' flat colour
 *     set) and its controls with `Icon` (Heroicons); emoji vary by OS and can't be recoloured. The only
 *     exception is a project icon the user picked — mark such a line `emoji-ok`. `common/lab/labSectionDefaults.ts`
 *     is exempt as a file: its emoji are the preset add-on labels users read and save (content, not icons)
 *     (rule `emoji`).
 *  5. A palette colour with an opacity step Tailwind 3.4 does not have: `bg-emerald-500/8`, `to-blue-600/8`,
 *     `bg-white/12`. The scale is 0, 5, 10 ... 100 (tailwind.config.js `opacity`); anything else is dead. Use a step
 *     or an arbitrary `/[0.08]` (rule `palette-alpha`).
 *  6. A class whose key does not exist: `shadow-xs`, `py-0.2`, `p-13`, `w-0.25` (rule `invalid-keys`; numeric keys
 *     are read from the resolved Tailwind theme, so a key the config adds is accepted).
 *  7. `mix-bg|text|border|ring-<x>` where `<x>` is not a theme token (the tokens are read from
 *     tailwind/mix-colors.js): `mix-bg-amber-500/15` generates nothing. Use `bg-amber-500/15` (palette) or an
 *     arbitrary value `mix-bg-[#f59e0b]/15` (rule `mix-unknown`).
 *
 * Usage:  npm run check:tailwind                 checks the enforced area (exit 1 on a hit; a long list prints counts per
 *                                                file, add --list for every hit)
 *         npm run check:tailwind -- --all        reports every module, for information (exit 0)
 *         npm run check:tailwind -- --only src/modules/cv-lab    list the hits of one path (comma-separate or repeat
 *                                                --only for several); exit 1 on a hit. A fragment that matches no scanned file
 *                                                exits 2, so a typo cannot pass as green (a path outside TODO_ROOTS needs --all).
 * Rules per root: `daily-session` runs only dead-opacity, pixel, palette-alpha, invalid-keys and mix-unknown (its
 * tiny text and emoji are the gamified feature; ROOT_RULES below). The lab visual system these roots follow is
 * described in README.md ("Lab visual system").
 * Background: ai-to-do.md, item 1.5.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const TODO_ROOTS = [
  'src/modules/ai-todo',
  'src/components/ui',
  'src/app/ai-todo',
  'src/modules/common/PendingStatusBanner.tsx',
  'src/modules/common/copilot',
  'src/lib/ui',
  'src/modules/dsa-lab',
  'src/app/dsa-lab',
  'src/modules/cv-lab',
  'src/modules/system-design-lab',
  'src/modules/common/lab',
  'src/modules/common/LabCopilot.tsx',
  'src/modules/common/GenerateQuestionsPanel.tsx',
  'src/modules/labs-project',
  'src/app/labs-project',
  'src/modules/config',
  'src/app/config',
  'src/modules/daily-session',
];
const ALL_RULES = [
  'emoji',
  'dead-opacity',
  'tiny-text',
  'pixel',
  'palette-alpha',
  'invalid-keys',
  'mix-unknown',
];
/** Per-root rule subsets: a path prefix -> the only rules that run under it (everything else runs them all). */
const ROOT_RULES = {
  'src/modules/daily-session': [
    'dead-opacity',
    'pixel',
    'palette-alpha',
    'invalid-keys',
    'mix-unknown',
  ],
};
/** Files whose emoji are content, not icons. */
const EMOJI_EXEMPT_FILES = ['src/modules/common/lab/labSectionDefaults.ts'];

// --- command line ---------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const all = argv.includes('--all');
const listAll = argv.includes('--list');
const only = [];
argv.forEach((arg, i) => {
  if (arg === '--only' && argv[i + 1]) only.push(...argv[i + 1].split(','));
  else if (arg.startsWith('--only=')) only.push(...arg.slice('--only='.length).split(','));
});
const onlyFragments = only.map((s) => s.trim().replace(/^\.\//, '')).filter(Boolean);
if (argv.includes('--only') && onlyFragments.length === 0) {
  console.error('check:tailwind — --only needs a path fragment, e.g. --only src/modules/cv-lab');
  process.exit(2);
}
const roots = all ? ['src'] : TODO_ROOTS;

// --- what the repo's Tailwind actually defines -----------------------------------------------------------------
/** The resolved theme (opacity scale, spacing keys). Null when tailwind.config.js cannot be loaded: the rules that need it then skip. */
function loadTheme() {
  try {
    const resolveConfig = require('tailwindcss/resolveConfig');
    return resolveConfig(require('../tailwind.config.js')).theme;
  } catch (error) {
    console.error(
      `check:tailwind — warning: could not resolve tailwind.config.js (${error.message}); palette-alpha and invalid-keys are reduced.`
    );
    return null;
  }
}
const theme = loadTheme();
const OPACITY_STEPS = new Set(
  theme?.opacity
    ? Object.keys(theme.opacity)
        .filter((k) => /^\d+$/.test(k))
        .map(Number)
    : Array.from({ length: 21 }, (_, n) => n * 5)
);
const NUMERIC_KEYS = (() => {
  if (!theme) return null;
  const keys = new Set();
  for (const section of [
    'spacing',
    'width',
    'height',
    'size',
    'minWidth',
    'minHeight',
    'maxHeight',
    'padding',
    'margin',
    'gap',
    'space',
    'inset',
    'translate',
    'flexBasis',
    'scrollMargin',
    'scrollPadding',
  ]) {
    for (const key of Object.keys(theme[section] || {}))
      if (/^\d+(\.\d+)?$/.test(key)) keys.add(key);
  }
  return keys;
})();
/** The theme tokens tailwind/mix-colors.js accepts (read from the file, so the rule cannot drift from the plugin). */
const MIX_TOKENS = (() => {
  const src = readFileSync(join(root, 'tailwind/mix-colors.js'), 'utf8');
  const list = (name) => {
    const m = new RegExp(String.raw`const ${name} = \[([^\]]*)\]`).exec(src);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  };
  const withForeground = list('WITH_FOREGROUND');
  const plain = list('PLAIN');
  if (!withForeground || !plain) {
    console.error(
      'check:tailwind — cannot read WITH_FOREGROUND / PLAIN from tailwind/mix-colors.js; update MIX_TOKENS in this script.'
    );
    process.exit(2);
  }
  const set = new Set(plain);
  for (const name of withForeground) {
    set.add(name);
    set.add(`${name}-foreground`);
  }
  return set;
})();

// --- patterns -----------------------------------------------------------------------------------------------------
const THEME =
  'border|input|ring|background|foreground|surface|progress|info|(?:primary|secondary|accent|destructive|success|warning|error|muted|card|popover)(?:-foreground)?' +
  String.raw`|lab-(?:dsa|cv|system)|\[(?:color:)?var\(--[a-z0-9-]+\)\]`;
const COLOR_PROPS =
  'bg|text|border(?:-[trblxy])?|ring|ring-offset|from|to|via|divide|outline|placeholder|fill|stroke|shadow|decoration|accent|caret';
const SPACING_PROPS =
  'w|h|size|min-w|min-h|max-h|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|top|bottom|left|right|inset|inset-x|inset-y|translate-x|translate-y|basis|scroll-m|scroll-mx|scroll-my|scroll-mt|scroll-mb|scroll-ml|scroll-mr|scroll-p|scroll-px|scroll-py|scroll-pt|scroll-pb|scroll-pl|scroll-pr';
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const VARIANTS = String.raw`(?:[a-z0-9\[\]\-_:&>*]+:)*`;
const DEAD_OPACITY = new RegExp(
  String.raw`(?<![\w\-/])(${VARIANTS})(${COLOR_PROPS})-(${THEME})/(\d{1,3}|\[[\d.]+\])(?![\w\-])`,
  'g'
);
const PALETTE_ALPHA = new RegExp(
  String.raw`(?<![\w\-/])(${VARIANTS})(${COLOR_PROPS})-((?:${PALETTE})-(?:50|100|200|300|400|500|600|700|800|900|950)|white|black)/(\d{1,3})(?![\w\-.])`,
  'g'
);
const PIXEL_KEYS = new RegExp(
  String.raw`(?<![\w\-/\[])(${VARIANTS})(-?)(${SPACING_PROPS})-(6|12|18|24|36|48|72|96|144)(?![\w\-/\.\[])`,
  'g'
);
const NUMERIC_KEY = new RegExp(
  String.raw`(?<![\w\-/\[])(${VARIANTS})(-?)(${SPACING_PROPS})-(\d+(?:\.\d+)?)(?![\w\-/.\[%])`,
  'g'
);
const SHADOW_XS = new RegExp(String.raw`(?<![\w\-/])(${VARIANTS})shadow-xs(?![\w\-])`, 'g');
const MIX_UTILITY = new RegExp(
  String.raw`(?<![\w\-/])(${VARIANTS})mix-(bg|text|border|ring)-(?!\[)([a-z0-9][a-z0-9-]*)(?:/(?:\d+(?:\.\d+)?|\[[^\]\s]*\]))?(?![\w\-])`,
  'g'
);
const TINY_TEXT = new RegExp(
  String.raw`(?<![\w\-/])(${VARIANTS})text-\[(\d+(?:\.\d+)?)px\](?![\w\-])`,
  'g'
);
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}]/u;
const REM = {
  6: '1.5rem',
  12: '3rem',
  18: '4.5rem',
  24: '6rem',
  36: '9rem',
  48: '12rem',
  72: '18rem',
  96: '24rem',
  144: '36rem',
};
/** The key (or arbitrary value) that keeps today's SIZE: the repo's `6` is 6px, so `1.5` (6px) / `3` (12px) / `9` (36px) are the same size. */
const KEEP = {
  6: '1.5',
  12: '3',
  18: '[1.125rem]',
  24: '[1.5rem]',
  36: '9',
  48: '[3rem]',
  72: '[4.5rem]',
  96: '[6rem]',
  144: '[9rem]',
};

function* files(path) {
  const full = join(root, path);
  let st;
  try {
    st = statSync(full);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (/\.tsx?$/.test(full)) yield full;
    return;
  }
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'classes') continue;
    yield* files(join(path, entry.name));
  }
}

/** The rules that run on a file: all of them, unless it sits under a ROOT_RULES prefix. */
function rulesFor(rel) {
  for (const [prefix, rules] of Object.entries(ROOT_RULES)) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return new Set(rules);
  }
  return new Set(ALL_RULES);
}

const problems = [];
const scanned = new Set();
for (const r of roots) {
  for (const file of files(r)) {
    const rel = relative(root, file);
    if (scanned.has(rel)) continue;
    scanned.add(rel);
    const active = rulesFor(rel);
    const emojiExempt = EMOJI_EXEMPT_FILES.includes(rel);
    const lines = readFileSync(file, 'utf8').split('\n');
    const add = (rule, i, text, why) => problems.push({ rule, file, line: i + 1, text, why });
    lines.forEach((line, i) => {
      if (
        active.has('emoji') &&
        !emojiExempt &&
        EMOJI.test(line) &&
        !/^\s*(\/\/|\*|\/\*)/.test(line) &&
        !line.includes('emoji-ok') &&
        !(lines[i - 1] || '').includes('emoji-ok') &&
        !(lines[i - 2] || '').includes('emoji-ok')
      ) {
        add(
          'emoji',
          i,
          line.trim().slice(0, 60),
          'an emoji used as an icon — use <FlatIcon name="…" /> (illustration) or <Icon name="…" /> (control)'
        );
      }
      if (active.has('dead-opacity')) {
        for (const m of line.matchAll(DEAD_OPACITY)) {
          const [whole, variants, prop, token, alpha] = m;
          const fixable = ['bg', 'text', 'border', 'ring'].includes(prop);
          const labOrVar = token.startsWith('lab-') || token.startsWith('[');
          let why;
          if (labOrVar) {
            why = `generates no CSS (a var() / lab colour cannot take a /NN modifier) — use ${variants}mix-${fixable ? prop : 'bg'}-primary/${alpha.replace(/^\[|\]$/g, '')} for the accent, or an arbitrary color-mix() value`;
          } else if (fixable) {
            why = `generates no CSS — use ${variants}mix-${prop}-${token}/${alpha}`;
          } else {
            why =
              'generates no CSS (theme colours cannot take a /NN modifier) — use an arbitrary value';
          }
          add('dead-opacity', i, whole, why);
        }
      }
      if (active.has('tiny-text')) {
        for (const m of line.matchAll(TINY_TEXT)) {
          const size = Number(m[2]);
          if (size >= 12 || (size >= 11 && line.includes('uppercase'))) continue;
          add(
            'tiny-text',
            i,
            m[0],
            `${size}px is under the readability floor — use ${m[1]}text-xs (12px), or ${m[1]}text-sm (14px) for a title`
          );
        }
      }
      if (active.has('pixel')) {
        for (const m of line.matchAll(PIXEL_KEYS)) {
          add(
            'pixel',
            i,
            m[0],
            `${m[4]} is ${m[4]}px in this repo's spacing scale — if ${m[4]}px is what you see today keep it with ${m[1]}${m[2]}${m[3]}-${KEEP[m[4]]}; if the Tailwind default was meant write ${m[1]}${m[2]}${m[3]}-[${REM[m[4]]}]`
          );
        }
      }
      if (active.has('palette-alpha')) {
        for (const m of line.matchAll(PALETTE_ALPHA)) {
          if (OPACITY_STEPS.has(Number(m[4]))) continue;
          add(
            'palette-alpha',
            i,
            m[0],
            `/${m[4]} is not a step of the opacity scale (${[...OPACITY_STEPS].slice(0, 4).join(', ')} … ${Math.max(...OPACITY_STEPS)}), so this generates no CSS — use the nearest step or an arbitrary /[0.${String(m[4]).padStart(2, '0')}]`
          );
        }
      }
      if (active.has('invalid-keys')) {
        for (const m of line.matchAll(SHADOW_XS)) {
          add(
            'invalid-keys',
            i,
            m[0],
            'there is no shadow-xs in Tailwind 3 (generates no CSS) — use no shadow, or shadow-sm'
          );
        }
        if (NUMERIC_KEYS) {
          for (const m of line.matchAll(NUMERIC_KEY)) {
            if (NUMERIC_KEYS.has(m[4])) continue;
            add(
              'invalid-keys',
              i,
              m[0],
              `${m[4]} is not a key of this theme's spacing scale, so ${m[3]}-${m[4]} generates no CSS — use a defined key (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5 …) or an arbitrary [value]`
            );
          }
        }
      }
      if (active.has('mix-unknown')) {
        for (const m of line.matchAll(MIX_UTILITY)) {
          if (MIX_TOKENS.has(m[3])) continue;
          add(
            'mix-unknown',
            i,
            m[0],
            `mix-${m[2]}-* only knows the theme tokens (primary, muted, card, foreground, border …); "${m[3]}" generates no CSS — use the palette class (${m[1]}${m[2]}-${m[3]}/NN) or an arbitrary value (${m[1]}mix-${m[2]}-[#rrggbb]/NN)`
          );
        }
      }
    });
  }
}

// --- reporting ----------------------------------------------------------------------------------------------------
const rel = (p) => relative(root, p.file);
const wanted = (p) => onlyFragments.length === 0 || onlyFragments.some((f) => rel(p).includes(f));
const shown = problems.filter(wanted);

if (
  onlyFragments.length > 0 &&
  ![...scanned].some((f) => onlyFragments.some((frag) => f.includes(frag)))
) {
  console.error(
    `check:tailwind — --only ${onlyFragments.join(',')} matches none of the ${scanned.size} scanned files` +
      (all ? '.' : ' (a path outside TODO_ROOTS needs --all).')
  );
  process.exit(2);
}

const byRule = (list) => {
  const counts = {};
  for (const p of list) counts[p.rule] = (counts[p.rule] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
};

if (all) {
  const perModule = {};
  for (const p of shown) {
    const mod = rel(p).split('/').slice(0, 3).join('/');
    perModule[mod] = (perModule[mod] || 0) + 1;
  }
  console.log(`${shown.length} uses across src/ (information only; ${byRule(shown) || 'none'}):`);
  for (const [m, n] of Object.entries(perModule).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${m}`);
  process.exit(0);
}

if (shown.length === 0) {
  console.log(
    onlyFragments.length > 0
      ? `check:tailwind — no silent-no-op Tailwind classes under ${onlyFragments.join(', ')}.`
      : 'check:tailwind — no silent-no-op Tailwind classes in the enforced area.'
  );
} else {
  // A long list (a freshly added root, say) prints counts per file; the hits themselves only on request (--list / --only).
  const compact = shown.length > 60 && !listAll && onlyFragments.length === 0;
  console.error(
    `check:tailwind — ${shown.length} problem${shown.length === 1 ? '' : 's'} (${byRule(shown)}):\n`
  );
  if (!compact) {
    for (const p of shown)
      console.error(`  ${rel(p)}:${p.line}  [${p.rule}] ${p.text}\n      ${p.why}`);
    console.error('');
  }
  const perFile = new Map();
  for (const p of shown) {
    if (!perFile.has(rel(p))) perFile.set(rel(p), []);
    perFile.get(rel(p)).push(p);
  }
  if (compact || perFile.size > 1) {
    console.error('Per file:');
    for (const [file, list] of [...perFile].sort(
      (a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)
    ))
      console.error(`  ${String(list.length).padStart(4)}  ${file}  (${byRule(list)})`);
    console.error('');
  }
  if (compact)
    console.error('List the hits of one path with --only <path> (or all of them with --list).\n');
  console.error('See ai-to-do.md, item 1.5.');
  process.exit(1);
}
