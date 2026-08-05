'use client';

/**
 * Template Designer — a full-screen editor with visual knobs on the left and a
 * live <iframe> preview on the right (rendered client-side to mirror the export).
 * Works for both resume and portfolio templates; the knob set switches on kind.
 * Saving creates or updates a career_templates row via templatesService.
 */

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { templatesService } from '@/lib/services/templatesService';
import {
  ACCENTS,
  DEFAULT_PORTFOLIO_SPEC,
  DEFAULT_RESUME_SPEC,
  PORTFOLIO_STYLE_TEMPLATES,
  type CareerTemplate,
  type PortfolioTemplateSpec,
  type ResumeTemplateSpec,
  type ViewKind,
} from './types';
import { portfolioPreviewHtml, resumePreviewHtml } from './templatePreview';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border capitalize transition-smooth ${value === o.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AccentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {ACCENTS.map((a) => (
        <button key={a.id} onClick={() => onChange(a.id)} title={a.label} className={`w-6 h-6 rounded-full ${a.dot} ${value === a.id ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40' : ''}`} />
      ))}
    </div>
  );
}

const FONT_OPTS = [{ id: 'sans', label: 'Sans' }, { id: 'serif', label: 'Serif' }, { id: 'mono', label: 'Mono' }] as const;

export default function TemplateDesigner({ kind, template, onClose, onSaved }: {
  kind: ViewKind;
  template?: CareerTemplate | null;
  onClose: () => void;
  onSaved: (t: CareerTemplate) => void;
}) {
  const isResume = kind === 'resume';
  const [name, setName] = useState(template?.name || (isResume ? 'My Resume Template' : 'My Portfolio Template'));
  const [spec, setSpec] = useState<any>(() =>
    template?.spec
      ? { ...(isResume ? DEFAULT_RESUME_SPEC : DEFAULT_PORTFOLIO_SPEC), ...template.spec, ...(isResume ? { heading: { ...DEFAULT_RESUME_SPEC.heading, ...(template.spec.heading || {}) } } : {}) }
      : isResume ? { ...DEFAULT_RESUME_SPEC, heading: { ...DEFAULT_RESUME_SPEC.heading } } : { ...DEFAULT_PORTFOLIO_SPEC },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Record<string, any>) => setSpec((s: any) => ({ ...s, ...patch }));
  const setHeading = (patch: Record<string, any>) => setSpec((s: any) => ({ ...s, heading: { ...s.heading, ...patch } }));

  const previewSrc = useMemo(
    () => (isResume ? resumePreviewHtml(spec as ResumeTemplateSpec) : portfolioPreviewHtml(spec as PortfolioTemplateSpec)),
    [isResume, spec],
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = template
        ? await templatesService.update(template.id, { name: name.trim() || 'Untitled', spec })
        : await templatesService.create({ kind, name: name.trim() || 'Untitled', spec });
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message || 'Could not save template');
      setSaving(false);
    }
  };

  const r = spec as ResumeTemplateSpec;
  const p = spec as PortfolioTemplateSpec;

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col">
      {/* Toolbar */}
      <div className="h-[56px] flex items-center gap-2 px-4 border-b border-border bg-card flex-shrink-0">
        <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" title="Close"><Icon name="XMarkIcon" size={18} /></button>
        <Icon name="SwatchIcon" size={18} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">{template ? 'Edit template' : 'New template'}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded ml-1">{kind}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="ml-2 min-w-0 flex-1 max-w-[280px] bg-transparent text-sm font-medium text-foreground focus:outline-none focus:bg-muted/50 rounded px-2 py-1 border border-transparent focus:border-border"
        />
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-error">{error}</span>}
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="CheckIcon" size={14} /> {saving ? 'Saving…' : 'Save template'}</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Knobs */}
        <div className="w-[340px] max-w-[85vw] flex-shrink-0 border-r border-border overflow-y-auto scrollbar-clean p-4 space-y-5 bg-card">
          <Field label="Accent"><AccentPicker value={spec.accent} onChange={(v) => set({ accent: v })} /></Field>

          {isResume ? (
            <>
              <Field label="Body font"><Segmented value={r.font} options={FONT_OPTS as any} onChange={(v) => set({ font: v })} /></Field>
              <Field label="Name font"><Segmented value={(r.nameFont || r.font) as any} options={FONT_OPTS as any} onChange={(v) => set({ nameFont: v })} /></Field>
              <Field label="Density"><Segmented value={r.density} options={[{ id: 'compact', label: 'Compact' }, { id: 'normal', label: 'Normal' }, { id: 'relaxed', label: 'Relaxed' }]} onChange={(v) => set({ density: v })} /></Field>
              <Field label="Header style"><Segmented value={r.headerStyle} options={[{ id: 'plain', label: 'Plain' }, { id: 'rule', label: 'Rule' }, { id: 'band', label: 'Band' }, { id: 'sidebar', label: 'Sidebar' }]} onChange={(v) => set({ headerStyle: v })} /></Field>
              <Field label="Header align"><Segmented value={r.headerAlign} options={[{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }]} onChange={(v) => set({ headerAlign: v })} /></Field>
              <Field label="Name color"><Segmented value={r.nameColor} options={[{ id: 'ink', label: 'Ink' }, { id: 'accent', label: 'Accent' }]} onChange={(v) => set({ nameColor: v })} /></Field>

              <div className="pt-1 border-t border-border" />
              <p className="text-xs font-semibold text-foreground">Section headings</p>
              <Field label="Heading color"><Segmented value={r.heading.color} options={[{ id: 'ink', label: 'Ink' }, { id: 'accent', label: 'Accent' }, { id: 'muted', label: 'Muted' }]} onChange={(v) => setHeading({ color: v })} /></Field>
              <Field label="Heading rule"><Segmented value={r.heading.rule} options={[{ id: 'none', label: 'None' }, { id: 'under', label: 'Underline' }, { id: 'leftbar', label: 'Left bar' }]} onChange={(v) => setHeading({ rule: v })} /></Field>
              <Field label="Heading align"><Segmented value={r.heading.align} options={[{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }]} onChange={(v) => setHeading({ align: v })} /></Field>
              <Field label="Heading font"><Segmented value={(r.heading.font || r.font) as any} options={FONT_OPTS as any} onChange={(v) => setHeading({ font: v })} /></Field>
              <Field label="Heading emphasis">
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setHeading({ uppercase: !r.heading.uppercase })} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${r.heading.uppercase ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>UPPERCASE</button>
                  <button onClick={() => setHeading({ spacing: r.heading.spacing === 'wide' ? 'normal' : 'wide' })} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${r.heading.spacing === 'wide' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>Wide spacing</button>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Font"><Segmented value={p.font} options={[{ id: 'sans', label: 'Sans' }, { id: 'serif', label: 'Serif' }]} onChange={(v) => set({ font: v })} /></Field>
              <Field label="Layout"><Segmented value={p.layout} options={[{ id: 'stack', label: 'Stack' }, { id: 'centered', label: 'Centered' }, { id: 'card', label: 'Card' }]} onChange={(v) => set({ layout: v })} /></Field>
              <Field label="Background">
                <div className="grid grid-cols-2 gap-1.5">
                  {PORTFOLIO_STYLE_TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => set({ background: t.id })} title={t.desc} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition-smooth ${p.background === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{t.name}</button>
                  ))}
                </div>
              </Field>
            </>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 bg-muted/30 p-4 overflow-hidden">
          <iframe title="template preview" srcDoc={previewSrc} className="w-full h-full rounded-lg border border-border bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
