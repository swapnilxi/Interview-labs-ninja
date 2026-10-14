#!/usr/bin/env node
/**
 * Fails if the To-Do area uses a Tailwind class that silently does the wrong thing in this repo:
 *
 *  1. An opacity modifier on a theme colour — `bg-muted/20`, `border-border/60`, `hover:bg-primary/90`.
 *     The theme colours are plain `var(--color-x)` strings, so Tailwind cannot apply the modifier and
 *     emits NOTHING (no CSS, no warning). Use the `mix-*` utilities instead: `mix-bg-muted/20`
 *     (tailwind/mix-colors.js). Palette colours such as `bg-amber-500/10` are fine.
 *  2. A spacing class on one of the keys tailwind.config.js redefines in PIXELS (6, 12, 18, 24, 36, 48,
 *     72, 96, 144): `px-6` is 6px here, not 1.5rem. Write the rem value: `px-[1.5rem]`.
 *
 *  3. Text under the readability floor: `text-[10px]` and friends. Anything you read is at least 12px
 *     (`text-xs`); titles 14px (`text-sm`). Only uppercase caption labels may be 11px (`text-[11px]` on a
 *     line that also says `uppercase`).
 *
 *  4. An emoji used as an icon. The To-Do UI draws its illustrations with `FlatIcon` (react-icons' flat colour
 *     set) and its controls with `Icon` (Heroicons); emoji vary by OS and can't be recoloured. The only
 *     exception is a project icon the user picked — mark such a line `emoji-ok`.
 *
 * Usage:  npm run check:tailwind            checks the To-Do area (exit 1 on a hit)
 *         npm run check:tailwind -- --all   reports every module, for information (exit 0)
 * Background: ai-to-do.md, item 1.5.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const TODO_ROOTS = [
  'src/modules/ai-todo',
  'src/components/ui',
  'src/app/ai-todo',
  'src/modules/common/PendingStatusBanner.tsx',
  'src/modules/common/copilot',
  'src/lib/ui',
];
const all = process.argv.includes('--all');
const roots = all ? ['src'] : TODO_ROOTS;

const THEME =
  'border|input|ring|background|foreground|surface|(?:primary|secondary|accent|destructive|success|warning|error|muted|card|popover)(?:-foreground)?';
const COLOR_PROPS =
  'bg|text|border(?:-[trblxy])?|ring|ring-offset|from|to|via|divide|outline|placeholder|fill|stroke|shadow|decoration|accent|caret';
const SPACING_PROPS =
  'w|h|size|min-w|min-h|max-h|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|top|bottom|left|right|inset|inset-x|inset-y|translate-x|translate-y|basis|scroll-m|scroll-p';
const VARIANTS = String.raw`(?:[a-z0-9\[\]\-_:&>*]+:)*`;
const DEAD_OPACITY = new RegExp(
  String.raw`(?<![\w\-/])(${VARIANTS})(${COLOR_PROPS})-(${THEME})/(\d{1,3}|\[[\d.]+\])(?![\w\-])`,
  'g'
);
const PIXEL_KEYS = new RegExp(
  String.raw`(?<![\w\-/\[])(${VARIANTS})(-?)(${SPACING_PROPS})-(6|12|18|24|36|48|72|96|144)(?![\w\-/\.\[])`,
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

const problems = [];
for (const r of roots) {
  for (const file of files(r)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (
        EMOJI.test(line) &&
        !/^\s*(\/\/|\*|\/\*)/.test(line) &&
        !line.includes('emoji-ok') &&
        !(lines[i - 1] || '').includes('emoji-ok') &&
        !(lines[i - 2] || '').includes('emoji-ok')
      ) {
        problems.push({
          file,
          line: i + 1,
          text: line.trim().slice(0, 60),
          why: 'an emoji used as an icon — use <FlatIcon name="…" /> (illustration) or <Icon name="…" /> (control)',
        });
      }
      for (const m of line.matchAll(DEAD_OPACITY)) {
        const [whole, variants, prop, token, alpha] = m;
        const fixable = ['bg', 'text', 'border', 'ring'].includes(prop);
        problems.push({
          file,
          line: i + 1,
          text: whole,
          why: fixable
            ? `generates no CSS — use ${variants}mix-${prop}-${token}/${alpha}`
            : 'generates no CSS (theme colours cannot take a /NN modifier) — use an arbitrary value',
        });
      }
      for (const m of line.matchAll(TINY_TEXT)) {
        const size = Number(m[2]);
        if (size >= 12 || (size >= 11 && line.includes('uppercase'))) continue;
        problems.push({
          file,
          line: i + 1,
          text: m[0],
          why: `${size}px is under the readability floor — use ${m[1]}text-xs (12px), or ${m[1]}text-sm (14px) for a title`,
        });
      }
      for (const m of line.matchAll(PIXEL_KEYS)) {
        problems.push({
          file,
          line: i + 1,
          text: m[0],
          why: `${m[4]} is ${m[4]}px in this repo's spacing scale — write ${m[1]}${m[2]}${m[3]}-[${REM[m[4]]}]`,
        });
      }
    });
  }
}

if (all) {
  const perModule = {};
  for (const p of problems) {
    const mod = relative(root, p.file).split('/').slice(0, 3).join('/');
    perModule[mod] = (perModule[mod] || 0) + 1;
  }
  console.log(`${problems.length} uses across src/ (information only):`);
  for (const [m, n] of Object.entries(perModule).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${m}`);
  process.exit(0);
}

if (problems.length === 0) {
  console.log('check:tailwind — no silent-no-op Tailwind classes in the To-Do area.');
} else {
  console.error(
    `check:tailwind — ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`
  );
  for (const p of problems)
    console.error(`  ${relative(root, p.file)}:${p.line}  ${p.text}\n      ${p.why}`);
  console.error('\nSee ai-to-do.md, item 1.5.');
  process.exit(1);
}
