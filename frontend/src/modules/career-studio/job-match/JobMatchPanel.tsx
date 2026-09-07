'use client';

/**
 * Job Matcher — standalone fit/gap report for a profile against a job, with no
 * resume generated. Shares the job-source picker shape and gap-analysis
 * rendering with the Generate tab (see CareerStudioTabs.tsx's GenerateTab and
 * GapAnalysisResult.tsx) but calls careerService.matchJob instead.
 */

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { getActiveProfile } from '../shared/activeProfileStore';
import ErrorBanner from '../shared/ErrorBanner';
import ProfileSelector from '../profile/ProfileSelector';
import GapAnalysisResult from './GapAnalysisResult';
import type { JobMatchResult, Resume } from '../shared/types';

type JobSource = 'link' | 'description' | 'context' | 'json';

export default function JobMatchPanel({ profiles, loaded, onGoToProfiles, onProfilesChanged, showToast }: { profiles: Resume[]; loaded: boolean; onGoToProfiles: () => void; onProfilesChanged: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [profileId, setProfileId] = useState('');
  const [source, setSource] = useState<JobSource>('description');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [jobJson, setJobJson] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [saveJob, setSaveJob] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobMatchResult | null>(null);

  useEffect(() => {
    if (!profiles.length || profileId) return;
    const activeRef = getActiveProfile();
    const stillExists = activeRef && profiles.some((p) => p.id === activeRef.id);
    setProfileId(stillExists ? activeRef!.id : profiles[0].id);
  }, [profiles, profileId]);

  useEffect(() => {
    const p = profiles.find((x) => x.id === profileId);
    if (!p) return;
    if (!targetRole) setTargetRole(p.primary_role || (p.target_roles && p.target_roles[0]) || '');
    if (!targetCompany) setTargetCompany((p.target_companies && p.target_companies[0]) || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const SOURCES: { id: JobSource; label: string; icon: string }[] = [
    { id: 'link', label: 'Job link', icon: 'LinkIcon' },
    { id: 'description', label: 'Description', icon: 'DocumentTextIcon' },
    { id: 'context', label: 'Context', icon: 'ChatBubbleBottomCenterTextIcon' },
    { id: 'json', label: 'JSON', icon: 'CodeBracketIcon' },
  ];

  const match = async () => {
    setError(null);
    setResult(null);
    if (!profileId) { setError('Choose a profile.'); return; }
    const args: Parameters<typeof careerService.matchJob>[0] = {
      profileId,
      jobSource: source === 'link' ? 'url' : source === 'json' ? 'json' : 'text',
      targetRole: targetRole.trim() || undefined,
      targetCompany: targetCompany.trim() || undefined,
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
      if (!jobText.trim()) { setError(source === 'context' ? 'Describe the role in a few lines.' : 'Paste the job description.'); return; }
      args.jobText = jobText.trim();
    }
    setLoading(true);
    try {
      const res = await careerService.matchJob(args);
      setResult(res);
      showToast('Fit report ready');
    } catch (e: any) {
      setError(e?.message || 'Match failed.');
    } finally {
      setLoading(false);
    }
  };

  if (loaded && profiles.length === 0) {
    return (
      <div className="lab-card p-12 text-center">
        <div className="cs-empty-badge"><Icon name="ScaleIcon" size={28} className="text-primary" /></div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">To check job fit, first create a data profile with your real experience.</p>
        <button onClick={onGoToProfiles} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="IdentificationIcon" size={16} /> Go to Profiles</button>
      </div>
    );
  }

  return (
    <div className="max-w-[820px]">
      <div className="mb-5">
        <h2 className="font-heading text-lg font-semibold text-foreground">Check job fit</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Compare a profile against a job (link, description, context, or JSON) and get a fit score with matched/missing skills — no resume is generated or changed.</p>
      </div>

      <ErrorBanner message={error} />

      <div className="lab-card p-6 flex flex-col gap-5">
        <ProfileSelector value={profileId} profiles={profiles} onChange={setProfileId} onProfilesChanged={onProfilesChanged} showToast={showToast} />

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job target</label>
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-lg bg-muted mb-2">
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
          {source === 'context' && (
            <textarea value={jobText} onChange={(e) => setJobText(e.target.value)} rows={8} placeholder="Describe the role in your own words — team, seniority, must-have skills, what they care about…" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y" />
          )}
          {source === 'json' && (
            <textarea value={jobJson} onChange={(e) => setJobJson(e.target.value)} rows={8} spellCheck={false} placeholder={'{\n  "title": "Senior ML Engineer",\n  "requirements": ["PyTorch", "SQL", "5+ years"]\n}'} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-xs font-mono text-foreground focus-ring resize-y" />
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Target role <span className="font-normal normal-case">(optional)</span></label>
            <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Target company <span className="font-normal normal-case">(optional)</span></label>
            <input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder="e.g. Stripe" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
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

        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={saveJob} onChange={(e) => setSaveJob(e.target.checked)} className="accent-[var(--color-primary)]" />
          Save this job so I can reuse it later
        </label>

        <div className="flex items-center justify-end pt-2 border-t border-border">
          <button onClick={match} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-105 disabled:opacity-50 transition-smooth bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="ScaleIcon" size={16} />}
            {loading ? 'Checking…' : 'Check fit'}
          </button>
        </div>
      </div>

      {result?.gap_analysis && (
        <div className="lab-card p-6 mt-5 flex flex-col gap-4 border-primary/30 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-base font-semibold text-foreground inline-flex items-center gap-2">
              <span className="cs-icon-chip w-8 h-8"><Icon name="ScaleIcon" size={16} className="text-primary" /></span> Fit report
            </h3>
            <button onClick={() => setResult(null)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Icon name="ArrowPathIcon" size={13} /> Start over
            </button>
          </div>
          <GapAnalysisResult gapAnalysis={result.gap_analysis} />
        </div>
      )}
    </div>
  );
}
