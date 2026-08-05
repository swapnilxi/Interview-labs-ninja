'use client';

/**
 * Tailor-to-a-job drawer for a resume *view*. A view holds no content of its
 * own — it renders live from a Master Profile — so tailoring writes back to
 * that profile. The proposal is previewed as a per-section before/after diff
 * the user cherry-picks, then applied either:
 *   • "new_profile" — clone the profile with the edits + a fresh view (originals
 *     untouched); we navigate to the new view.
 *   • "in_place" — rewrite the profile itself (auto-checkpointed first). This
 *     affects EVERY view built on that profile, so it's called out in the UI.
 *
 * Mirrors TailorPanel.tsx (the resume-master flow) but talks to viewsService.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { viewsService } from '@/lib/services/viewsService';
import type { JobDescription, TailorChange, TailorProposal } from './types';

export default function ViewTailorPanel({
  viewId,
  open,
  onClose,
  onAppliedInPlace,
}: {
  viewId: string;
  open: boolean;
  onClose: () => void;
  /** Called after an in-place apply so the caller can reload the view + preview. */
  onAppliedInPlace?: () => void | Promise<void>;
}) {
  const router = useRouter();

  const [jobs, setJobs] = useState<JobDescription[]>([]);
  const [tab, setTab] = useState<'new' | 'saved'>('new');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jd, setJd] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [saveJob, setSaveJob] = useState(true);
  const [notes, setNotes] = useState('');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<TailorProposal | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<'new_profile' | 'in_place' | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const j = await careerService.listJobs();
      setJobs(j);
      if (j.length && !selectedJobId) setSelectedJobId(j[0].id);
    } catch {
      /* ignore */
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (open) void loadJobs();
  }, [open, loadJobs]);

  const run = async () => {
    setError(null);
    if (tab === 'new' && !jd.trim()) return setError('Paste a job description first.');
    if (tab === 'saved' && !selectedJobId) return setError('Pick a saved job description.');
    setRunning(true);
    setProposal(null);
    try {
      const p =
        tab === 'saved'
          ? await viewsService.tailor(viewId, { jobDescriptionId: selectedJobId, notes: notes.trim() || undefined })
          : await viewsService.tailor(viewId, {
              jobDescription: jd.trim(),
              notes: notes.trim() || undefined,
              saveJob,
              jobTitle: jobTitle.trim() || undefined,
              company: company.trim() || undefined,
            });
      setProposal(p);
      setIncluded(new Set(p.changes.map((c) => c.section_id)));
      if (saveJob) void loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Tailoring failed');
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const apply = async (mode: 'new_profile' | 'in_place') => {
    if (!proposal) return;
    const updates = proposal.changes
      .filter((c) => included.has(c.section_id))
      .map((c) => ({ section_id: c.section_id, title: c.title, content: c.content }));
    if (!updates.length) return setError('Select at least one change to apply.');
    setApplying(mode);
    setError(null);
    try {
      const label = proposal.job?.company || proposal.job?.title || company.trim() || jobTitle.trim() || 'tailored';
      const res = await viewsService.applyTailor(viewId, { updates, mode, jobLabel: label });
      if (mode === 'new_profile') {
        onClose();
        router.push(`/career/view/${res.view_id}`);
      } else {
        await onAppliedInPlace?.();
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Apply failed');
    } finally {
      setApplying(null);
    }
  };

  const reset = () => {
    setProposal(null);
    setError(null);
  };

  return (
    <>
      <div className={`fixed inset-0 z-[240] bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed top-0 right-0 z-[250] h-full w-[520px] max-w-[95vw] bg-card border-l border-border shadow-xl flex flex-col transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 h-[56px] border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="BriefcaseIcon" size={18} className="text-primary" />
            <span className="font-heading text-sm font-semibold text-foreground">Tailor to a Job</span>
          </div>
          <button onClick={onClose} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        {!proposal ? (
          <div className="flex-1 overflow-y-auto scrollbar-clean p-4 space-y-3">
            <div className="flex items-center bg-muted rounded-lg p-0.5 w-fit">
              <button onClick={() => setTab('new')} className={`px-3 py-1 rounded-md text-xs font-medium ${tab === 'new' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Paste new</button>
              <button onClick={() => setTab('saved')} className={`px-3 py-1 rounded-md text-xs font-medium ${tab === 'saved' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                Saved ({jobs.length})
              </button>
            </div>

            {tab === 'new' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Role (e.g. Backend Engineer)" className="text-xs rounded-lg border border-border bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className="text-xs rounded-lg border border-border bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={8} placeholder="Paste the full job description here…" className="w-full text-xs rounded-lg border border-border bg-background p-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-primary" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={saveJob} onChange={(e) => setSaveJob(e.target.checked)} className="rounded border-border" />
                  Save this job description for reuse
                </label>
              </>
            ) : jobs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No saved job descriptions yet. Paste one in the “Paste new” tab and keep “Save” checked.</p>
            ) : (
              <div className="space-y-1.5">
                {jobs.map((j) => (
                  <button key={j.id} onClick={() => setSelectedJobId(j.id)} className={`w-full text-left rounded-lg border px-3 py-2 transition-smooth ${selectedJobId === j.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                    <div className="text-sm font-medium text-foreground truncate">{j.title || 'Untitled role'}{j.company ? ` · ${j.company}` : ''}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{j.raw_text.slice(0, 90)}…</div>
                  </button>
                ))}
              </div>
            )}

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context — e.g. 'emphasize my Python + AWS work, I'm targeting senior roles'" className="w-full text-xs rounded-lg border border-border bg-background p-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-primary" />

            {error && <p className="text-xs text-error">{error}</p>}
            <button onClick={run} disabled={running} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <Icon name="SparklesIcon" size={16} /> {running ? 'Tailoring…' : 'Tailor my resume'}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">Nothing is changed until you review and apply. Requires an AI key in Config.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto scrollbar-clean p-4 space-y-3">
              {proposal.summary && <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">{proposal.summary}</p>}
              {!!proposal.keywords_added?.length && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Keywords woven in</p>
                  <div className="flex flex-wrap gap-1">
                    {proposal.keywords_added.map((k, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">{k}</span>)}
                  </div>
                </div>
              )}

              {proposal.changes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">The AI didn't suggest any changes — your resume may already fit this role well.</p>
              ) : (
                proposal.changes.map((c: TailorChange) => (
                  <div key={c.section_id} className={`rounded-lg border p-3 ${included.has(c.section_id) ? 'border-primary/40' : 'border-border opacity-60'}`}>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={included.has(c.section_id)} onChange={() => toggle(c.section_id)} className="rounded border-border" />
                      <span className="text-sm font-semibold text-foreground">{c.title || c.section_type}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-auto">{c.section_type}</span>
                    </label>
                    {c.rationale && <p className="text-[11px] text-muted-foreground mb-2 italic">{c.rationale}</p>}
                    <div className="grid grid-cols-1 gap-1.5">
                      <div className="rounded-md bg-error/5 border border-error/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-error/80 mb-1">Before</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{c.before_text || '(empty)'}</p>
                      </div>
                      <div className="rounded-md bg-success/5 border border-success/20 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-success/80 mb-1">After</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{c.after_text}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border p-3 space-y-2 flex-shrink-0">
              {error && <p className="text-xs text-error">{error}</p>}
              <div className="flex items-center gap-2">
                <button onClick={() => apply('new_profile')} disabled={!!applying} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  <Icon name="DocumentDuplicateIcon" size={15} /> {applying === 'new_profile' ? 'Creating…' : 'Save as new resume'}
                </button>
                <button onClick={() => apply('in_place')} disabled={!!applying} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  <Icon name="CheckIcon" size={15} /> {applying === 'in_place' ? 'Applying…' : 'Apply to this profile'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                “New resume” clones the profile (originals untouched). “Apply to this profile” rewrites the shared profile — it updates every view built on it (checkpointed first).
              </p>
              <button onClick={reset} className="w-full text-xs text-muted-foreground hover:text-foreground py-1">← Start over</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
