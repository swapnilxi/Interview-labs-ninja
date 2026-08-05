/**
 * Client-side preview renderers for the Template Designer. These mirror the
 * backend (career_studio/render.py) closely enough for a faithful live preview
 * inside an <iframe srcDoc>, so the user sees changes instantly without saving.
 * The backend remains the source of truth for the actual export.
 */

import { ACCENT_HEX, type PortfolioTemplateSpec, type ResumeTemplateSpec } from './types';
import { portfolioTemplateCss } from './portfolioTemplates';

const FONT_STACKS: Record<string, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: 'Helvetica, Arial, sans-serif',
  mono: "'Courier New', monospace",
};

const RESUME_BASE_CSS = `
* { box-sizing: border-box; }
html { color: #1a1a1a; line-height: 1.4; }
body { margin: 0; padding: 28px 34px; }
a { color: inherit; text-decoration: none; }
.header .name { margin: 0; }
.header .role { margin: 2px 0 4px; }
.header .contact { font-size: 9.5pt; color: #555; }
.sec { margin-top: 14px; }
.sec h2 { text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px; }
.item { margin-bottom: 8px; }
.item-title { font-weight: bold; }
.item-sub { color: #444; font-style: italic; font-size: 10pt; margin-bottom: 2px; }
ul { margin: 3px 0 0 16px; padding: 0; }
li { margin-bottom: 2px; font-size: 10pt; }
.summary { font-size: 10pt; margin: 2px 0; }
`;

function resumeCssFromSpec(spec: ResumeTemplateSpec, accentHex: string): string {
  const bodyFont = FONT_STACKS[spec.font] || FONT_STACKS.sans;
  const nameFont = FONT_STACKS[spec.nameFont || spec.font] || bodyFont;
  const size = { compact: '9.5pt', normal: '10.5pt', relaxed: '11pt' }[spec.density] || '10.5pt';
  const secGap = { compact: '9px', normal: '14px', relaxed: '18px' }[spec.density] || '14px';
  const nameSize = { compact: '18pt', normal: '21pt', relaxed: '23pt' }[spec.density] || '21pt';
  const align = spec.headerAlign === 'center' ? 'center' : 'left';
  const ink = '#1a1a1a';
  let nameColor = spec.nameColor === 'accent' ? accentHex : ink;
  let roleColor = '#444';
  let contactColor = '#555';
  let headerCss: string;
  if (spec.headerStyle === 'rule') headerCss = `.header { text-align:${align}; border-bottom:2px solid #222; padding-bottom:8px; }`;
  else if (spec.headerStyle === 'sidebar') headerCss = `.header { text-align:left; border-left:5px solid ${accentHex}; padding:4px 0 6px 12px; }`;
  else if (spec.headerStyle === 'band') {
    headerCss = `.header { text-align:${align}; background:${accentHex}; padding:16px 18px; }`;
    nameColor = '#fff'; roleColor = '#f4f0ff'; contactColor = '#ece7fb';
  } else headerCss = `.header { text-align:${align}; padding-bottom:8px; }`;

  const h = spec.heading;
  const hColor = { accent: accentHex, muted: '#9a9aa5', ink: '#111' }[h.color] || '#111';
  const hAlign = h.align === 'center' ? 'center' : 'left';
  const hFont = h.font ? FONT_STACKS[h.font] || bodyFont : bodyFont;
  const parts = [`font-size:11pt`, `color:${hColor}`, `text-align:${hAlign}`, `font-family:${hFont}`];
  if (h.uppercase) parts.push('text-transform:uppercase', `letter-spacing:${h.spacing === 'wide' ? '0.18em' : '0.06em'}`);
  else parts.push('text-transform:none', 'letter-spacing:0');
  if (h.rule === 'under') parts.push('border-bottom:1px solid #bbb', 'padding-bottom:2px');
  else if (h.rule === 'leftbar') parts.push(`border-left:3px solid ${accentHex}`, 'padding-left:6px');

  return `
    body { font-family:${bodyFont}; font-size:${size}; }
    ${headerCss}
    .header .name { font-family:${nameFont}; font-size:${nameSize}; color:${nameColor}; }
    .header .role { font-size:11.5pt; color:${roleColor}; }
    .header .contact { color:${contactColor}; } .header .contact a { color:${contactColor}; }
    .sec { margin-top:${secGap}; }
    .sec h2 { ${parts.join(';')}; }
  `;
}

