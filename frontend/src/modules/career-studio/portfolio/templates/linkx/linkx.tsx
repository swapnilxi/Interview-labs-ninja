'use client';

/** LinkX portfolio template — dark, link-in-bio style single column. The only
 * built-in template with genuinely different widget markup (hero/contact) —
 * that variant lives in the shared `WidgetView` (keyed off `template === 'linkx'`),
 * since it's the widget-content renderer's job, not the page shell's. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-linkx {
  background: radial-gradient(1200px circle at 20% -10%, #2a1550 0%, transparent 55%),
              radial-gradient(1000px circle at 100% 10%, #0d2b3d 0%, transparent 50%),
              linear-gradient(160deg, #0a0a0f 0%, #150c26 55%, #1a0a2e 100%);
}
.pf-tpl-linkx .pf-card { max-width: 460px; background: transparent; border: none; box-shadow: none; }
.pf-tpl-linkx .hero { background: transparent; color: #f5f3ff; padding: 8px 4px 4px; }
.pf-tpl-linkx .hero h1 { font-size: 25px; color: #fff; font-weight: 700; }
.pf-tpl-linkx .hero p { color: rgba(229,224,255,.62); }
/* 3-class selectors (not just .pf-tpl-linkx .avatar-ring) so these reliably
   beat the equally-specific ".hero .avatar-ring" contrast override in shared.tsx,
   regardless of source order. */
.pf-tpl-linkx .hero .avatar-ring { width: 76px; height: 76px; padding: 3px; background: conic-gradient(from 180deg, ${a}, #06b6d4, #f97316, ${a}); box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 12px 30px -8px ${a}88; }
.pf-tpl-linkx .hero .avatar { background: #16101f; font-size: 22px; }
.pf-tpl-linkx .hero .avail-pill { background: rgba(16,185,129,.14); color: #34d399; }
.pf-tpl-linkx .hero .avail-pill::before { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.25); }
.pf-tpl-linkx h2 { color: rgba(229,224,255,.5); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
.pf-tpl-linkx .contact-meta { color: rgba(229,224,255,.5); }
.pf-tpl-linkx .chip { background: rgba(255,255,255,.08); color: #e5e0ff; border: 1px solid rgba(255,255,255,.1); }
.pf-tpl-linkx .para { color: rgba(229,224,255,.78); }

.pf-tpl-linkx .link-btn {
  display: flex; align-items: center; gap: 12px; text-align: left; text-decoration: none;
  padding: 13px 16px; margin-bottom: 12px; border-radius: 16px;
  background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  color: #f5f3ff; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
}
.pf-tpl-linkx .link-btn:hover { transform: translateY(-3px); border-color: ${a}aa; background: rgba(255,255,255,.09); box-shadow: 0 16px 32px -12px ${a}70; }
.pf-tpl-linkx .link-btn.featured { border: 1px solid transparent; background-image: linear-gradient(rgba(255,255,255,.07), rgba(255,255,255,.07)), linear-gradient(120deg, ${a}, #06b6d4, #f97316); background-origin: border-box; background-clip: padding-box, border-box; }
.pf-tpl-linkx .link-icon { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font-size: 16px; }
.pf-tpl-linkx .link-text { flex: 1; min-width: 0; }
.pf-tpl-linkx .link-title { font-weight: 600; font-size: 14.5px; display: block; }
.pf-tpl-linkx .link-sub { font-weight: 400; font-size: 12px; color: rgba(229,224,255,.5); display: block; margin-top: 1px; }
.pf-tpl-linkx .link-badge { flex-shrink: 0; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: ${a}33; color: #d8c9ff; }
.pf-tpl-linkx .featured-tag { flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: linear-gradient(120deg, ${a}, #06b6d4); color: #fff; margin-right: 2px; }
.pf-tpl-linkx .link-arrow { flex-shrink: 0; opacity: .35; transition: transform .2s ease, opacity .2s ease; }
.pf-tpl-linkx .link-btn:hover .link-arrow { opacity: .9; transform: translateX(3px); }
`;
}

export default function LinkxTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="linkx" css={css(accentHexFor(props.theme))} />;
}
