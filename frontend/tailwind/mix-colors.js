/**
 * Opacity for the theme's colours: `mix-bg-muted/20`, `hover:mix-bg-primary/90`,
 * `mix-border-border/50`, `placeholder:mix-text-muted-foreground/60`, `mix-ring-primary/40`.
 *
 * Why this exists: the theme colours in tailwind.config.js are plain `var(--color-x)` strings, so
 * Tailwind cannot apply an opacity modifier to them. `bg-muted/20`, `border-border/60`,
 * `hover:bg-primary/90` … compile to NOTHING — no CSS, no warning — and the style silently never
 * happens (an invisible selected state, a hover with no tint). Palette colours (`bg-amber-500/10`)
 * and the `ab-*` colours are fine; only these tokens are affected.
 *
 * These utilities do the same job with `color-mix()` under NEW names, so no class that already
 * exists changes meaning and no other module is restyled. `npm run check:tailwind` fails if a dead
 * class creeps back into the To-Do area. See ai-to-do.md, item 1.5.
 */
const plugin = require('tailwindcss/plugin');

const WITH_FOREGROUND = [
  'primary',
  'secondary',
  'accent',
  'destructive',
  'success',
  'warning',
  'error',
  'muted',
  'card',
  'popover',
];
const PLAIN = ['border', 'input', 'ring', 'background', 'foreground', 'surface', 'progress', 'info'];

const values = {};
for (const name of PLAIN) values[name] = `var(--color-${name})`;
for (const name of WITH_FOREGROUND) {
  values[name] = `var(--color-${name})`;
  values[`${name}-foreground`] = `var(--color-${name}-foreground)`;
}

/** `20` → 20%, `[0.3]` → 30%; anything else is ignored (the class then generates nothing, as before). */
function percent(modifier) {
  if (modifier == null) return null;
  const arbitrary = /^\[(\d*\.?\d+)\]$/.exec(modifier);
  const n = arbitrary ? Number(arbitrary[1]) * 100 : Number(modifier);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function mixed(value, modifier) {
  if (modifier == null) return value;
  const p = percent(modifier);
  return p == null ? null : `color-mix(in srgb, ${value} ${p}%, transparent)`;
}

module.exports = plugin(({ matchUtilities }) => {
  const make =
    (property) =>
    (value, { modifier }) => {
      const color = mixed(value, modifier);
      return color == null ? null : { [property]: color };
    };
  const options = { values, modifiers: 'any' };
  matchUtilities({ 'mix-bg': make('background-color') }, options);
  matchUtilities({ 'mix-text': make('color') }, options);
  matchUtilities({ 'mix-border': make('border-color') }, options);
  matchUtilities({ 'mix-ring': make('--tw-ring-color') }, options);
});
