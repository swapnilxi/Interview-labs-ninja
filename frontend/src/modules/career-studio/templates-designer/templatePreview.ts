/**
 * Client-side preview renderers for the Template Designer. These mirror the
 * backend (career_studio/render.py) closely enough for a faithful live preview
 * inside an <iframe srcDoc>, so the user sees changes instantly without saving.
 * The backend remains the source of truth for the actual export.
 */

import { ACCENT_HEX, type PortfolioTemplateSpec, type ResumeTemplateSpec } from '../shared/types';
import { initials } from '../shared/portfolioTemplates';
import { BASE_CSS as PORTFOLIO_BASE_CSS, getCss as getPortfolioTemplateCss } from '../portfolio/templates';

/** Minimal shape shared by CareerView.sections and Resume.sections — enough to
 * render a real preview instead of sample data, when a profile is in context. */
export interface PreviewSection {
  section_type: string;
  title?: string | null;
  content?: any;
  is_hidden?: boolean;
  hidden?: boolean;
}

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

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Renders a resume section list into the same markup shape as SAMPLE_RESUME_BODY
 * (.header/.sec/.item classes), so a real profile's data previews faithfully
 * inside the Template Designer instead of generic sample copy. */
function buildResumePreviewBody(sections: PreviewSection[]): string {
  const visible = sections.filter((s) => !(s.hidden ?? s.is_hidden));
  const personal = visible.find((s) => s.section_type === 'personal_info');
  const pc = personal?.content || {};
  const contactBits = [pc.email, pc.phone, pc.location, ...((pc.links || []) as any[]).map((l) => (l && typeof l === 'object' ? l.url || l.label : l))].filter(Boolean);

  const header = `
    <div class="header">
      <h1 class="name">${esc(pc.name || 'Your Name')}</h1>
      ${pc.title ? `<div class="role">${esc(pc.title)}</div>` : ''}
      ${contactBits.length ? `<div class="contact">${contactBits.map((b) => esc(b)).join(' · ')}</div>` : ''}
    </div>`;

  const sectionsHtml = visible
    .filter((s) => s.section_type !== 'personal_info')
    .map((s) => {
      const title = s.title || titleCase(s.section_type);
      const content = s.content || {};
      if (s.section_type === 'summary') {
        return content.text ? `<section class="sec"><h2>${esc(title)}</h2><p class="summary">${esc(content.text)}</p></section>` : '';
      }
      if (s.section_type === 'skills') {
        const groups = content.groups || [];
        if (!groups.length) return '';
        const line = groups.map((g: any) => `<b>${esc(g.name || '')}:</b> ${(g.items || []).map((i: any) => esc(i)).join(', ')}`).join(' &nbsp; ');
        return `<section class="sec"><h2>${esc(title)}</h2><p class="summary">${line}</p></section>`;
      }
      const items = content.items || [];
      if (!items.length) return '';
      const itemsHtml = items
        .map(
          (it: any) => `
        <div class="item">
          <div class="item-title">${esc(it.title || '')}${it.subtitle ? ` — ${esc(it.subtitle)}` : ''}</div>
          ${it.date ? `<div class="item-sub">${esc(it.date)}</div>` : ''}
          ${(it.bullets || []).length ? `<ul>${it.bullets.map((b: any) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        </div>`,
        )
        .join('');
      return `<section class="sec"><h2>${esc(title)}</h2>${itemsHtml}</section>`;
    })
    .join('');

  return header + sectionsHtml;
}

export function resumePreviewHtml(spec: ResumeTemplateSpec, sections?: PreviewSection[]): string {
  const accentHex = ACCENT_HEX[spec.accent] || ACCENT_HEX.violet;
  const css = RESUME_BASE_CSS + resumeCssFromSpec(spec, accentHex);
  const hasRealData = !!sections?.some((s) => (s.content && Object.keys(s.content).length > 0) || s.section_type === 'personal_info');
  const body = hasRealData ? buildResumePreviewBody(sections!) : SAMPLE_RESUME_BODY;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

/** Renders a resume section list into the portfolio preview's markup shape
 * (.hero/.w/h2/.para/.chip classes) — same idea as buildResumePreviewBody,
 * mirroring the backend's resolved_to_widgets: personal_info becomes the
 * hero, summary becomes "About", skills become chips, everything else
 * becomes an items section. */
/** Builds the shared avatar markup (photo when set, else initials-in-ring). */
function avatarHtml(pc: any): string {
  const name = pc.name || 'Your Name';
  const inner = pc.avatar_url ? `<img src="${esc(pc.avatar_url)}" alt="" />` : esc(initials(name));
  return `<div class="avatar-ring"><div class="avatar">${inner}</div></div>`;
}

/** A LinkX link-in-bio card: icon square + title/subtitle + optional badge + arrow. */
function linkBtnHtml(l: any): string {
  const url = typeof l === 'object' ? l.url || '' : l;
  const label = typeof l === 'object' ? l.label || l.url || '' : l;
  if (typeof l !== 'object') {
    return `<a class="link-btn" href="${esc(url)}"><span class="link-icon">🔗</span><span class="link-text"><span class="link-title">${esc(label)}</span></span><span class="link-arrow">→</span></a>`;
  }
  const icon = l.icon || label[0] || '🔗';
  const featuredTag = l.featured ? '<span class="featured-tag">Featured</span>' : '';
  const badge = l.badge ? `<span class="link-badge">${esc(l.badge)}</span>` : '';
  return (
    `<a class="link-btn${l.featured ? ' featured' : ''}" href="${esc(url)}">` +
    `<span class="link-icon">${esc(icon)}</span>` +
    `<span class="link-text"><span class="link-title">${esc(label)}</span>${l.subtitle ? `<span class="link-sub">${esc(l.subtitle)}</span>` : ''}</span>` +
    `${featuredTag}${badge}<span class="link-arrow">→</span></a>`
  );
}

function buildPortfolioPreviewBody(sections: PreviewSection[], isLinkX: boolean): string {
  const visible = sections.filter((s) => !(s.hidden ?? s.is_hidden));
  const personal = visible.find((s) => s.section_type === 'personal_info');
  const pc = personal?.content || {};
  const availPill = pc.available ? '<div class="avail-pill">Open to work</div>' : '';
  const hero = isLinkX
    ? `<div class="hero">${avatarHtml(pc)}<h1>${esc(pc.name || 'Your Name')}</h1>${pc.title ? `<p>${esc(pc.title)}</p>` : ''}${pc.tagline ? `<p>${esc(pc.tagline)}</p>` : ''}${availPill}</div>`
    : `<div class="hero">${pc.avatar_url ? avatarHtml(pc) : ''}<h1>${esc(pc.name || 'Your Name')}</h1>${pc.title ? `<p>${esc(pc.title)}</p>` : ''}${availPill}</div>`;

  const linkxBlock = (() => {
    if (!isLinkX) return '';
    const bits = [pc.email, pc.phone, pc.location].filter(Boolean);
    const links = (pc.links || []).filter((l: any) => (l && typeof l === 'object' ? l.url || l.label : l));
    if (!bits.length && !links.length) return '';
    const meta = bits.length ? `<p class="contact-meta">${bits.map((b: any) => esc(b)).join(' · ')}</p>` : '';
    const btns = links.map((l: any) => linkBtnHtml(l)).join('');
    return `<section class="w">${meta}${btns}</section>`;
  })();

  const sectionsHtml = visible
    .filter((s) => s.section_type !== 'personal_info')
    .map((s) => {
      const title = s.title || titleCase(s.section_type);
      const content = s.content || {};
      if (s.section_type === 'summary') {
        return content.text ? `<section class="w"><h2>${esc(title)}</h2><p class="para">${esc(content.text)}</p></section>` : '';
      }
      if (s.section_type === 'skills') {
        const chips = (content.groups || []).flatMap((g: any) => g.items || []);
        if (!chips.length) return '';
        return `<section class="w"><h2>${esc(title)}</h2><div>${chips.map((c: any) => `<span class="chip">${esc(c)}</span>`).join('')}</div></section>`;
      }
      const items = content.items || [];
      if (!items.length) return '';
      const itemsHtml = items
        .map((it: any) => {
          const head = [it.title, it.subtitle].filter(Boolean).map((v) => esc(v)).join(' — ');
          const bullets = (it.bullets || []).length ? `<ul>${it.bullets.map((b: any) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
          return `<p class="para"><b>${head}</b>${it.date ? ` (${esc(it.date)})` : ''}</p>${bullets}`;
        })
        .join('');
      return `<section class="w"><h2>${esc(title)}</h2>${itemsHtml}</section>`;
    })
    .join('');

  return hero + linkxBlock + sectionsHtml;
}

export function portfolioPreviewHtml(spec: PortfolioTemplateSpec, sections?: PreviewSection[]): string {
  const accentHex = ACCENT_HEX[spec.accent] || ACCENT_HEX.violet;
  const serif = spec.font === 'serif';
  const fontStack = serif ? FONT_STACKS.serif : FONT_STACKS.sans;
  const layoutCard = spec.layout === 'card';
  const centered = spec.layout === 'centered' ? 'text-align:center;' : '';
  const isLinkX = spec.background === 'linkx';
  // Modern3D and Visionary have no static css() of their own (see
  // templates/index.ts) — this string-based preview can't run their live
  // Three.js/motion scenes anyway, so they borrow "minimal"'s look for both
  // the css lookup and the `.pf-tpl-<id>` class the css is scoped to
  // (aliasing only the css lookup and leaving the class as `pf-tpl-modern3d`
  // would render with no template styling at all).
  const cssTemplateId = spec.background === 'modern3d' || spec.background === 'visionary' ? 'minimal' : spec.background;
  const css = `
    * { box-sizing:border-box; }
    body { margin:0; color:#1f2430; font-family:${fontStack}; line-height:1.5; }
    ${PORTFOLIO_BASE_CSS}
    ${getPortfolioTemplateCss(cssTemplateId, accentHex)}
    .pf-shell { min-height:100%; padding:26px 16px; }
    .pf-card { max-width:760px; margin:0 auto; border-radius:18px; padding:24px; }
    .hero { background:${accentHex}; color:#fff; border-radius:14px; padding:34px 22px; text-align:center; margin-bottom:20px; }
    .hero h1 { font-size:26px; margin:0; }
    .hero p { opacity:.92; margin:6px 0 0; }
    .contact-meta { text-align:center; font-size:12px; color:#6b7280; margin:0 0 14px; }
    .w { ${layoutCard ? 'background:#fff;border:1px solid #ececf1;border-radius:12px;padding:16px 18px;' : ''} margin-bottom:16px; ${centered} }
    h2 { color:${accentHex}; font-size:17px; margin:0 0 8px; }
    .para { margin:0; }
    .chip { display:inline-block; background:${accentHex}1a; color:${accentHex}; border-radius:999px; padding:3px 10px; font-size:13px; margin:0 4px 4px 0; }
  `;
  const hasRealData = !!sections?.some((s) => (s.content && Object.keys(s.content).length > 0) || s.section_type === 'personal_info');
  const inner = hasRealData
    ? buildPortfolioPreviewBody(sections!, isLinkX)
    : isLinkX
      ? `<div class="hero"><div class="avatar-ring"><div class="avatar">JC</div></div><h1>Jane Candidate</h1><p>Senior Software Engineer</p><div class="avail-pill">Open to work</div></div>
         <section class="w"><p class="contact-meta">jane@example.com · San Francisco</p>
           ${linkBtnHtml({ icon: '💼', label: 'LinkedIn', url: '#', featured: true })}
           ${linkBtnHtml({ icon: '🐙', label: 'GitHub', subtitle: 'Open-source work', url: '#' })}
           ${linkBtnHtml({ icon: '🌐', label: 'Personal site', badge: 'New', url: '#' })}
         </section>`
      : `<div class="hero"><h1>Jane Candidate</h1><p>Senior Software Engineer · Portfolio</p></div>
       <section class="w"><h2>About</h2><p class="para">Engineer who builds reliable, high-scale web platforms and cares about craft.</p></section>
       <section class="w"><h2>Skills</h2>
         <div><span class="chip">Python</span><span class="chip">TypeScript</span><span class="chip">AWS</span><span class="chip">Postgres</span></div>
       </section>
       <section class="w"><h2>Projects</h2><p class="para"><b>Payments rewrite</b> — cut checkout latency 40% across the fleet.</p></section>`;
  const body = `
    <div class="pf-shell pf-tpl-${cssTemplateId}">
      <div class="pf-card">${inner}</div>
    </div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
