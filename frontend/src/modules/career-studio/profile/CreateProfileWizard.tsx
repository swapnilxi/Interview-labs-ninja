'use client';

/**
 * Guided "+ Create New Profile" entry point. A lightweight method-chooser, NOT a
 * reimplementation of import — for the resume/JSON/text methods it hands off to the
 * existing, already-working ProfileImportDialog (via onOpenImport); it only does new
 * work for "Manual" (a direct blank-create) and "From a job posting" (a genuinely new
 * skeleton-profile flow backed by POST /career/profiles/from-job).
 */

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import ErrorBanner from '../shared/ErrorBanner';
import type { Resume } from '../shared/types';

type ImportMethod = 'resume' | 'json' | 'text';
type Method = 'manual' | ImportMethod | 'job';
type Step = 'method' | 'job-input';

const METHODS: Array<{ id: Method; icon: string; title: string; desc: string; tint: 'primary' | 'secondary' | 'accent' }> = [
  { id: 'manual', icon: 'PencilSquareIcon', title: 'Manual entry', desc: 'Start blank and fill in everything yourself.', tint: 'primary' },
  { id: 'resume', icon: 'DocumentDuplicateIcon', title: 'From a resume', desc: 'Upload a PDF/DOCX resume, or copy sections from a profile you already have.', tint: 'secondary' },
  { id: 'text', icon: 'SparklesIcon', title: 'Describe yourself', desc: 'Type or paste a bio, notes, or an old resume — AI structures it.', tint: 'accent' },
  { id: 'json', icon: 'CodeBracketIcon', title: 'JSON import', desc: 'Paste a structured section array.', tint: 'primary' },
];

const JOB_METHOD = { id: 'job' as const, icon: 'BriefcaseIcon', title: 'From a job posting', desc: 'Paste a job link or description — get a starter profile shaped for that role (skills checklist pre-filled; you fill in your real experience).' };

// Literal class strings so Tailwind's static scan picks them up (template-built class names aren't detected).
const TINT_CLASSES: Record<'primary' | 'secondary' | 'accent', string> = {
  primary: 'text-primary bg-primary/10',
  secondary: 'text-secondary bg-secondary/10',
  accent: 'text-accent bg-accent/10',
};

export default function CreateProfileWizard({
  open,
  onClose,
  onCreated,
  onOpenImport,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (profile: Resume) => void;
  onOpenImport: (initialSource: ImportMethod) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}) {
  const [step, setStep] = useState<Step>('method');
  const [jobSource, setJobSource] = useState<'url' | 'text'>('text');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setStep('method');
    setJobSource('text');
    setJobUrl('');
    setJobText('');
    setTitle('');
    setError(null);
  };
  const close = () => { reset(); onClose(); };

  const choose = async (method: Method) => {
    setError(null);
    if (method === 'manual') {
      setLoading(true);
      try {
        const p = await careerService.createProfile('New Profile');
        onCreated(p);
        close();
      } catch (e: any) {
        setError(e?.message || 'Could not create profile');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (method === 'job') {
      setStep('job-input');
      return;
    }
    // resume / json / text — hand off to the existing import dialog.
    onOpenImport(method);
    reset();
  };

  const createFromJob = async () => {
    setError(null);
    if (jobSource === 'url' && !jobUrl.trim()) { setError('Paste the job posting link.'); return; }
    if (jobSource === 'text' && !jobText.trim()) { setError('Paste the job description.'); return; }
    setLoading(true);
    try {
      const p = await careerService.createProfileFromJob({
        jobSource,
        jobUrl: jobSource === 'url' ? jobUrl.trim() : undefined,
        jobText: jobSource === 'text' ? jobText.trim() : undefined,
        title: title.trim() || undefined,
      });
      showToast?.('Starter profile created');
      onCreated(p);
      close();
    } catch (e: any) {
      setError(e?.message || 'Could not build a profile from that job posting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !loading && close()}>
      <div className="w-full max-w-[640px] max-h-[88vh] flex flex-col bg-card border border-border rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {step === 'job-input' && (
              <button onClick={() => setStep('method')} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"><Icon name="ArrowLeftIcon" size={16} /></button>
            )}
            <Icon name="IdentificationIcon" size={18} className="text-primary shrink-0" />
            <h2 className="font-heading text-base font-semibold text-foreground truncate">
              {step === 'method' ? 'Create a new Career Data Profile' : 'Starter profile from a job posting'}
            </h2>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-clean p-5">
          <ErrorBanner message={error} className="mb-3" />

          {step === 'method' ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => choose(JOB_METHOD.id)}
                disabled={loading}
                className="relative overflow-hidden text-left p-4 rounded-xl text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-smooth disabled:opacity-50 bg-gradient-to-br from-[#5b5bd6] via-[#6d5be0] to-[#7c3aed]"
              >
                <div className="pointer-events-none absolute -top-10 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <span className="w-10 h-10 rounded-lg bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0"><Icon name={JOB_METHOD.icon} size={19} className="text-white" /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{JOB_METHOD.title}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded-full">Fastest start</span>
                    </div>
                    <p className="text-xs text-white/80 mt-0.5 leading-relaxed">{JOB_METHOD.desc}</p>
                  </div>
                </div>
              </button>

              <div className="grid sm:grid-cols-2 gap-3">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => choose(m.id)}
                    disabled={loading}
                    className="text-left p-3.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-0.5 hover:shadow-sm transition-smooth disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TINT_CLASSES[m.tint]}`}><Icon name={m.icon} size={16} /></span>
                      <span className="text-sm font-semibold text-foreground">{m.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-muted">
                <button onClick={() => setJobSource('text')} className={`px-3 py-2 rounded-md text-xs font-medium transition-smooth ${jobSource === 'text' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Paste description</button>
                <button onClick={() => setJobSource('url')} className={`px-3 py-2 rounded-md text-xs font-medium transition-smooth ${jobSource === 'url' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Paste a link</button>
              </div>
              {jobSource === 'text' ? (
                <textarea
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  rows={8}
                  placeholder="Paste the full job posting here…"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y"
                />
              ) : (
                <input
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://company.com/careers/senior-engineer"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring"
                />
              )}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Profile name (optional — defaults to the role title)"
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                We'll pull the required/preferred skills into a starting checklist. Personal info, experience, and education stay empty for you to fill in — nothing about your background is invented.
              </p>
            </div>
          )}
        </div>

        {step === 'job-input' && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
            <button onClick={close} disabled={loading} className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
            <button onClick={createFromJob} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {loading && <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              Create starter profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
