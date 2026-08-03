'use client';

import { usePortfolioStore } from './store/portfolioStore';
import { WIDGET_LABELS, type PortfolioWidget } from './types';

const ACCENT: Record<string, { grad: string; text: string; chip: string; btn: string }> = {
  violet: { grad: 'from-violet-600 to-fuchsia-500', text: 'text-violet-600', chip: 'bg-violet-100 text-violet-700', btn: 'bg-violet-600' },
  emerald: { grad: 'from-emerald-600 to-teal-500', text: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600' },
  blue: { grad: 'from-blue-600 to-cyan-500', text: 'text-blue-600', chip: 'bg-blue-100 text-blue-700', btn: 'bg-blue-600' },
  rose: { grad: 'from-rose-600 to-pink-500', text: 'text-rose-600', chip: 'bg-rose-100 text-rose-700', btn: 'bg-rose-600' },
  amber: { grad: 'from-amber-500 to-orange-500', text: 'text-amber-600', chip: 'bg-amber-100 text-amber-700', btn: 'bg-amber-600' },
  slate: { grad: 'from-slate-700 to-slate-500', text: 'text-slate-700', chip: 'bg-slate-200 text-slate-700', btn: 'bg-slate-700' },
};

function Heading({ text, accent }: { text: string; accent: string }) {
  return <h2 className={`text-lg font-bold mb-3 ${ACCENT[accent]?.text || 'text-neutral-800'}`}>{text}</h2>;
}

function Items({ items }: { items: any[] }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-neutral-800">{it.title}{it.subtitle ? <span className="font-normal text-neutral-600"> — {it.subtitle}</span> : null}</span>
            {it.date ? <span className="text-[11px] text-neutral-500">{it.date}</span> : null}
          </div>
          {Array.isArray(it.bullets) && it.bullets.filter(Boolean).length > 0 && (
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              {it.bullets.filter(Boolean).map((b: string, j: number) => <li key={j} className="text-[13px] text-neutral-700">{b.replace(/^[-•]\s*/, '')}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function WidgetView({ widget, accent }: { widget: PortfolioWidget; accent: string }) {
  const c = widget.content || {};
  const type = widget.widget_type;
  const heading = widget.title || WIDGET_LABELS[type] || 'Section';

  if (type === 'hero') {
    if (!(c.headline || c.subheadline || c.tagline)) return null;
    return (
      <div className={`rounded-xl bg-gradient-to-br ${ACCENT[accent]?.grad || ACCENT.violet.grad} text-white px-8 py-12 text-center`}>
        <h1 className="text-3xl font-bold tracking-tight">{c.headline || 'Your Name'}</h1>
        {c.subheadline && <p className="text-lg opacity-90 mt-1">{c.subheadline}</p>}
        {c.tagline && <p className="opacity-80 mt-3 max-w-lg mx-auto">{c.tagline}</p>}
        {c.ctaLabel && <span className="inline-block mt-5 px-4 py-2 rounded-lg bg-white/20 text-sm font-semibold">{c.ctaLabel}</span>}
      </div>
    );
  }

  if (type === 'about' || type === 'custom') {
    if (!c.text) return null;
    return <section><Heading text={heading} accent={accent} /><p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{c.text}</p></section>;
  }

  if (type === 'skills') {
    const groups = Array.isArray(c.groups) ? c.groups : [];
    if (!groups.length) return null;
    return (
      <section>
        <Heading text={heading} accent={accent} />
        <div className="flex flex-wrap gap-1.5">
          {groups.flatMap((g: any) => (g.items || [])).map((s: string, i: number) => (
            <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${ACCENT[accent]?.chip || ACCENT.violet.chip}`}>{s}</span>
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
              <div className={`text-2xl font-bold ${ACCENT[accent]?.text || 'text-neutral-800'}`}>{it.value}</div>
              <div className="text-xs text-neutral-500">{it.label}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (type === 'contact') {
    const bits = [c.email, c.phone, c.location].filter(Boolean);
    const links: Array<{ label: string; url: string }> = Array.isArray(c.links) ? c.links.filter((l: any) => l?.label || l?.url) : [];
    if (!bits.length && !links.length) return null;
    return (
      <section>
        <Heading text={heading} accent={accent} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700">
          {bits.map((b, i) => <span key={i}>{b}</span>)}
          {links.map((l, i) => <span key={`l${i}`} className={ACCENT[accent]?.text || ''}>{l.label || l.url}</span>)}
        </div>
      </section>
    );
  }

  const items = Array.isArray(c.items) ? c.items : [];
  if (!items.length) return null;
  return <section><Heading text={heading} accent={accent} /><Items items={items} /></section>;
}

export default function PortfolioPreview() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  if (!portfolio) return null;
  const accent = portfolio.theme?.accent || 'violet';
  const font = portfolio.theme?.font === 'serif' ? 'font-serif' : 'font-sans';
  const widgets = portfolio.widgets.filter((w) => !w.is_hidden);

  return (
    <div className={`bg-white rounded-lg shadow-sm ring-1 ring-black/5 mx-auto max-w-[900px] p-6 sm:p-8 space-y-6 min-h-[600px] ${font}`}>
      {widgets.length === 0 ? (
        <p className="text-center text-sm text-neutral-400 py-12">Add widgets on the left — your portfolio renders here live.</p>
      ) : (
        widgets.map((w) => <WidgetView key={w.id} widget={w} accent={accent} />)
      )}
    </div>
  );
}
