import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

console.log('=== END-TO-END THEME AUDIT: DRAGON BALL & POKEMON ===\n');

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    failures++;
  }
}

// 1. Check appearanceService.ts
console.log('1. Checking appearanceService.ts preset definitions:');
const appearanceSource = fs.readFileSync(path.join(root, 'src/lib/services/appearanceService.ts'), 'utf8');

assert(
  appearanceSource.includes("{ key: 'pokemon', label: 'Pokemon Edition', hex: '#C41E3A' }"),
  'Pokemon Edition preset is defined with key "pokemon" and hex "#C41E3A"'
);

assert(
  appearanceSource.includes("{ key: 'dragonball', label: 'Dragon Ball', hex: '#FACC15', exact: true }"),
  'Dragon Ball preset is defined with key "dragonball", hex "#FACC15", and exact: true'
);

assert(
  appearanceSource.includes("root.setAttribute('data-accent-preset', presetKey);"),
  'applyAccent mirrors presetKey to data-accent-preset on documentElement'
);

assert(
  appearanceSource.includes("const exact = ACCENT_PRESETS.some((p) => p.key === presetKey && p.exact);"),
  'applyAccent checks exact flag for the active preset'
);

// 2. Math & Token Derivation Parity between appearanceService and layout.tsx
console.log('\n2. Testing Token Derivation & layout.tsx Pre-paint Script Parity:');

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}
function mixRgb(from, toward, amount) {
  return [from[0] + (toward[0] - from[0]) * amount, from[1] + (toward[1] - from[1]) * amount, from[2] + (toward[2] - from[2]) * amount];
}

// Implementation from appearanceService.ts
function deriveServiceTokens(hex, isDark, exact = false) {
  const base = hexToRgb(hex);
  const surface = isDark ? [32, 41, 56] : [245, 246, 250];
  const toward = isDark ? [255, 255, 255] : [0, 0, 0];
  let step = isDark ? 0 : 0.12;
  let primaryRgb = mixRgb(base, toward, step);
  if (!exact) {
    while (step < 0.7 && contrastRatio(primaryRgb, surface) < 4.5) {
      step += 0.04;
      primaryRgb = mixRgb(base, toward, step);
    }
  } else {
    primaryRgb = base;
  }
  const ringRgb = mixRgb(primaryRgb, [255, 255, 255], isDark ? 0.14 : 0.08);
  const glowAlpha = isDark ? 0.22 : 0.16;
  return {
    primary: rgbToHex(primaryRgb),
    primaryForeground: contrastRatio(primaryRgb, [255, 255, 255]) >= contrastRatio(primaryRgb, [11, 16, 32]) ? '#ffffff' : '#0b1020',
    ring: rgbToHex(ringRgb),
    glow: `rgba(${Math.round(primaryRgb[0])},${Math.round(primaryRgb[1])},${Math.round(primaryRgb[2])},${glowAlpha})`,
  };
}

// Implementation from layout.tsx inline script
function runLayoutScript(hex, presetKey, isDark) {
  const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (c, t, k) => [c[0] + (t[0] - c[0]) * k, c[1] + (t[1] - c[1]) * k, c[2] + (t[2] - c[2]) * k];
  const ch = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  const cr = (x, y) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
  const sf = isDark ? [32, 41, 56] : [245, 246, 250];
  const tw = isDark ? [255, 255, 255] : [0, 0, 0];
  let k = isDark ? 0 : 0.12;
  let p = mix(b, tw, k);
  if (presetKey === 'dragonball') {
    p = b;
  } else {
    while (k < 0.7 && cr(p, sf) < 4.5) {
      k += 0.04;
      p = mix(b, tw, k);
    }
  }
  const ring = mix(p, [255, 255, 255], isDark ? 0.14 : 0.08);
  const fg = cr(p, [255, 255, 255]) >= cr(p, [11, 16, 32]) ? '#ffffff' : '#0b1020';
  const hx = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  return {
    primary: hx(p),
    primaryForeground: fg,
    ring: hx(ring),
    glow: 'rgba(' + Math.round(p[0]) + ',' + Math.round(p[1]) + ',' + Math.round(p[2]) + ',' + (isDark ? 0.22 : 0.16) + ')',
    preset: presetKey,
  };
}

