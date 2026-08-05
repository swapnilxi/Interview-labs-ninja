'use client';

/**
 * Populate a Master Profile from one of three sources:
 *   • Resume/Profile — copy sections from another master the user owns
 *   • JSON           — paste a structured section array
 *   • Text (AI)      — paste/type plain text; the LLM structures it
 *
 * Two modes:
 *   • profileId set  → import INTO that profile (replace or append)
 *   • profileId unset → create a NEW profile from the source
 *
 * Flow is always input → preview (pick which sections) → apply. The preview
 * resolves everything to concrete sections, so "apply" sends them back as JSON
 * (no second AI call).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { SECTION_LABELS, type ImportedSection, type ProfileImportSource, type Resume } from './types';

type Source = 'resume' | 'json' | 'text';
type Step = 'input' | 'preview';

function summarize(s: ImportedSection): string {
  const c = s.content || {};
  if (typeof c.text === 'string') return c.text.slice(0, 90);
  if (Array.isArray(c.items)) return `${c.items.length} item${c.items.length === 1 ? '' : 's'}`;
  if (Array.isArray(c.groups)) return `${c.groups.length} group${c.groups.length === 1 ? '' : 's'}`;
  if (c.name || c.email) return [c.name, c.email].filter(Boolean).join(' · ');
  return '';
}

export default function ProfileImportDialog({
  open,
  onClose,
  profileId,
  onImported,
  initialSource,
}: {
  open: boolean;
  onClose: () => void;
  profileId?: string;
  onImported: (result?: Resume) => void;
  initialSource?: Source;
}) {
  const isEdit = !!profileId;
  const [source, setSource] = useState<Source>(initialSource ?? (isEdit ? 'text' : 'resume'));
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // source inputs
  const [masters, setMasters] = useState<Resume[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [rawText, setRawText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // apply options
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [newTitle, setNewTitle] = useState('Imported Profile');

  // preview
  const [preview, setPreview] = useState<ImportedSection[]>([]);
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [mappingNotes, setMappingNotes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    // Reset each open.
    setSource(initialSource ?? (isEdit ? 'text' : 'resume'));
    setStep('input');
    setError(null);
    setJsonText('');
    setRawText('');
    setUploadedFiles([]);
    setSourceId('');
    setMode('replace');
    setNewTitle('Imported Profile');
    setPreview([]);
    setMappingNotes([]);
    // Load possible sources (other profiles + legacy resumes), excluding self.
    Promise.all([careerService.listProfiles(), careerService.listResumes()])
      .then(([profiles, resumes]) => {
        const combined = [...profiles, ...resumes].filter((m) => m.id !== profileId);
        setMasters(combined);
        if (combined[0]) setSourceId(combined[0].id);
      })
      .catch(() => setMasters([]));
  }, [open, isEdit, profileId]);

  const onUploadFiles = async (files: FileList) => {
    setError(null);
    setLoading(true);
    try {
      const list = Array.from(files);
      const extracted = await Promise.all(list.map((f) => careerService.importExtract(f).then((r) => ({ name: f.name, text: r.text }))));
      // Multiple files (a resume + certificates + a transcript, say) are
      // joined into one blob, each clearly labeled by filename, then
      // structured into sections in a single AI pass.
      const combined = extracted.map((e) => `--- ${e.name} ---\n${e.text}`).join('\n\n');
      setRawText((prev) => (prev ? `${prev}\n\n${combined}` : combined));
      setUploadedFiles((prev) => [...prev, ...list.map((f) => f.name)]);
    } catch (e: any) {
      setError(e?.message || 'Could not read one of those files — try pasting the text instead.');
    } finally {
      setLoading(false);
    }
  };

  const buildSource = (): ProfileImportSource | null => {
    if (source === 'resume') {
      if (!sourceId) { setError('Pick a resume or profile to copy from.'); return null; }
      return { source: 'resume', resume_id: sourceId };
    }
    if (source === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        setError('That isn’t valid JSON. Paste an array of section objects.');
        return null;
      }
      if (!Array.isArray(parsed)) { setError('JSON must be an array of section objects.'); return null; }
      return { source: 'json', sections: parsed as ImportedSection[] };
    }
    const text = rawText.trim();
    if (!text) { setError('Paste or type some text to structure.'); return null; }
    return { source: 'text', raw_text: text };
  };

  const runPreview = async () => {
    setError(null);
    const src = buildSource();
    if (!src) return;
    setLoading(true);
    try {
      const { sections, mapping_notes } = await careerService.previewProfileImport(src);
      if (!sections.length) { setError('No sections could be extracted from that source.'); return; }
      setPreview(sections);
      setMappingNotes(mapping_notes || []);
      setInclude(Object.fromEntries(sections.map((_, i) => [i, true])));
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'Could not read that source.');
    } finally {
      setLoading(false);
    }
  };

  const chosen = useMemo(() => preview.filter((_, i) => include[i]), [preview, include]);

  const apply = async () => {
    setError(null);
    if (!chosen.length) { setError('Select at least one section.'); return; }
    setLoading(true);
    try {
      const src: ProfileImportSource = { source: 'json', sections: chosen };
      if (isEdit) {
        const updated = await careerService.importIntoProfile(profileId!, src, mode);
        onImported(updated);
      } else {
        const created = await careerService.createProfileFromImport(src, newTitle.trim() || 'Imported Profile');
        onImported(created);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const SOURCE_TABS: Array<{ id: Source; label: string; icon: string }> = [
    { id: 'resume', label: 'From resume', icon: 'DocumentDuplicateIcon' },
    { id: 'json', label: 'Paste JSON', icon: 'CodeBracketIcon' },
    { id: 'text', label: 'Type / paste text', icon: 'SparklesIcon' },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !loading && onClose()}>
      <div className="w-full max-w-[640px] max-h-[88vh] flex flex-col bg-card border border-border rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="ArrowDownTrayIcon" size={18} className="text-primary shrink-0" />
            <h2 className="font-heading text-base font-semibold text-foreground truncate">
              {isEdit ? 'Import into this profile' : 'New profile from import'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-clean p-5">
          {error && (
            <div className="mb-3 p-2.5 rounded-lg border bg-error/12 border-error/40 text-error flex items-center gap-2 text-xs">
              <Icon name="ExclamationTriangleIcon" size={15} variant="solid" className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'input' ? (
            <>
              {/* Source tabs */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-muted mb-4">
                {SOURCE_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSource(t.id); setError(null); }}
                    className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-smooth ${source === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon name={t.icon} size={14} /> <span className="hidden sm:inline">{t.label}</span>
                  </button>
                ))}
              </div>

              {source === 'resume' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">Copy sections from</label>
                  {masters.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No other resumes or profiles to copy from yet.</p>
                  ) : (
                    <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring">
                      {masters.map((m) => (
                        <option key={m.id} value={m.id}>{m.title}{m.is_profile ? ' (profile)' : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {source === 'json' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Section JSON — an array of <code className="text-[11px]">{'{ section_type, title, content }'}</code> objects
                  </label>
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    placeholder={'[\n  { "section_type": "summary", "content": { "text": "…" } },\n  { "section_type": "skills", "content": { "groups": [] } }\n]'}
                    className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-xs font-mono text-foreground focus-ring resize-y"
                  />
                </div>
              )}

              {source === 'text' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">Paste text, or upload one or more documents (resume, certificates, offer/experience letters, transcript…) — AI turns it into sections.</label>
                  <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { if (e.target.files?.length) void onUploadFiles(e.target.files); e.target.value = ''; }} />
                    <button onClick={() => fileRef.current?.click()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                      <Icon name="ArrowUpTrayIcon" size={14} /> Upload file(s)
                    </button>
                    <span className="text-xs text-muted-foreground">or paste below</span>
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {uploadedFiles.map((name, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"><Icon name="DocumentIcon" size={11} /> {name}</span>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={10}
                    placeholder="e.g. I'm a senior ML engineer with 6 years' experience. Led the recommendations team at Acme, shipped a ranking model that lifted CTR 12%. Skills: Python, PyTorch, SQL…"
                    className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">
                  {chosen.length} of {preview.length} section{preview.length === 1 ? '' : 's'} selected
                </p>
                <button onClick={() => setStep('input')} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <Icon name="ArrowLeftIcon" size={12} /> Back
                </button>
              </div>
              {mappingNotes.length > 0 && (
                <div className="mb-3 p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-xs text-foreground space-y-1">
                  <p className="font-medium text-warning inline-flex items-center gap-1.5"><Icon name="InformationCircleIcon" size={13} /> A few things were adjusted while reading this:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {mappingNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              <div className="space-y-1.5">
                {preview.map((s, i) => (
                  <label key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-smooth ${include[i] ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                    <input type="checkbox" checked={!!include[i]} onChange={(e) => setInclude((prev) => ({ ...prev, [i]: e.target.checked }))} className="mt-0.5 accent-[var(--color-primary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{s.title}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{SECTION_LABELS[s.section_type] || s.section_type}</span>
                      </div>
                      {summarize(s) && <p className="text-xs text-muted-foreground truncate mt-0.5">{summarize(s)}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          {step === 'preview' ? (
            isEdit ? (
              <div className="inline-flex items-center bg-muted rounded-lg p-0.5 text-xs">
                <button onClick={() => setMode('replace')} className={`px-3 py-1.5 rounded-md font-medium ${mode === 'replace' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Replace all</button>
                <button onClick={() => setMode('append')} className={`px-3 py-1.5 rounded-md font-medium ${mode === 'append' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Append</button>
              </div>
            ) : (
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New profile name" className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring max-w-[220px]" />
            )
          ) : (
            <span className="text-xs text-muted-foreground">
              {isEdit ? 'You’ll choose replace or append next.' : 'Preview the sections, then create.'}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} disabled={loading} className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
            {step === 'input' ? (
              <button onClick={runPreview} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {loading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
                {source === 'text' ? 'Structure with AI' : 'Preview'}
              </button>
            ) : (
              <button onClick={apply} disabled={loading || !chosen.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {loading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
                {isEdit ? (mode === 'replace' ? 'Replace sections' : 'Append sections') : 'Create profile'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
