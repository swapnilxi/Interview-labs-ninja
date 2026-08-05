'use client';

/**
 * Profile Enrichment — merge ONE MORE document into an existing profile,
 * distinct from ProfileImportDialog's replace/append (which trusts the source
 * wholesale). This compares the new content against what's already in the
 * profile and classifies each piece as an addition, a duplicate (skipped), or
 * a conflict (needs a decision) before anything is written.
 *
 * Flow: pick a kind + provide the document (upload → extract, or paste) →
 * "Analyze" (AI classification, no mutation) → review additions/duplicates/
 * conflicts → "Merge" (snapshots the profile first, then commits only what
 * was accepted).
 */

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { SECTION_LABELS, type EnrichmentConflict, type EnrichmentKind, type EnrichmentPreview, type ProfileImportSource, type Resume } from './types';

type Step = 'input' | 'preview';
type Resolution = 'keep' | 'new' | 'suggested';

const KINDS: { id: EnrichmentKind; label: string; icon: string; upload: boolean }[] = [
  { id: 'resume', label: 'Additional resume', icon: 'DocumentDuplicateIcon', upload: false },
  { id: 'multiple', label: 'Multiple documents', icon: 'Square2StackIcon', upload: true },
  { id: 'certificates', label: 'Certificates', icon: 'CheckBadgeIcon', upload: true },
  { id: 'research_papers', label: 'Research papers', icon: 'BeakerIcon', upload: true },
  { id: 'project_documentation', label: 'Project docs', icon: 'RocketLaunchIcon', upload: true },
  { id: 'github_readme', label: 'GitHub README', icon: 'CodeBracketIcon', upload: true },
  { id: 'linkedin_export', label: 'LinkedIn export', icon: 'LinkIcon', upload: true },
  { id: 'experience_letter', label: 'Experience letter', icon: 'BriefcaseIcon', upload: true },
  { id: 'offer_letter', label: 'Offer letter', icon: 'EnvelopeOpenIcon', upload: true },
  { id: 'transcript', label: 'Academic transcript', icon: 'AcademicCapIcon', upload: true },
  { id: 'context', label: 'Plain text context', icon: 'SparklesIcon', upload: false },
];

function summarizeContent(c: any): string {
  if (!c) return '';
  if (typeof c.text === 'string') return c.text.slice(0, 100);
  if (Array.isArray(c.items)) return c.items.map((i: any) => i.title || i.name).filter(Boolean).join(', ').slice(0, 100);
  if (Array.isArray(c.groups)) return c.groups.flatMap((g: any) => g.items || []).join(', ').slice(0, 100);
  return '';
}

