'use client';

/**
 * Cover Letter Generator — generate a letter from a profile + a job target,
 * then edit it in a lightweight autosaving text editor with version history
 * and exports. Deliberately doesn't reuse the resume Section editor/versions
 * machinery — a letter is one text blob, not a section tree.
 */

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { coverLetterService } from '@/lib/services/coverLetterService';
import { downloadBlob } from '../shared/exportUtils';
import { getActiveProfile } from '../shared/activeProfileStore';
import ErrorBanner from '../shared/ErrorBanner';
import ProfileSelector from '../profile/ProfileSelector';
import type { CoverLetter, CoverLetterTone, CoverLetterVersion, Resume } from '../shared/types';

type JobSource = 'link' | 'description' | 'json';
const DEBOUNCE_MS = 1500;

const TONES: { id: CoverLetterTone; label: string; desc: string }[] = [
  { id: 'professional', label: 'Professional', desc: 'Warm but measured, confident' },
  { id: 'enthusiastic', label: 'Enthusiastic', desc: 'Energetic, shows real excitement' },
  { id: 'concise', label: 'Concise', desc: 'Short, no filler, well under a page' },
];

function fmt(v?: string) {
  if (!v) return '';
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CoverLetterPanel({ profiles, loaded, onGoToProfiles, onProfilesChanged, showToast }: { profiles: Resume[]; loaded: boolean; onGoToProfiles: () => void; onProfilesChanged: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [lettersLoaded, setLettersLoaded] = useState(false);
  const [active, setActive] = useState<CoverLetter | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [rename, setRename] = useState<{ id: string; value: string } | null>(null);

  const loadLetters = async () => {
    try {
      setLetters(await coverLetterService.list());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load cover letters', 'error');
    } finally {
      setLettersLoaded(true);
    }
  };

  useEffect(() => { void loadLetters(); }, []);

  const remove = async (id: string) => {
    if (!window.confirm('Delete this cover letter? This cannot be undone.')) return;
    try {
      await coverLetterService.remove(id);
      if (active?.id === id) setActive(null);
      void loadLetters();
      showToast('Cover letter deleted');
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };

  const commitRename = async () => {
    if (!rename) return;
    const { id, value: title } = rename;
    setRename(null);
    if (!title.trim()) return;
    try {
      const updated = await coverLetterService.update(id, { title: title.trim() });
      setLetters((ls) => ls.map((x) => (x.id === id ? updated : x)));
    } catch (e: any) {
      showToast(e?.message || 'Rename failed', 'error');
    }
  };

  if (active) {
    return (
      <CoverLetterEditor
        letter={active}
        onBack={() => { setActive(null); void loadLetters(); }}
        showToast={showToast}
      />
    );
  }

  if (showGenerate) {
    return (
      <GenerateCoverLetterForm
        profiles={profiles}
        loaded={loaded}
        onGoToProfiles={onGoToProfiles}
        onProfilesChanged={onProfilesChanged}
        onCancel={() => setShowGenerate(false)}
        onGenerated={(letter) => { setShowGenerate(false); setActive(letter); }}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="max-w-[820px]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Cover letters</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Generate a letter from a profile + a job target, then edit and export it.</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth shrink-0">
          <Icon name="PlusIcon" size={16} /> New cover letter
        </button>
      </div>

      {!lettersLoaded ? (
        <div className="lab-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : letters.length === 0 ? (
        <div className="lab-card p-12 text-center">
          <div className="cs-empty-badge"><Icon name="EnvelopeIcon" size={28} className="text-primary" /></div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">No cover letters yet — generate one from a profile and a job posting.</p>
          <button onClick={() => setShowGenerate(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="PlusIcon" size={16} /> New cover letter</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {letters.map((l) => (
            <div key={l.id} className="lab-card p-4 flex items-center justify-between gap-3 hover:border-primary/30 transition-smooth">
              {rename?.id === l.id ? (
                <input
                  autoFocus
                  value={rename.value}
                  onChange={(e) => setRename({ id: l.id, value: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRename(null); }}
                  className="flex-1 min-w-0 text-sm font-semibold text-foreground bg-card border border-primary/40 rounded px-1.5 py-1 focus:outline-none"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setActive(l)} className="text-left min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{l.title}</p>
                    </button>
                    <button onClick={() => setRename({ id: l.id, value: l.title })} className="shrink-0 p-1 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/5" title="Rename">
                      <Icon name="PencilIcon" size={13} />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{TONES.find((t) => t.id === l.tone)?.label || l.tone} · Updated {fmt(l.updated_at)}</p>
                </div>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => remove(l.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/10 transition-smooth" title="Delete">
                  <Icon name="TrashIcon" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateCoverLetterForm({ profiles, loaded, onGoToProfiles, onProfilesChanged, onCancel, onGenerated, showToast }: {
  profiles: Resume[]; loaded: boolean; onGoToProfiles: () => void; onProfilesChanged: () => void; onCancel: () => void; onGenerated: (letter: CoverLetter) => void; showToast: (m: string, t?: 'success' | 'error') => void;
}) {
  const [profileId, setProfileId] = useState('');
  const [source, setSource] = useState<JobSource>('description');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [jobJson, setJobJson] = useState('');
  const [tone, setTone] = useState<CoverLetterTone>('professional');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saveJob, setSaveJob] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profiles.length || profileId) return;
    const activeRef = getActiveProfile();
    const stillExists = activeRef && profiles.some((p) => p.id === activeRef.id);
    setProfileId(stillExists ? activeRef!.id : profiles[0].id);
  }, [profiles, profileId]);

  const SOURCES: { id: JobSource; label: string; icon: string }[] = [
    { id: 'link', label: 'Job link', icon: 'LinkIcon' },
    { id: 'description', label: 'Description', icon: 'DocumentTextIcon' },
    { id: 'json', label: 'JSON', icon: 'CodeBracketIcon' },
  ];

  const generate = async () => {
    setError(null);
    if (!profileId) { setError('Choose a source profile.'); return; }
    const args: Parameters<typeof coverLetterService.generate>[0] = {
      profileId,
      jobSource: source === 'link' ? 'url' : source === 'json' ? 'json' : 'text',
      tone,
      notes: notes.trim() || undefined,
      saveJob,
      jobTitle: jobTitle.trim() || undefined,
      company: company.trim() || undefined,
    };
    if (source === 'link') {
      if (!jobUrl.trim()) { setError('Paste the job posting link.'); return; }
      args.jobUrl = jobUrl.trim();
    } else if (source === 'json') {
      if (!jobJson.trim()) { setError('Paste the job JSON.'); return; }
      try { args.jobJson = JSON.parse(jobJson); }
      catch { setError('That isn’t valid JSON.'); return; }
    } else {
      if (!jobText.trim()) { setError('Paste the job description.'); return; }
      args.jobText = jobText.trim();
    }
    setLoading(true);
    try {
      const res = await coverLetterService.generate(args);
      showToast('Cover letter generated');
      onGenerated(res.letter);
    } catch (e: any) {
      setError(e?.message || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  if (loaded && profiles.length === 0) {
    return (
      <div className="lab-card p-12 text-center max-w-[820px]">
        <div className="cs-empty-badge"><Icon name="EnvelopeIcon" size={28} className="text-primary" /></div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">To generate a cover letter, first create a data profile with your real experience.</p>
        <button onClick={onGoToProfiles} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="IdentificationIcon" size={16} /> Go to Profiles</button>
      </div>
    );
  }

  return (
    <div className="max-w-[820px]">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onCancel} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"><Icon name="ArrowLeftIcon" size={16} /></button>
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">New cover letter</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pick a profile, drop in a job, and pick a tone.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="lab-card p-6 flex flex-col gap-5">
        <ProfileSelector value={profileId} profiles={profiles} onChange={setProfileId} onProfilesChanged={onProfilesChanged} showToast={showToast} />

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job target</label>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-muted mb-2">
            {SOURCES.map((s) => (
              <button key={s.id} onClick={() => { setSource(s.id); setError(null); }} className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-smooth ${source === s.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon name={s.icon} size={14} /> <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
          {source === 'link' && (
            <input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://company.com/careers/senior-engineer" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
          )}
          {source === 'description' && (
            <textarea value={jobText} onChange={(e) => setJobText(e.target.value)} rows={8} placeholder="Paste the full job posting here…" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y" />
          )}
          {source === 'json' && (
            <textarea value={jobJson} onChange={(e) => setJobJson(e.target.value)} rows={8} spellCheck={false} placeholder={'{\n  "title": "Senior ML Engineer"\n}'} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-xs font-mono text-foreground focus-ring resize-y" />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Tone</label>
          <div className="grid sm:grid-cols-3 gap-2">
            {TONES.map((t) => (
              <button key={t.id} onClick={() => setTone(t.id)} className={`text-left p-3 rounded-lg border transition-smooth ${tone === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role title <span className="font-normal">(optional)</span></label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior ML Engineer" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Company <span className="font-normal">(optional)</span></label>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Extra instructions <span className="font-normal">(optional)</span></label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. emphasize leadership; mention my open-source work" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={saveJob} onChange={(e) => setSaveJob(e.target.checked)} className="accent-[var(--color-primary)]" />
          Save this job so I can reuse it later
        </label>

        <div className="flex items-center justify-end pt-2 border-t border-border">
          <button onClick={generate} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-105 disabled:opacity-50 transition-smooth bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="SparklesIcon" size={16} />}
            {loading ? 'Generating…' : 'Generate letter'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverLetterEditor({ letter, onBack, showToast }: { letter: CoverLetter; onBack: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [title, setTitle] = useState(letter.title);
  const [tone, setTone] = useState<CoverLetterTone>(letter.tone);
  const [content, setContent] = useState(letter.content_text);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [versions, setVersions] = useState<CoverLetterVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = (fields: Partial<{ title: string; tone: CoverLetterTone; content_text: string }>) => {
    setSaveStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await coverLetterService.update(letter.id, fields);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const loadVersions = async () => {
    try {
      setVersions(await coverLetterService.listVersions(letter.id));
    } catch (e: any) {
      showToast(e?.message || 'Failed to load versions', 'error');
    }
  };

  const snapshot = async () => {
    try {
      await coverLetterService.snapshotVersion(letter.id);
      showToast('Version saved');
      if (showVersions) void loadVersions();
    } catch (e: any) {
      showToast(e?.message || 'Snapshot failed', 'error');
    }
  };

  const restore = async (versionId: string) => {
    if (!window.confirm('Restore this version? Your current unsaved edits will be replaced.')) return;
    try {
      const restored = await coverLetterService.restoreVersion(letter.id, versionId);
      setContent(restored.content_text);
      showToast('Version restored');
    } catch (e: any) {
      showToast(e?.message || 'Restore failed', 'error');
    }
  };

  const exportAs = async (format: 'html' | 'pdf' | 'markdown' | 'docx') => {
    setExporting(format);
    try {
      const blob = await coverLetterService.exportBlob(letter.id, format);
      const ext = format === 'markdown' ? 'md' : format;
      downloadBlob(blob, `${(title || 'cover-letter').toLowerCase().replace(/\s+/g, '-')}.${ext}`);
    } catch (e: any) {
      showToast(e?.message || 'Export failed', 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="max-w-[820px]">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"><Icon name="ArrowLeftIcon" size={16} /></button>
        <div className="flex-1">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); scheduleSave({ title: e.target.value }); }}
            className="font-heading text-lg font-semibold text-foreground bg-transparent border-none focus-ring rounded px-1 -mx-1 w-full"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'error' && <span className="text-error">Save failed</span>}
          </p>
        </div>
        <button onClick={() => { setShowVersions((v) => !v); if (!showVersions) void loadVersions(); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-smooth shrink-0">
          <Icon name="ClockIcon" size={14} /> Versions
        </button>
        <button onClick={snapshot} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-smooth shrink-0">
          <Icon name="BookmarkIcon" size={14} /> Save version
        </button>
      </div>

      {showVersions && (
        <div className="lab-card p-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Version history</p>
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No saved versions yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-foreground">{v.label || 'Snapshot'} · <span className="text-muted-foreground">{fmt(v.created_at)}</span></span>
                  <button onClick={() => restore(v.id)} className="text-primary hover:underline shrink-0">Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="lab-card p-6 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Tone</label>
          <div className="grid sm:grid-cols-3 gap-2">
            {TONES.map((t) => (
              <button key={t.id} onClick={() => { setTone(t.id); scheduleSave({ tone: t.id }); }} className={`text-left p-2.5 rounded-lg border transition-smooth ${tone === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                <p className="text-sm font-medium text-foreground">{t.label}</p>
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); scheduleSave({ content_text: e.target.value }); }}
          rows={20}
          className="w-full rounded-lg border border-border bg-input px-4 py-3.5 text-sm text-foreground focus-ring resize-y leading-relaxed"
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          {(['html', 'pdf', 'markdown', 'docx'] as const).map((fmtId) => (
            <button key={fmtId} onClick={() => exportAs(fmtId)} disabled={exporting === fmtId} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-50">
              <Icon name="ArrowDownTrayIcon" size={13} /> {fmtId.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
