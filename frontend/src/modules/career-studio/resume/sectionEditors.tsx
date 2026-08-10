'use client';

/**
 * Structured editors for each resume section shape. Each takes the section's
 * `content` object and an `onChange(nextContent)` callback; the store debounces
 * the actual autosave.
 */

import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '@/components/ui/AppIcon';

const inputCls =
  'w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

// ── Editable field label — click in and retype to rename what a field is called ──
function EditableLabel({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <input
      className="block text-xs font-medium text-muted-foreground mb-1 bg-transparent border-none p-0 w-full truncate hover:text-foreground focus:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={title || 'Click to rename this field'}
    />
  );
}

// ── Generic custom fields — a repeatable label/value list, reused everywhere ────
export type CustomField = { id: string; label: string; value: string };

export function CustomFieldsEditor({ fields, onChange, compact, addLabel }: { fields: CustomField[]; onChange: (next: CustomField[]) => void; compact?: boolean; addLabel?: string }) {
  const set = (i: number, patch: Partial<CustomField>) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, { id: newId(), label: '', value: '' }]);
  return (
    <div className="space-y-1.5">
      {fields.map((f, i) => (
        <div key={f.id} className="flex gap-2">
          <input className={`${inputCls} ${compact ? 'max-w-[120px] py-1.5 text-xs' : 'max-w-[160px]'}`} value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Field name" />
          <input className={`${inputCls} ${compact ? 'py-1.5 text-xs' : ''}`} value={f.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Value" />
          <button className="p-2 text-muted-foreground hover:text-error" onClick={() => remove(i)} title="Remove"><Icon name="XMarkIcon" size={16} /></button>
        </div>
      ))}
      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={add}>
        <Icon name="PlusIcon" size={14} /> {addLabel || 'Add custom field'}
      </button>
    </div>
  );
}

// ── Personal info ───────────────────────────────────────────────────────────
const DEFAULT_PERSONAL_LABELS: Record<string, string> = {
  name: 'Full name',
  title: 'Headline',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  links: 'Links',
};

/** A portfolio-style link. `icon`/`subtitle`/`featured`/`badge` are optional —
 * only the LinkX template's link-in-bio cards use them; every other template
 * (and the resume) keeps rendering just label/url and ignores the rest. */
export type PersonalLink = { label: string; url: string; icon?: string; subtitle?: string; featured?: boolean; badge?: string };