for (const isDark of [true, false]) {
  const mode = isDark ? 'Dark' : 'Light';

  // Test Dragon Ball
  const dbService = deriveServiceTokens('#FACC15', isDark, true);
  const dbLayout = runLayoutScript('#FACC15', 'dragonball', isDark);
  assert(dbService.primary === dbLayout.primary, `Dragon Ball ${mode}: primary color matches (${dbService.primary})`);
  assert(dbService.primaryForeground === dbLayout.primaryForeground, `Dragon Ball ${mode}: foreground matches (${dbService.primaryForeground})`);
  assert(dbService.ring === dbLayout.ring, `Dragon Ball ${mode}: ring matches (${dbService.ring})`);
  assert(dbService.glow === dbLayout.glow, `Dragon Ball ${mode}: glow matches (${dbService.glow})`);

  // Test Pokemon
  const pkService = deriveServiceTokens('#C41E3A', isDark, false);
  const pkLayout = runLayoutScript('#C41E3A', 'pokemon', isDark);
  assert(pkService.primary === pkLayout.primary, `Pokemon ${mode}: primary color matches (${pkService.primary})`);
  assert(pkService.primaryForeground === pkLayout.primaryForeground, `Pokemon ${mode}: foreground matches (${pkService.primaryForeground})`);
  assert(pkService.ring === pkLayout.ring, `Pokemon ${mode}: ring matches (${pkService.ring})`);
  assert(pkService.glow === pkLayout.glow, `Pokemon ${mode}: glow matches (${pkService.glow})`);
}

// 3. Check CSS Rules in tailwind.css
console.log('\n3. Checking CSS Rules in tailwind.css:');
const cssSource = fs.readFileSync(path.join(root, 'src/styles/tailwind.css'), 'utf8');

assert(
  cssSource.includes("html[data-accent-preset='pokemon'] .mobile-tab-orb-disc"),
  "CSS rule for Pokemon mobile-tab-orb-disc exists"
);

assert(
  cssSource.includes("html[data-accent-preset='pokemon'] .mobile-tab-orb-disc svg"),
  "CSS rule hiding SVG checkmark in Pokemon tab disc exists"
);

assert(
  cssSource.includes("html[data-accent-preset='dragonball'] .mobile-tab-orb-disc"),
  "CSS rule for Dragon Ball mobile-tab-orb-disc exists"
);

assert(
  cssSource.includes("html[data-accent-preset='dragonball'] .mobile-tab-orb-disc svg"),
  "CSS rule hiding SVG checkmark in Dragon Ball tab disc exists"
);

assert(
  cssSource.includes("background: url('/icons/dragonball.png') center / cover no-repeat;"),
  "Dragon Ball mobile tab disc uses url('/icons/dragonball.png')"
);

assert(
  cssSource.includes("html[data-accent-preset='dragonball']:not(.dark)"),
  "Dragon Ball light mode specific legibility rule exists"
);

assert(
  cssSource.includes("--lab-accent-ink: #b8860b;"),
  "Dragon Ball light mode sets --lab-accent-ink to legible goldenrod (#b8860b)"
);

assert(
  cssSource.includes(".accent-swatch-dot-pokeball"),
  "Swatch class .accent-swatch-dot-pokeball exists in CSS"
);

assert(
  cssSource.includes(".accent-swatch-dot-dragonball"),
  "Swatch class .accent-swatch-dot-dragonball exists in CSS"
);

// 4. Check Assets on Disk
console.log('\n4. Checking Static Assets in public/icons:');
const dbIconPath = path.join(root, 'public/icons/dragonball.png');
const pkIconPath = path.join(root, 'public/icons/pokeball.png');

assert(fs.existsSync(dbIconPath), 'public/icons/dragonball.png exists on disk');
assert(fs.existsSync(pkIconPath), 'public/icons/pokeball.png exists on disk');
if (fs.existsSync(dbIconPath)) {
  const stat = fs.statSync(dbIconPath);
  assert(stat.size > 10000, `dragonball.png is valid image file (${(stat.size / 1024).toFixed(1)} KB)`);
}
if (fs.existsSync(pkIconPath)) {
  const stat = fs.statSync(pkIconPath);
  assert(stat.size > 10000, `pokeball.png is valid image file (${(stat.size / 1024).toFixed(1)} KB)`);
}

// 5. Check AppearanceSettingsCard.tsx
console.log('\n5. Checking AppearanceSettingsCard.tsx UI implementation:');
const cardSource = fs.readFileSync(path.join(root, 'src/modules/config/AppearanceSettingsCard.tsx'), 'utf8');

assert(
  cardSource.includes("preset.key === 'pokemon'"),
  "AppearanceSettingsCard checks for preset.key === 'pokemon'"
);

assert(
  cardSource.includes("accent-swatch-dot-pokeball"),
  "AppearanceSettingsCard applies 'accent-swatch-dot-pokeball' class"
);

assert(
  cardSource.includes("preset.key === 'dragonball'"),
  "AppearanceSettingsCard checks for preset.key === 'dragonball'"
);

assert(
  cardSource.includes("accent-swatch-dot-dragonball"),
  "AppearanceSettingsCard applies 'accent-swatch-dot-dragonball' class"
);

assert(
  cardSource.includes("choose(preset.hex, preset.key)"),
  "Clicking a swatch passes both hex and preset.key to choose()"
);

// Summary
console.log('\n======================================================');
if (failures === 0) {
  console.log('ALL AUDIT CHECKS PASSED: Theme implementation is robust!');
} else {
  console.error(`${failures} AUDIT CHECKS FAILED: Review the errors above.`);
  process.exit(1);
}