export default function ProfileEnrichDialog({
  open,
  onClose,
  profileId,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  onMerged: (profile: Resume) => void;
}) {
  const [kind, setKind] = useState<EnrichmentKind>('certificates');
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [masters, setMasters] = useState<Resume[]>([]);
  const [sourceId, setSourceId] = useState('');

  const [preview, setPreview] = useState<EnrichmentPreview | null>(null);
  const [includeAddition, setIncludeAddition] = useState<Record<number, boolean>>({});
  const [conflictChoice, setConflictChoice] = useState<Record<number, Resolution>>({});

  useEffect(() => {
    if (!open) return;
    setKind('certificates');
    setStep('input');
    setError(null);
    setRawText('');
    setUploadedFiles([]);
    setSourceId('');
    setPreview(null);
    careerService.listProfiles().then((ps) => {
      const others = ps.filter((p) => p.id !== profileId);
      setMasters(others);
      if (others[0]) setSourceId(others[0].id);
    }).catch(() => setMasters([]));
  }, [open, profileId]);

  const activeKind = KINDS.find((k) => k.id === kind)!;

  const onUploadFiles = async (files: FileList) => {
    setError(null);
    setLoading(true);
    try {
      const list = Array.from(files);
      const extracted = await Promise.all(list.map((f) => careerService.importExtract(f).then((r) => ({ name: f.name, text: r.text }))));
      // Multiple files are joined into one blob, each clearly labeled by
      // filename — the AI classifies the combined content in a single pass
      // (which also naturally de-dupes across the files, not just against
      // the existing profile).
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
    if (kind === 'resume') {
      if (!sourceId) { setError('Pick a resume or profile to pull from.'); return null; }
      return { source: 'resume', resume_id: sourceId };
    }
    const text = rawText.trim();
    if (!text) { setError('Upload a file or paste some text first.'); return null; }
    return { source: 'text', raw_text: text };
  };

  const analyze = async () => {
    setError(null);
    const src = buildSource();
    if (!src) return;
    setLoading(true);
    try {
      const result = await careerService.previewProfileEnrichment(profileId, kind, src);
      if (!result.additions.length && !result.duplicates.length && !result.conflicts.length) {
        setError("Nothing to merge — this content looks like it's already fully covered by the profile.");
        return;
      }
      setPreview(result);
      setIncludeAddition(Object.fromEntries(result.additions.map((_, i) => [i, true])));
      setConflictChoice(Object.fromEntries(result.conflicts.map((_, i) => [i, 'suggested' as Resolution])));
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'Could not analyze that content.');
    } finally {
      setLoading(false);
    }
  };

  const merge = async () => {
    if (!preview) return;
    setError(null);
    const additions = preview.additions
      .filter((_, i) => includeAddition[i])
      .map((a) => ({ section_type: a.section_type, title: a.title, content: a.content }));
    const conflictResolutions = preview.conflicts
      .map((c, i) => ({ c, choice: conflictChoice[i] }))
      .filter(({ choice }) => choice !== 'keep')
      .map(({ c, choice }) => ({
        existing_section_id: c.existing_section_id,
        content: choice === 'new' ? c.incoming_content : c.suggested_content,
      }));
    if (!additions.length && !conflictResolutions.length) { setError('Nothing selected to merge.'); return; }
    setLoading(true);
    try {
      const result = await careerService.applyProfileEnrichment(profileId, kind, additions, conflictResolutions);
      onMerged(result.profile);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Merge failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !loading && onClose()}>
      <div className="w-full max-w-[680px] max-h-[88vh] flex flex-col bg-card border border-border rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="SparklesIcon" size={18} className="text-primary shrink-0" />
            <h2 className="font-heading text-base font-semibold text-foreground truncate">Enrich this profile</h2>
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
              <p className="text-xs text-muted-foreground mb-3">Add one more document. We'll compare it against what's already in this profile — new facts get added, duplicates are skipped, and anything that contradicts existing content is flagged for you to resolve.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-4">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => { setKind(k.id); setError(null); setRawText(''); setUploadedFiles([]); }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-smooth ${kind === k.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                  >
                    <Icon name={k.icon} size={14} /> {k.label}
                  </button>
                ))}
              </div>

              {kind === 'resume' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted-foreground">Pull sections from</label>
                  {masters.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No other resumes or profiles yet.</p>
                  ) : (
                    <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring">
                      {masters.map((m) => (<option key={m.id} value={m.id}>{m.title}{m.is_profile ? ' (profile)' : ''}</option>))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {activeKind.upload && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { if (e.target.files?.length) void onUploadFiles(e.target.files); e.target.value = ''; }} />
                        <button onClick={() => fileRef.current?.click()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                          <Icon name="ArrowUpTrayIcon" size={14} /> {kind === 'multiple' ? 'Upload files…' : 'Upload file(s)'}
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
                    </div>
                  )}
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={9}
                    placeholder={activeKind.upload ? 'Paste text here, or upload one or more files above…' : "e.g. I also led our platform's migration to Kubernetes and mentored two junior engineers…"}
                    className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y"
                  />
                </div>
              )}
            </>
          ) : preview && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Review what changes before merging.</p>
                <button onClick={() => setStep('input')} className="text-xs text-primary hover:underline inline-flex items-center gap-1"><Icon name="ArrowLeftIcon" size={12} /> Back</button>
              </div>

              {preview.additions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-success mb-2 inline-flex items-center gap-1.5"><Icon name="PlusCircleIcon" size={13} /> New ({preview.additions.length})</p>
                  <div className="space-y-1.5">
                    {preview.additions.map((a, i) => (
                      <label key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-smooth ${includeAddition[i] ? 'border-success/40 bg-success/5' : 'border-border hover:bg-muted/50'}`}>
                        <input type="checkbox" checked={!!includeAddition[i]} onChange={(e) => setIncludeAddition((p) => ({ ...p, [i]: e.target.checked }))} className="mt-0.5 accent-[var(--color-primary)]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{a.title || SECTION_LABELS[a.section_type] || a.section_type}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{SECTION_LABELS[a.section_type] || a.section_type}</span>
                          </div>
                          {summarizeContent(a.content) && <p className="text-xs text-muted-foreground truncate mt-0.5">{summarizeContent(a.content)}</p>}
                          {a.rationale && <p className="text-[11px] text-muted-foreground italic mt-0.5">{a.rationale}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {preview.conflicts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning mb-2 inline-flex items-center gap-1.5"><Icon name="ExclamationTriangleIcon" size={13} /> Conflicts ({preview.conflicts.length})</p>
                  <div className="space-y-2">
                    {preview.conflicts.map((c: EnrichmentConflict, i) => (
                      <div key={i} className="rounded-lg border border-warning/30 p-3 space-y-2">
                        {c.rationale && <p className="text-xs text-muted-foreground italic">{c.rationale}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <div className="rounded-md bg-error/5 border border-error/20 p-2"><p className="text-[10px] uppercase tracking-wide text-error/80 mb-1">Currently says</p><p className="text-xs text-foreground">{c.existing_summary}</p></div>
                          <div className="rounded-md bg-success/5 border border-success/20 p-2"><p className="text-[10px] uppercase tracking-wide text-success/80 mb-1">New content says</p><p className="text-xs text-foreground">{c.incoming_summary}</p></div>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {(['keep', 'new', 'suggested'] as Resolution[]).map((r) => (
                            <button key={r} onClick={() => setConflictChoice((p) => ({ ...p, [i]: r }))} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-smooth ${conflictChoice[i] === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                              {r === 'keep' ? 'Keep existing' : r === 'new' ? 'Use new' : 'Use suggested merge'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.duplicates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5"><Icon name="DocumentDuplicateIcon" size={13} /> Already have this ({preview.duplicates.length}) — skipped</p>
                  <div className="space-y-1">
                    {preview.duplicates.map((d, i) => (
                      <div key={i} className="text-xs text-muted-foreground p-2 rounded-lg bg-muted/50">{d.incoming_summary}{d.reason ? ` — ${d.reason}` : ''}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
          {step === 'input' ? (
            <button onClick={analyze} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {loading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />} Analyze
            </button>
          ) : (
            <button onClick={merge} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {loading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />} Merge into profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