export function PersonalInfoEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const set = (k: string, v: any) => onChange({ ...c, [k]: v });
  const labels = { ...DEFAULT_PERSONAL_LABELS, ...(c.field_labels || {}) };
  const setLabel = (k: string, v: string) => onChange({ ...c, field_labels: { ...(c.field_labels || {}), [k]: v } });
  const links: PersonalLink[] = Array.isArray(c.links) ? c.links : [];
  const setLink = (i: number, patch: Partial<PersonalLink>) => {
    const next = links.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    set('links', next);
  };
  const customFields: CustomField[] = Array.isArray(c.custom_fields) ? c.custom_fields : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><EditableLabel value={labels.name} onChange={(v) => setLabel('name', v)} /><input className={inputCls} value={c.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Jane Doe" /></div>
        <div><EditableLabel value={labels.title} onChange={(v) => setLabel('title', v)} /><input className={inputCls} value={c.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Staff Software Engineer" /></div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Tagline <span className="font-normal">(short punchy line — portfolio hero only)</span></label>
          <input className={inputCls} value={c.tagline || ''} onChange={(e) => set('tagline', e.target.value)} placeholder="Building reliable, high-scale platforms." />
        </div>
        <div>
          <label className={labelCls}>Photo URL <span className="font-normal">(optional — falls back to initials)</span></label>
          <input className={inputCls} value={c.avatar_url || ''} onChange={(e) => set('avatar_url', e.target.value)} placeholder="https://…/avatar.jpg" />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="inline-flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="rounded border-border" checked={!!c.available} onChange={(e) => set('available', e.target.checked)} />
            Open to work / available for hire
          </label>
        </div>
        <div><EditableLabel value={labels.email} onChange={(v) => setLabel('email', v)} /><input className={inputCls} value={c.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" /></div>
        <div><EditableLabel value={labels.phone} onChange={(v) => setLabel('phone', v)} /><input className={inputCls} value={c.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+1 555 000 0000" /></div>
        <div><EditableLabel value={labels.location} onChange={(v) => setLabel('location', v)} /><input className={inputCls} value={c.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="San Francisco, CA" /></div>
        <div className="sm:col-span-2">
          <EditableLabel value={labels.links} onChange={(v) => setLabel('links', v)} />
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="rounded-lg border border-border p-2 space-y-1.5">
                <div className="flex gap-2">
                  <input className={`${inputCls} max-w-[64px] text-center`} value={l.icon || ''} onChange={(e) => setLink(i, { icon: e.target.value })} placeholder="🔗" title="Icon (emoji) — LinkX only" />
                  <input className={inputCls} value={l.label || ''} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="GitHub" />
                  <input className={inputCls} value={l.url || ''} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://github.com/jane" />
                  <button className="p-2 text-muted-foreground hover:text-error" onClick={() => set('links', links.filter((_, idx) => idx !== i))} title="Remove">
                    <Icon name="XMarkIcon" size={16} />
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input className={`${inputCls} text-xs py-1.5`} value={l.subtitle || ''} onChange={(e) => setLink(i, { subtitle: e.target.value })} placeholder="Subtitle (optional — LinkX only)" />
                  <input className={`${inputCls} text-xs py-1.5 max-w-[140px]`} value={l.badge || ''} onChange={(e) => setLink(i, { badge: e.target.value })} placeholder="Badge, e.g. New" />
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap pr-1">
                    <input type="checkbox" className="rounded border-border" checked={!!l.featured} onChange={(e) => setLink(i, { featured: e.target.checked })} />
                    Featured
                  </label>
                </div>
              </div>
            ))}
            <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={() => set('links', [...links, { label: '', url: '' }])}>
              <Icon name="PlusIcon" size={14} /> Add link
            </button>
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Custom fields</label>
        <CustomFieldsEditor fields={customFields} onChange={(next) => set('custom_fields', next)} />
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
type Item = { id?: string; title?: string; subtitle?: string; date?: string; bullets?: string[]; custom_fields?: CustomField[] };

const DEFAULT_ITEM_LABELS: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', date: 'Date', bullets: 'Highlights' };

function ItemCard({
  item, labels, titlePlaceholder, subtitlePlaceholder, collapsed, dragHandleProps, isDragging, onToggleCollapse, onPatch, onRemove, onLabelChange,
}: {
  item: Item;
  labels: Record<string, string>;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  collapsed: boolean;
  dragHandleProps?: any;
  isDragging?: boolean;
  onToggleCollapse: () => void;
  onPatch: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onLabelChange: (key: string, value: string) => void;
}) {
  const customFields: CustomField[] = Array.isArray(item.custom_fields) ? item.custom_fields : [];
  const summary = [item.title, item.subtitle].filter(Boolean).join(' — ') || 'Untitled entry';

  return (
    <div className={`rounded-lg border border-border bg-background/50 transition-smooth ${isDragging ? 'ring-2 ring-primary/50 shadow-lg' : ''}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/70">
        <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted touch-none" title="Drag to reorder" aria-label="Drag to reorder">
          <Icon name="Bars2Icon" size={14} />
        </button>
        <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
          {summary}{item.date ? ` · ${item.date}` : ''}
        </span>
        <button className="p-1 rounded text-muted-foreground hover:text-error hover:bg-error/10" onClick={onRemove} title="Remove"><Icon name="TrashIcon" size={14} /></button>
        <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          <Icon name="ChevronDownIcon" size={14} className={`transition-smooth ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </div>
      {!collapsed && (
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <EditableLabel value={labels.title} onChange={(v) => onLabelChange('title', v)} title="Renames this field for every entry in this section" />
              <input className={inputCls} value={item.title || ''} onChange={(e) => onPatch({ title: e.target.value })} placeholder={titlePlaceholder || 'Title / Role'} />
            </div>
            <div className="max-w-[140px]">
              <EditableLabel value={labels.date} onChange={(v) => onLabelChange('date', v)} title="Renames this field for every entry in this section" />
              <input className={inputCls} value={item.date || ''} onChange={(e) => onPatch({ date: e.target.value })} placeholder="2021–2024" />
            </div>
          </div>
          <div>
            <EditableLabel value={labels.subtitle} onChange={(v) => onLabelChange('subtitle', v)} title="Renames this field for every entry in this section" />
            <input className={inputCls} value={item.subtitle || ''} onChange={(e) => onPatch({ subtitle: e.target.value })} placeholder={subtitlePlaceholder || 'Company / Organization'} />
          </div>
          <div>
            <EditableLabel value={labels.bullets} onChange={(v) => onLabelChange('bullets', v)} title="Renames this field for every entry in this section" />
            <textarea
              className={`${inputCls} min-h-[70px] resize-y`}
              value={(item.bullets || []).join('\n')}
              onChange={(e) => onPatch({ bullets: e.target.value.split('\n') })}
              placeholder={'One bullet per line\n- Led migration reducing latency 40%'}
            />
          </div>
          <div>
            <label className={labelCls}>Custom fields</label>
            <CustomFieldsEditor fields={customFields} onChange={(next) => onPatch({ custom_fields: next })} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function SortableItemCard(props: { item: Item } & Omit<Parameters<typeof ItemCard>[0], 'item' | 'dragHandleProps' | 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard {...props} isDragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export function ItemsEditor({ content, onChange, titlePlaceholder, subtitlePlaceholder }: { content: any; onChange: (c: any) => void; titlePlaceholder?: string; subtitlePlaceholder?: string }) {
  const c = content || {};
  const items: Item[] = Array.isArray(c.items) ? c.items : [];
  const labels = { ...DEFAULT_ITEM_LABELS, ...(c.field_labels || {}) };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Entries created before this feature shipped have no stable id — backfill once so
  // drag-reorder and collapse state have something to key on.
  useEffect(() => {
    if (items.some((it) => !it.id)) {
      onChange({ ...c, items: items.map((it) => (it.id ? it : { ...it, id: newId() })) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const setItem = (i: number, patch: Partial<Item>) => onChange({ ...c, items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const removeItem = (i: number) => onChange({ ...c, items: items.filter((_, idx) => idx !== i) });
  const addItem = () => onChange({ ...c, items: [...items, { id: newId(), title: '', subtitle: '', date: '', bullets: [], custom_fields: [] }] });
  const setLabel = (k: string, v: string) => onChange({ ...c, field_labels: { ...(c.field_labels || {}), [k]: v } });
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((it) => it.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ ...c, items: arrayMove(items, oldIndex, newIndex) });
  };

  const sortableIds = items.filter((it) => it.id).map((it) => it.id as string);

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((it, i) => it.id ? (
              <SortableItemCard
                key={it.id}
                item={it}
                labels={labels}
                titlePlaceholder={titlePlaceholder}
                subtitlePlaceholder={subtitlePlaceholder}
                collapsed={collapsed.has(it.id)}
                onToggleCollapse={() => toggleCollapse(it.id as string)}
                onPatch={(patch) => setItem(i, patch)}
                onRemove={() => removeItem(i)}
                onLabelChange={setLabel}
              />
            ) : null)}
          </div>
        </SortableContext>
      </DndContext>
      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={addItem}>
        <Icon name="PlusIcon" size={14} /> Add entry
      </button>
    </div>
  );
}

// ── Skills groups ────────────────────────────────────────────────────────────
type Group = { name?: string; items?: string[] };

const DEFAULT_SKILLS_LABELS: Record<string, string> = { groupName: 'Category', groupItems: 'Skills' };

export function SkillsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const c = content || {};
  const groups: Group[] = Array.isArray(c.groups) ? c.groups : [];
  const labels = { ...DEFAULT_SKILLS_LABELS, ...(c.field_labels || {}) };
  const setLabel = (k: string, v: string) => onChange({ ...c, field_labels: { ...(c.field_labels || {}), [k]: v } });
  const setGroup = (i: number, patch: Partial<Group>) => onChange({ ...c, groups: groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) });
  const removeGroup = (i: number) => onChange({ ...c, groups: groups.filter((_, idx) => idx !== i) });
  const addGroup = () => onChange({ ...c, groups: [...groups, { name: '', items: [] }] });

  return (
    <div className="space-y-3">
      {groups.length > 0 && (
        <div className="flex gap-2">
          <div className="max-w-[180px] flex-shrink-0"><EditableLabel value={labels.groupName} onChange={(v) => setLabel('groupName', v)} /></div>
          <div className="flex-1"><EditableLabel value={labels.groupItems} onChange={(v) => setLabel('groupItems', v)} /></div>
          <div className="w-8" />
        </div>
      )}
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
