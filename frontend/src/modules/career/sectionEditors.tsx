'use client';

/**
 * Structured editors for each resume section shape. Each takes the section's
 * `content` object and an `onChange(nextContent)` callback; the store debounces
 * the actual autosave.
 */

import Icon from '@/components/ui/AppIcon';

const inputCls =
  'w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

// ── Personal info ───────────────────────────────────────────────────────────
export function PersonalInfoEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const set = (k: string, v: any) => onChange({ ...c, [k]: v });
  const links: Array<{ label: string; url: string }> = Array.isArray(c.links) ? c.links : [];
  const setLink = (i: number, k: 'label' | 'url', v: string) => {
    const next = links.map((l, idx) => (idx === i ? { ...l, [k]: v } : l));
    set('links', next);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label className={labelCls}>Full name</label><input className={inputCls} value={c.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" /></div>
      <div><label className={labelCls}>Headline</label><input className={inputCls} value={c.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Staff Software Engineer" /></div>
      <div><label className={labelCls}>Email</label><input className={inputCls} value={c.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" /></div>
      <div><label className={labelCls}>Phone</label><input className={inputCls} value={c.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+1 555 000 0000" /></div>
      <div><label className={labelCls}>Location</label><input className={inputCls} value={c.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="San Francisco, CA" /></div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Links</label>
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={l.label || ''} onChange={(e) => setLink(i, 'label', e.target.value)} placeholder="GitHub" />
              <input className={inputCls} value={l.url || ''} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://github.com/jane" />
              <button className="p-2 text-muted-foreground hover:text-error" onClick={() => set('links', links.filter((_, idx) => idx !== i))} title="Remove">
                <Icon name="XMarkIcon" size={16} />
              </button>
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

// ── Free text (summary / notes) ─────────────────────────────────────────────
export function NoteEditor({ content, onChange, placeholder, label }: { content: any; onChange: (c: any) => void; placeholder?: string; label?: string }) {
  const c = content || {};
  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}
      <textarea
        className={`${inputCls} min-h-[90px] resize-y`}
        value={c.text || ''}
        onChange={(e) => onChange({ ...c, text: e.target.value })}
        placeholder={placeholder || 'Write here…'}
      />
    </div>
  );
}

// ── Items list (experience / education / projects / …) ──────────────────────
type Item = { title?: string; subtitle?: string; date?: string; bullets?: string[] };

export function ItemsEditor({ content, onChange, titlePlaceholder, subtitlePlaceholder }: { content: any; onChange: (c: any) => void; titlePlaceholder?: string; subtitlePlaceholder?: string }) {
  const c = content || {};
  const items: Item[] = Array.isArray(c.items) ? c.items : [];
  const setItem = (i: number, patch: Partial<Item>) => onChange({ ...c, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const removeItem = (i: number) => onChange({ ...c, items: items.filter((_, idx) => idx !== i) });
  const addItem = () => onChange({ ...c, items: [...items, { title: '', subtitle: '', date: '', bullets: [] }] });

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-background/50">
          <div className="flex gap-2">
            <input className={inputCls} value={it.title || ''} onChange={(e) => setItem(i, { title: e.target.value })} placeholder={titlePlaceholder || 'Title / Role'} />
            <input className={`${inputCls} max-w-[140px]`} value={it.date || ''} onChange={(e) => setItem(i, { date: e.target.value })} placeholder="2021–2024" />
            <button className="p-2 text-muted-foreground hover:text-error" onClick={() => removeItem(i)} title="Remove"><Icon name="TrashIcon" size={16} /></button>
          </div>
          <input className={inputCls} value={it.subtitle || ''} onChange={(e) => setItem(i, { subtitle: e.target.value })} placeholder={subtitlePlaceholder || 'Company / Organization'} />
          <textarea
            className={`${inputCls} min-h-[70px] resize-y`}
            value={(it.bullets || []).join('\n')}
            onChange={(e) => setItem(i, { bullets: e.target.value.split('\n') })}
            placeholder={'One bullet per line\n- Led migration reducing latency 40%'}
          />
        </div>
      ))}
      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={addItem}>
        <Icon name="PlusIcon" size={14} /> Add entry
      </button>
    </div>
  );
}

// ── Skills groups ────────────────────────────────────────────────────────────
type Group = { name?: string; items?: string[] };

export function SkillsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const groups: Group[] = Array.isArray(c.groups) ? c.groups : [];
  const setGroup = (i: number, patch: Partial<Group>) => onChange({ ...c, groups: groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) });
  const removeGroup = (i: number) => onChange({ ...c, groups: groups.filter((_, idx) => idx !== i) });
  const addGroup = () => onChange({ ...c, groups: [...groups, { name: '', items: [] }] });

  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={i} className="flex gap-2 items-start">
          <input className={`${inputCls} max-w-[180px]`} value={g.name || ''} onChange={(e) => setGroup(i, { name: e.target.value })} placeholder="Category (Languages)" />
          <input className={inputCls} value={(g.items || []).join(', ')} onChange={(e) => setGroup(i, { items: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Python, Go, TypeScript" />
          <button className="p-2 text-muted-foreground hover:text-error" onClick={() => removeGroup(i)} title="Remove"><Icon name="TrashIcon" size={16} /></button>
        </div>
      ))}
      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={addGroup}>
        <Icon name="PlusIcon" size={14} /> Add skill group
      </button>
    </div>
  );
}
