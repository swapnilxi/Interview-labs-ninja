'use client';

/** Editors specific to portfolio widget shapes. Reuses ItemsEditor/NoteEditor/SkillsEditor
 *  from sectionEditors for list/text/skills widgets. */

import Icon from '@/components/ui/AppIcon';

const inputCls = 'w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

export function HeroEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const set = (k: string, v: string) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-3">
      <div><label className={labelCls}>Headline</label><input className={inputCls} value={c.headline || ''} onChange={(e) => set('headline', e.target.value)} placeholder="Jane Doe" /></div>
      <div><label className={labelCls}>Subheadline</label><input className={inputCls} value={c.subheadline || ''} onChange={(e) => set('subheadline', e.target.value)} placeholder="Staff Software Engineer" /></div>
      <div><label className={labelCls}>Tagline</label><input className={inputCls} value={c.tagline || ''} onChange={(e) => set('tagline', e.target.value)} placeholder="I build reliable systems at scale." /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>CTA label</label><input className={inputCls} value={c.ctaLabel || ''} onChange={(e) => set('ctaLabel', e.target.value)} placeholder="Get in touch" /></div>
        <div><label className={labelCls}>CTA link</label><input className={inputCls} value={c.ctaUrl || ''} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="mailto:jane@x.com" /></div>
      </div>
    </div>
  );
}

export function ContactEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const set = (k: string, v: any) => onChange({ ...c, [k]: v });
  const links: Array<{ label: string; url: string }> = Array.isArray(c.links) ? c.links : [];
  const setLink = (i: number, k: 'label' | 'url', v: string) => set('links', links.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className={labelCls}>Email</label><input className={inputCls} value={c.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="jane@x.com" /></div>
        <div><label className={labelCls}>Phone</label><input className={inputCls} value={c.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+1 …" /></div>
        <div><label className={labelCls}>Location</label><input className={inputCls} value={c.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="Remote" /></div>
      </div>
      <div>
        <label className={labelCls}>Links</label>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={l.label || ''} onChange={(e) => setLink(i, 'label', e.target.value)} placeholder="GitHub" />
              <input className={inputCls} value={l.url || ''} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" />
              <button className="p-2 text-muted-foreground hover:text-error" onClick={() => set('links', links.filter((_, idx) => idx !== i))}><Icon name="XMarkIcon" size={16} /></button>
            </div>
          ))}
          <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={() => set('links', [...links, { label: '', url: '' }])}>
            <Icon name="PlusIcon" size={14} /> Add link
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const items: Array<{ label: string; value: string }> = Array.isArray(c.items) ? c.items : [];
  const setItem = (i: number, k: 'label' | 'value', v: string) => onChange({ ...c, items: items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) });
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <input className={`${inputCls} max-w-[120px]`} value={it.value || ''} onChange={(e) => setItem(i, 'value', e.target.value)} placeholder="10+" />
          <input className={inputCls} value={it.label || ''} onChange={(e) => setItem(i, 'label', e.target.value)} placeholder="Years experience" />
          <button className="p-2 text-muted-foreground hover:text-error" onClick={() => onChange({ ...c, items: items.filter((_, idx) => idx !== i) })}><Icon name="XMarkIcon" size={16} /></button>
        </div>
      ))}
      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={() => onChange({ ...c, items: [...items, { label: '', value: '' }] })}>
        <Icon name="PlusIcon" size={14} /> Add stat
      </button>
    </div>
  );
}