const SAMPLE_RESUME_BODY = `
  <div class="header">
    <h1 class="name">Jane Candidate</h1>
    <div class="role">Senior Software Engineer</div>
    <div class="contact">jane@example.com · (555) 010-2040 · San Francisco · linkedin.com/in/jane</div>
  </div>
  <section class="sec"><h2>Summary</h2>
    <p class="summary">Engineer with 8 years building reliable, high-scale web platforms. Ships pragmatically, mentors teams, and cares about the details users feel.</p>
  </section>
  <section class="sec"><h2>Experience</h2>
    <div class="item"><div class="item-title">Staff Engineer — Acme Corp</div>
      <div class="item-sub">2021 – Present</div>
      <ul><li>Led the payments rewrite, cutting checkout latency 40%.</li><li>Mentored 6 engineers; ran the design-review guild.</li></ul>
    </div>
    <div class="item"><div class="item-title">Engineer — Globex</div>
      <div class="item-sub">2017 – 2021</div>
      <ul><li>Built the notifications service (12M msgs/day).</li></ul>
    </div>
  </section>
  <section class="sec"><h2>Skills</h2>
    <p class="summary"><b>Languages:</b> Python, TypeScript, Go &nbsp; <b>Cloud:</b> AWS, Postgres, Kafka</p>
  </section>
`;

export function resumePreviewHtml(spec: ResumeTemplateSpec): string {
  const accentHex = ACCENT_HEX[spec.accent] || ACCENT_HEX.violet;
  const css = RESUME_BASE_CSS + resumeCssFromSpec(spec, accentHex);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${SAMPLE_RESUME_BODY}</body></html>`;
}

export function portfolioPreviewHtml(spec: PortfolioTemplateSpec): string {
  const accentHex = ACCENT_HEX[spec.accent] || ACCENT_HEX.violet;
  const serif = spec.font === 'serif';
  const fontStack = serif ? FONT_STACKS.serif : FONT_STACKS.sans;
  const layoutCard = spec.layout === 'card';
  const centered = spec.layout === 'centered' ? 'text-align:center;' : '';
  const css = `
    * { box-sizing:border-box; }
    body { margin:0; color:#1f2430; font-family:${fontStack}; line-height:1.5; }
    ${portfolioTemplateCss(accentHex)}
    .pf-shell { min-height:100%; padding:26px 16px; }
    .pf-card { max-width:760px; margin:0 auto; border-radius:18px; padding:24px; }
    .hero { background:${accentHex}; color:#fff; border-radius:14px; padding:34px 22px; text-align:center; margin-bottom:20px; }
    .hero h1 { font-size:26px; margin:0; }
    .hero p { opacity:.92; margin:6px 0 0; }
    .w { ${layoutCard ? 'background:#fff;border:1px solid #ececf1;border-radius:12px;padding:16px 18px;' : ''} margin-bottom:16px; ${centered} }
    h2 { color:${accentHex}; font-size:17px; margin:0 0 8px; }
    .para { margin:0; }
    .chip { display:inline-block; background:${accentHex}1a; color:${accentHex}; border-radius:999px; padding:3px 10px; font-size:13px; margin:0 4px 4px 0; }
  `;
  const body = `
    <div class="pf-shell pf-tpl-${spec.background}">
      <div class="pf-card">
        <div class="hero"><h1>Jane Candidate</h1><p>Senior Software Engineer · Portfolio</p></div>
        <section class="w"><h2>About</h2><p class="para">Engineer who builds reliable, high-scale web platforms and cares about craft.</p></section>
        <section class="w"><h2>Skills</h2>
          <div><span class="chip">Python</span><span class="chip">TypeScript</span><span class="chip">AWS</span><span class="chip">Postgres</span></div>
        </section>
        <section class="w"><h2>Projects</h2><p class="para"><b>Payments rewrite</b> — cut checkout latency 40% across the fleet.</p></section>
      </div>
    </div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
