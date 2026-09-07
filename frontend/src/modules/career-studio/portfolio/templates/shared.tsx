'use client';

/**
 * Shared widget-rendering internals reused by every self-contained portfolio
 * template component in this folder — the part that's genuinely identical
 * across templates (how a "skills" or "stats" widget lays out, for example).
 * Each template owns its OWN background/card CSS and page shell; this file
 * only owns the bits that would otherwise be duplicated verbatim ten times.
 */

import { WIDGET_LABELS, type PortfolioTheme, type PortfolioWidget } from '../../shared/types';
import { ACCENT_HEX, initials } from '../../shared/portfolioTemplates';

export function accentHexFor(theme?: PortfolioTheme | null): string {
  return ACCENT_HEX[theme?.accent || 'violet'] || ACCENT_HEX.violet;
}

export const ACCENT: Record<string, { grad: string; text: string; chip: string }> = {
  violet: { grad: 'from-violet-600 to-fuchsia-500', text: 'text-violet-600', chip: 'bg-violet-100 text-violet-700' },
  emerald: { grad: 'from-emerald-600 to-teal-500', text: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700' },
  blue: { grad: 'from-blue-600 to-cyan-500', text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700' },
  rose: { grad: 'from-rose-600 to-pink-500', text: 'text-rose-600', chip: 'bg-rose-100 text-rose-700' },
  amber: { grad: 'from-amber-500 to-orange-500', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700' },
  slate: { grad: 'from-slate-700 to-slate-500', text: 'text-slate-700', chip: 'bg-slate-200 text-slate-700' },
};

export function Heading({ text, accent, centered, dark }: { text: string; accent: string; centered?: boolean; dark?: boolean }) {
  return <h2 className={`text-lg font-bold mb-3 ${centered ? 'text-center' : ''} ${dark ? 'text-white' : ACCENT[accent]?.text || 'text-neutral-800'}`}>{text}</h2>;
}

/** {label, value} custom fields (section- or item-level) → "Label: value"
 * strings, mirroring resume/render.py's _custom_field_items so the same data
 * reads the same way on both the resume export and the portfolio. */
function formatCustomFields(fields: any): string[] {
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f) => f && (f.label || f.value))
    .map((f) => (f.label && f.value ? `${f.label}: ${f.value}` : f.label || f.value));
}

/** LinkX's page background is near-black, so its widgets need light text —
 * every other template keeps the original dark-on-light neutral shades.
 * `layout` tiles the items instead of stacking them (grid/columns/row
 * section types) — tiled items get a card border for visual separation,
 * since a plain stacked list doesn't need one but a grid cell does. */
export function Items({ items, dark, layout = 'stack' }: { items: any[]; dark?: boolean; layout?: 'stack' | 'grid' | 'columns' | 'row' }) {
  const wrapCls =
    layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' :
    layout === 'columns' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' :
    layout === 'row' ? 'flex flex-wrap gap-4' :
    'space-y-3';
  const tiled = layout !== 'stack';
  return (
    <div className={wrapCls}>
      {items.map((it, i) => (
        <div key={i} className={tiled ? `rounded-lg border p-3 ${dark ? 'border-white/10' : 'border-neutral-200'} ${layout === 'row' ? 'flex-1 min-w-[180px]' : ''}` : ''}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-neutral-800'}`}>{it.title}{it.subtitle ? <span className={dark ? 'font-normal text-white/60' : 'font-normal text-neutral-600'}> — {it.subtitle}</span> : null}</span>
            {it.date ? <span className={`text-[11px] ${dark ? 'text-white/45' : 'text-neutral-500'}`}>{it.date}</span> : null}
          </div>
          {(() => {
            const bullets = Array.isArray(it.bullets) ? it.bullets.filter(Boolean) : [];
            const customs = formatCustomFields(it.custom_fields);
            if (!bullets.length && !customs.length) return null;
            return (
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                {bullets.map((b: string, j: number) => <li key={`b${j}`} className={`text-[13px] ${dark ? 'text-white/75' : 'text-neutral-700'}`}>{b.replace(/^[-•]\s*/, '')}</li>)}
                {customs.map((c, j) => <li key={`c${j}`} className={`text-[13px] ${dark ? 'text-white/75' : 'text-neutral-700'}`}>{c}</li>)}
              </ul>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

/** Renders one widget's content. `template` selects the LinkX variant for
 * hero/contact (its only genuinely different markup); every other template
 * shares this exact rendering, differing only via each template's own CSS. */
export function WidgetView({ widget, accent, centered, template }: { widget: PortfolioWidget; accent: string; centered?: boolean; template?: string }) {
  const c = widget.content || {};
  const type = widget.widget_type;
  const heading = widget.title || WIDGET_LABELS[type] || 'Section';
  const isLinkX = template === 'linkx';

  if (type === 'hero') {
    if (!(c.headline || c.subheadline || c.tagline)) return null;
    const avatar = (
      <div className="avatar-ring mx-auto">
        <div className="avatar">{c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.headline || 'Your Name')}</div>
      </div>
    );
    const availPill = c.available ? <div className="avail-pill">Open to work</div> : null;
    if (isLinkX) {
      return (
        <div className="hero text-center py-2">
          {avatar}
          <h1 className="mt-3">{c.headline || 'Your Name'}</h1>
          {c.subheadline && <p>{c.subheadline}</p>}
          {c.tagline && <p>{c.tagline}</p>}
          {availPill}
        </div>
      );
    }
    return (
      <div className={`hero rounded-xl bg-gradient-to-br ${ACCENT[accent]?.grad || ACCENT.violet.grad} text-white px-8 py-12 text-center`}>
        {c.avatar_url ? avatar : null}
        <h1 className="text-3xl font-bold tracking-tight">{c.headline || 'Your Name'}</h1>
        {c.subheadline && <p className="text-lg opacity-90 mt-1">{c.subheadline}</p>}
        {c.tagline && <p className="opacity-80 mt-3 max-w-lg mx-auto">{c.tagline}</p>}
        {availPill}
        {c.ctaLabel && (
          c.ctaUrl
            ? <a href={c.ctaUrl} className="inline-block mt-5 px-4 py-2 rounded-lg bg-white/20 text-sm font-semibold hover:bg-white/30">{c.ctaLabel}</a>
            : <span className="inline-block mt-5 px-4 py-2 rounded-lg bg-white/20 text-sm font-semibold">{c.ctaLabel}</span>
        )}
      </div>
    );
  }

  if (type === 'about' || type === 'custom') {
    if (!c.text) return null;
    return (
      <section>
        <Heading text={heading} accent={accent} centered={centered} dark={isLinkX} />
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isLinkX ? 'text-white/75' : 'text-neutral-700'} ${centered ? 'text-center' : ''}`}>{c.text}</p>
      </section>
    );
  }

  if (type === 'skills') {
    const groups = Array.isArray(c.groups) ? c.groups : [];
    if (!groups.length) return null;
    return (
      <section>
        <Heading text={heading} accent={accent} centered={centered} dark={isLinkX} />
        <div className={`flex flex-wrap gap-1.5 ${centered ? 'justify-center' : ''}`}>
          {groups.flatMap((g: any) => g.items || []).map((s: string, i: number) => (
            <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${isLinkX ? 'bg-white/10 text-white/85 border border-white/10' : ACCENT[accent]?.chip || ACCENT.violet.chip}`}>{s}</span>
          ))}
        </div>
      </section>
    );
  }

  if (type === 'stats') {
    const items = Array.isArray(c.items) ? c.items : [];
    if (!items.length) return null;
    return (
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map((it: any, i: number) => (
            <div key={i} className="text-center">
              <div className={`text-2xl font-bold ${isLinkX ? 'text-white' : ACCENT[accent]?.text || 'text-neutral-800'}`}>{it.value}</div>
              <div className={`text-xs ${isLinkX ? 'text-white/50' : 'text-neutral-500'}`}>{it.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (type === 'contact') {
    const bits = [c.email, c.phone, c.location].filter(Boolean);
    const links: Array<{ label: string; url: string; icon?: string; subtitle?: string; featured?: boolean; badge?: string }> = Array.isArray(c.links)
      ? c.links.filter((l: any) => l?.label || l?.url)
      : [];
    if (!bits.length && !links.length) return null;
    if (isLinkX) {
      return (
        <div className="max-w-sm mx-auto w-full">
          {bits.length > 0 && <p className="contact-meta">{bits.join(' · ')}</p>}
          {links.map((l, i) => (
            <a key={i} href={l.url || '#'} className={`link-btn${l.featured ? ' featured' : ''}`}>
              <span className="link-icon">{l.icon || (l.label || l.url || '🔗')[0]}</span>
              <span className="link-text">
                <span className="link-title">{l.label || l.url}</span>
                {l.subtitle && <span className="link-sub">{l.subtitle}</span>}
              </span>
              {l.featured && <span className="featured-tag">Featured</span>}
              {l.badge && <span className="link-badge">{l.badge}</span>}
              <span className="link-arrow">→</span>
            </a>
          ))}
        </div>
      );
    }
    return (
      <section>
        <Heading text={heading} accent={accent} centered={centered} />
        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700 ${centered ? 'justify-center' : ''}`}>
          {bits.map((b, i) => <span key={i}>{b}</span>)}
          {links.map((l, i) => (
            l.url ? <a key={`l${i}`} href={l.url} className={ACCENT[accent]?.text || ''}>{l.label || l.url}</a> : <span key={`l${i}`} className={ACCENT[accent]?.text || ''}>{l.label}</span>
          ))}
        </div>
      </section>
    );
  }

  // Generic fallback — experience/projects/education/certifications/…, plus
  // the grid/columns/row/blank layout types. Section note (`text`) and the
  // section's own custom fields (distinct from each item's custom fields,
  // handled inside Items itself) both need showing here, or a note-only /
  // custom-field-only section (e.g. a freshly added Blank section) would
  // silently render as nothing.
  const items = Array.isArray(c.items) ? c.items : [];
  const note = c.text;
  const customs = formatCustomFields(c.custom_fields);
  if (!items.length && !note && !customs.length) return null;
  const layout = type === 'grid' || type === 'columns' || type === 'row' ? type : undefined;
  return (
    <section>
      <Heading text={heading} accent={accent} centered={centered} dark={isLinkX} />
      {note && <p className={`text-sm mb-2 whitespace-pre-wrap ${isLinkX ? 'text-white/75' : 'text-neutral-700'} ${centered ? 'text-center' : ''}`}>{note}</p>}
      {items.length > 0 && <Items items={items} dark={isLinkX} layout={layout} />}
      {customs.length > 0 && <p className={`text-xs mt-2 ${isLinkX ? 'text-white/50' : 'text-neutral-500'}`}>{customs.join(' · ')}</p>}
    </section>
  );
}

/** Base CSS every template layers its own background/card treatment on top
 * of — the font import, shared avatar/availability-pill/chip-hover system.
 * Kept here (not duplicated in each template) since it's genuinely identical
 * across all of them, unlike the background+card rules each template owns. */
export const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&display=swap');

.pf-shell { padding: 32px 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pf-shell h1, .pf-shell h2, .pf-shell .hero h1 { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
.pf-card { background: #fff; border: 1px solid rgba(0,0,0,.05); }

/* Shared avatar + availability pill — every template's hero gets these when
   avatar_url/available are set on personal_info; LinkX layers a richer
   gradient-ring look on top (see linkx.tsx's own CSS). */
.avatar-ring { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; padding: 3px; display: flex; }
.avatar { width: 100%; height: 100%; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: #fff; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Inside a coloured .hero block the accent-filled ring would blend into the
   background, so it gets a translucent-white treatment there instead. */
.hero .avatar-ring { background: rgba(255,255,255,.5); }
.hero .avatar { background: rgba(255,255,255,.25); }
.avail-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 4px 10px 4px 8px; border-radius: 999px; background: rgba(16,185,129,.15); color: #059669; margin: 8px 0 0; }
.avail-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.25); }
.hero .avail-pill { background: rgba(255,255,255,.2); color: #fff; }
.hero .avail-pill::before { background: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,.3); }

/* Widget-level hover micro-interaction (card layout). */
.w { transition: transform .2s ease, box-shadow .2s ease; }
.w[data-card="1"]:hover, .pf-card .w:hover { transform: translateY(-3px); }
`;

export interface PortfolioTemplateProps {
  widgets: PortfolioWidget[];
  theme?: PortfolioTheme | null;
  emptyText?: string;
}

/** The page shell every template renders: shared class names (`pf-shell`,
 * `pf-tpl-<id>`, `pf-card`) so each template's own CSS (scoped under those
 * same selectors) applies with zero rewriting, plus the shared widget list. */
export function PortfolioTemplateShell({
  widgets, theme, emptyText = 'Nothing here yet.', templateId, css,
}: PortfolioTemplateProps & { templateId: string; css: string }) {
  const accent = theme?.accent || 'violet';
  const font = theme?.font === 'serif' ? 'font-serif' : 'font-sans';
  const layout = theme?.layout || 'stack';
  const centered = layout === 'centered';
  const visible = widgets.filter((w) => !w.is_hidden);

  return (
    <div className={`pf-shell pf-tpl-${templateId} flex-1 ${font}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="pf-card rounded-2xl mx-auto max-w-[900px] p-6 sm:p-8 space-y-6 min-h-[500px]">
        {visible.length === 0 ? (
          <p className="text-center text-sm text-neutral-400 py-12">{emptyText}</p>
        ) : (
          visible.map((w) => (
            <div key={w.id} className={layout === 'card' && w.widget_type !== 'hero' ? 'rounded-xl border border-neutral-200 p-5' : ''}>
              <WidgetView widget={w} accent={accent} centered={centered} template={templateId} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
