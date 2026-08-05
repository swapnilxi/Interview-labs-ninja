'use client';

/**
 * Career Studio home — tabbed shell. One place to fill data (Profiles), then
 * reuse it to generate resumes/portfolios that differ by template (Resumes,
 * Portfolios), plus a Templates gallery. Live-linked: editing a profile updates
 * every view built from it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { careerService } from '@/lib/services/careerService';
import { viewsService } from '@/lib/services/viewsService';
import { templatesService } from '@/lib/services/templatesService';
import { PORTFOLIO_STYLE_TEMPLATES, type CareerTemplate, type CareerView, type GenerateResumeResult, type Resume, type ViewKind } from './types';
import ProfileImportDialog from './ProfileImportDialog';
import CreateProfileWizard from './CreateProfileWizard';
import ProfileSelector from './ProfileSelector';
import ProfileEditorModal from './ProfileEditorModal';
import { openProfileEditor } from './profileEditorStore';
import { getActiveProfile } from './activeProfileStore';
import TemplateDesigner from './TemplateDesigner';
import { portfolioPreviewHtml, resumePreviewHtml } from './templatePreview';

type Tab = 'profiles' | 'generate' | 'resumes' | 'portfolios' | 'templates';
type Toast = { message: string; type: 'success' | 'error' } | null;

const RESUME_TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Centered serif, ATS-safe' },
  { id: 'modern', name: 'Modern', desc: 'Accent rule, clean sans' },
  { id: 'compact', name: 'Compact', desc: 'Fits more on a page' },
  { id: 'elegant', name: 'Elegant', desc: 'Refined serif headings' },
  { id: 'executive', name: 'Executive', desc: 'Bold accent header band' },
  { id: 'minimalist', name: 'Minimalist', desc: 'Airy, quiet gray labels' },
  { id: 'technical', name: 'Technical', desc: 'Monospace accents, dev feel' },
];

function fmt(v?: string) {
  if (!v) return '';
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CareerStudioTabs() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('resumes');
  const [authed, setAuthed] = useState(true);
  const [profiles, setProfiles] = useState<Resume[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [creator, setCreator] = useState<{ kind: ViewKind; template?: string } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      setAuthed(false);
      return;
    }
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    if (q && ['profiles', 'generate', 'resumes', 'portfolios', 'templates'].includes(q)) setTab(q as Tab);
    void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await careerService.listProfiles());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load profiles', 'error');
    } finally {
      setProfilesLoaded(true);
    }
  }, [showToast]);

  const createProfile = async () => {
    try {
      const p = await careerService.createProfile('My Profile');
      openProfileEditor(p.id);
    } catch (e: any) {
      showToast(e?.message || 'Could not create profile', 'error');
    }
  };

  const startCreateView = (kind: ViewKind, template?: string) => {
    if (profiles.length === 0) {
      showToast('Create a data profile first', 'error');
      setTab('profiles');
      return;
    }
    setCreator({ kind, template });
  };

  if (!authed) {
    return (
      <div className="lab-card p-10 text-center max-w-lg mx-auto">
        <Icon name="LockClosedIcon" size={32} variant="outline" className="text-muted-foreground mx-auto mb-3" />
        <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Log in to use Career Studio</h3>
        <p className="text-sm text-muted-foreground mb-5">Your profiles, resumes, and portfolios are saved to your account.</p>
        <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"><Icon name="UserCircleIcon" size={16} /> Log in</Link>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'profiles', label: 'Profiles', icon: 'IdentificationIcon' },
    { id: 'generate', label: 'Generate', icon: 'SparklesIcon' },
    { id: 'resumes', label: 'Resumes', icon: 'DocumentTextIcon' },
    { id: 'portfolios', label: 'Portfolios', icon: 'GlobeAltIcon' },
    { id: 'templates', label: 'Template Designer', icon: 'SwatchIcon' },
  ];

  return (
    <div className="relative">
      {toast && (
        <div className={`fixed top-20 right-6 z-[300] px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg animate-fade-in ${toast.type === 'success' ? 'bg-success/10 text-success border border-success/30' : 'bg-error/10 text-error border border-error/30'}`}>{toast.message}</div>
      )}

      <div className="cs-tabbar">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`cs-tab ${tab === t.id ? 'cs-tab-active' : ''}`}>
            <Icon name={t.icon as any} size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'profiles' && <ProfilesTab profiles={profiles} loaded={profilesLoaded} onCreate={createProfile} onChanged={loadProfiles} showToast={showToast} />}
      {tab === 'generate' && <GenerateTab profiles={profiles} loaded={profilesLoaded} onGoToProfiles={() => setTab('profiles')} onProfilesChanged={loadProfiles} showToast={showToast} />}
      {tab === 'resumes' && <ViewsTab kind="resume" profilesCount={profiles.length} onNew={() => startCreateView('resume')} showToast={showToast} />}
      {tab === 'portfolios' && <ViewsTab kind="portfolio" profilesCount={profiles.length} onNew={() => startCreateView('portfolio')} showToast={showToast} />}
      {tab === 'templates' && <TemplatesTab onUse={startCreateView} showToast={showToast} />}

      {creator && (
        <CreateViewModal
          kind={creator.kind}
          initialTemplate={creator.template}
          profiles={profiles}
          onClose={() => setCreator(null)}
          onCreated={(id) => router.push(`/career/view/${id}`)}
          showToast={showToast}
        />
      )}

      <ProfileEditorModal onClosed={loadProfiles} />
    </div>
  );
}

function ProfilesTab({ profiles, loaded, onCreate, onChanged, showToast }: { profiles: Resume[]; loaded: boolean; onCreate: () => void; onChanged: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialSource, setImportInitialSource] = useState<'resume' | 'json' | 'text'>('resume');
  const [wizardOpen, setWizardOpen] = useState(false);
  const del = async (id: string, title: string) => {
    if (!window.confirm(`Delete profile "${title}"? Views using it will need a new profile.`)) return;
    try {
      await careerService.deleteProfile(id);
      onChanged();
      showToast('Profile deleted');
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Data Profiles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Fill your details once here, then reuse across resumes &amp; portfolios.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWizardOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="PlusIcon" size={14} /> Create New Profile</button>
        </div>
      </div>
      {!loaded ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="lab-card p-5 animate-pulse"><div className="h-5 w-2/3 bg-muted rounded mb-4" /><div className="h-3 w-1/2 bg-muted rounded" /></div>)}</div>
      ) : profiles.length === 0 ? (
        <div className="lab-card p-12 text-center">
          <div className="cs-empty-badge"><Icon name="IdentificationIcon" size={28} className="text-primary" /></div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">A profile holds your reusable career data — personal info, experience, projects, skills. Create one, then spin up as many resumes/portfolios as you like, each with a different template.</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setWizardOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="PlusIcon" size={16} /> Create your first profile</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((p) => (
            <div key={p.id} className="display-card p-5 group flex flex-col">
              <button onClick={() => openProfileEditor(p.id)} className="text-left flex-1">
                <div className="flex items-start gap-3 mb-4">
                  <div className="cs-icon-chip"><Icon name="IdentificationIcon" size={18} className="text-primary" /></div>
                  <div className="min-w-0"><h3 className="font-heading text-sm font-semibold text-foreground truncate">{p.title}</h3><p className="text-xs text-muted-foreground mt-0.5">Updated {fmt(p.updated_at)}</p></div>
                </div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Icon name="Bars3BottomLeftIcon" size={14} /> {p.section_count ?? 0} sections</div>
              </button>
              <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-smooth">
                <button onClick={() => openProfileEditor(p.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5" title="Edit"><Icon name="PencilSquareIcon" size={16} /></button>
                <button onClick={() => del(p.id, p.title)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5" title="Delete"><Icon name="TrashIcon" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileImportDialog
        open={importOpen}
        initialSource={importInitialSource}
        onClose={() => setImportOpen(false)}
        onImported={(created) => {
          onChanged();
          if (created?.id) openProfileEditor(created.id);
          else showToast('Profile imported');
        }}
      />
      <CreateProfileWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        showToast={showToast}
        onCreated={(p) => {
          onChanged();
          openProfileEditor(p.id);
        }}
        onOpenImport={(src) => {
          setWizardOpen(false);
          setImportInitialSource(src);
          setImportOpen(true);
        }}
      />
    </div>
  );
}

type JobSource = 'link' | 'description' | 'context' | 'json';

function GenerateTab({ profiles, loaded, onGoToProfiles, onProfilesChanged, showToast }: { profiles: Resume[]; loaded: boolean; onGoToProfiles: () => void; onProfilesChanged: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState('');
  const [source, setSource] = useState<JobSource>('description');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [jobJson, setJobJson] = useState('');
  const [template, setTemplate] = useState('classic');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetCompany, setTargetCompany] = useState('');
  const [saveJob, setSaveJob] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResumeResult | null>(null);

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

  const generate = async () => {
    setError(null);
    setResult(null);
    if (!profileId) { setError('Choose a source profile.'); return; }
    const args: Parameters<typeof careerService.generateResume>[0] = {
      profileId,
      jobSource: source === 'link' ? 'url' : source === 'json' ? 'json' : 'text',
      template,
      title: jobTitle.trim() ? `${jobTitle.trim()}${company.trim() ? ` · ${company.trim()}` : ''} Resume` : undefined,
      notes: notes.trim() || undefined,
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
      const res = await careerService.generateResume(args);
      setResult(res);
      showToast('Resume generated');
    } catch (e: any) {
      setError(e?.message || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  if (loaded && profiles.length === 0) {
    return (
      <div className="lab-card p-12 text-center">
        <div className="cs-empty-badge"><Icon name="SparklesIcon" size={28} className="text-primary" /></div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">To generate a resume, first create a data profile with your real experience. The generator tailors that profile to any job.</p>
        <button onClick={onGoToProfiles} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="IdentificationIcon" size={16} /> Go to Profiles</button>
      </div>
    );
  }

  return (
    <div className="max-w-[820px]">
      <div className="mb-5">
        <h2 className="font-heading text-lg font-semibold text-foreground">Generate a resume</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Pick a profile, drop in a job (link, description, context, or JSON), and get a tailored resume — your profile stays untouched.</p>
      </div>

      {error && (
        <div className="mb-4 p-2.5 rounded-lg border bg-error/12 border-error/40 text-error flex items-center gap-2 text-xs">
          <Icon name="ExclamationTriangleIcon" size={15} variant="solid" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="lab-card p-6 flex flex-col gap-5">
        {/* Profile + template */}
        <div className="grid sm:grid-cols-2 gap-4">
          <ProfileSelector value={profileId} profiles={profiles} onChange={setProfileId} onProfilesChanged={onProfilesChanged} showToast={showToast} />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Template</label>
            <select value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring">
              {RESUME_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Job source */}
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

        {/* Target role / company — what you're optimizing FOR, distinct from the job posting's own title/company below */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Target role</label>
            <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
            <p className="text-[11px] text-muted-foreground mt-1">Steers wording toward this role — pre-filled from the profile's primary role if set.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Target company <span className="font-normal normal-case">(optional)</span></label>
            <input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder="e.g. Stripe" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
            <p className="text-[11px] text-muted-foreground mt-1">Nudges tone/keywords toward this company's style, without inventing anything.</p>
          </div>
        </div>

        {/* Optional details */}
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
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. emphasize leadership; keep it to one page" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={saveJob} onChange={(e) => setSaveJob(e.target.checked)} className="accent-[var(--color-primary)]" />
          Save this job so I can reuse it later
        </label>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground">Creates a new tailored profile + resume. Original profile untouched.</p>
          <button onClick={generate} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-105 disabled:opacity-50 transition-smooth bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]">
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="SparklesIcon" size={16} />}
            {loading ? 'Generating…' : 'Generate resume'}
          </button>
        </div>
      </div>

      {result && (
        <div className="lab-card p-6 mt-5 flex flex-col gap-4 border-primary/30 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-base font-semibold text-foreground inline-flex items-center gap-2">
              <span className="cs-icon-chip w-8 h-8"><Icon name="SparklesIcon" size={16} className="text-primary" /></span> Resume generated
            </h3>
            <button onClick={() => setResult(null)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Icon name="ArrowPathIcon" size={13} /> Start over
            </button>
          </div>
          {result.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}

          {(result.new_sections_added?.length ?? 0) > 0 && (
            <div className="p-2.5 rounded-lg border border-success/30 bg-success/5 text-xs text-foreground flex items-start gap-2">
              <Icon name="PlusCircleIcon" size={15} className="text-success shrink-0 mt-0.5" />
              <span>Added {result.new_sections_added!.length} new section{result.new_sections_added!.length === 1 ? '' : 's'} suggested by this job: <span className="font-medium">{result.new_sections_added!.join(', ')}</span></span>
            </div>
          )}

          {result.gap_analysis && (
            <div className="flex flex-col gap-3 pt-2 border-t border-border">
              <div className="flex items-center gap-3">
                <div
                  className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `conic-gradient(var(--color-primary) ${(result.gap_analysis.fit_score ?? 0) * 3.6}deg, var(--color-muted) 0deg)` }}
                >
                  <div className="w-11 h-11 rounded-full bg-card flex items-center justify-center text-sm font-semibold text-foreground">{result.gap_analysis.fit_score ?? 0}</div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Job fit score</p>
                  {result.gap_analysis.experience_gap && <p className="text-xs text-muted-foreground">{result.gap_analysis.experience_gap}</p>}
                </div>
              </div>

              {(result.gap_analysis.matched_skills?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Matched skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.gap_analysis.matched_skills ?? []).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success/10 text-success"><Icon name="CheckIcon" size={11} />{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {(result.gap_analysis.missing_skills?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Missing skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.gap_analysis.missing_skills ?? []).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning"><Icon name="ExclamationTriangleIcon" size={11} />{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {(result.gap_analysis.missing_certifications?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Missing certifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.gap_analysis.missing_certifications ?? []).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning"><Icon name="CheckBadgeIcon" size={11} />{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {(result.gap_analysis.ats_keywords_missing?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">ATS keywords to add</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.gap_analysis.ats_keywords_missing ?? []).map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {(result.gap_analysis.recommendations?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Recommendations</p>
                  <ul className="space-y-1">
                    {(result.gap_analysis.recommendations ?? []).map((r, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-1.5"><Icon name="LightBulbIcon" size={13} className="text-primary shrink-0 mt-0.5" />{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => router.push(`/career/view/${result.view.id}`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 self-start"
          >
            Open tailored resume <Icon name="ArrowRightIcon" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ViewsTab({ kind, profilesCount, onNew, showToast }: { kind: ViewKind; profilesCount: number; onNew: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const router = useRouter();
  const [views, setViews] = useState<CareerView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const label = kind === 'portfolio' ? 'Portfolio' : 'Resume';

  const load = useCallback(async () => {
    try {
      setViews(await viewsService.list(kind));
    } catch (e: any) {
      showToast(e?.message || 'Failed to load', 'error');
    } finally {
      setLoaded(true);
    }
  }, [kind, showToast]);

  useEffect(() => { void load(); }, [load]);

  const del = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      await viewsService.remove(id);
      setViews((v) => v.filter((x) => x.id !== id));
      showToast(`${label} deleted`);
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">{label}s</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Each {label.toLowerCase()} reuses a data profile with a template of your choice.</p>
        </div>
        <button onClick={onNew} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="PlusIcon" size={14} /> New {label}</button>
      </div>
      {!loaded ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="lab-card p-5 animate-pulse"><div className="h-5 w-2/3 bg-muted rounded mb-4" /><div className="h-3 w-1/2 bg-muted rounded" /></div>)}</div>
      ) : views.length === 0 ? (
        <div className="lab-card p-12 text-center">
          <div className="cs-empty-badge"><Icon name={kind === 'portfolio' ? 'GlobeAltIcon' : 'DocumentTextIcon'} size={28} className="text-primary" /></div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">{profilesCount === 0 ? 'Create a data profile first, then generate ' + label.toLowerCase() + 's from it.' : `Generate a ${label.toLowerCase()} from one of your profiles — pick a template and export or share.`}</p>
          <button onClick={onNew} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="PlusIcon" size={16} /> New {label}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {views.map((v) => (
            <div key={v.id} className="display-card p-5 group flex flex-col">
              <button onClick={() => router.push(`/career/view/${v.id}`)} className="text-left flex-1">
                <div className="flex items-start gap-3 mb-4">
                  <div className="cs-icon-chip"><Icon name={kind === 'portfolio' ? 'GlobeAltIcon' : 'DocumentTextIcon'} size={18} className="text-primary" /></div>
                  <div className="min-w-0"><h3 className="font-heading text-sm font-semibold text-foreground truncate">{v.title}</h3><p className="text-xs text-muted-foreground mt-0.5">Updated {fmt(v.updated_at)}</p></div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 capitalize"><Icon name="SwatchIcon" size={13} /> {v.template || 'default'}</span>
                  <span className="inline-flex items-center gap-1"><Icon name="Bars3BottomLeftIcon" size={13} /> {v.section_count ?? 0} sections</span>
                </div>
              </button>
              <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-smooth">
                <button onClick={() => router.push(`/career/view/${v.id}`)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5" title="Open"><Icon name="PencilSquareIcon" size={16} /></button>
                <button onClick={() => del(v.id, v.title)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5" title="Delete"><Icon name="TrashIcon" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ tpl, onUse, onEdit, onDuplicate, onDelete }: {
  tpl: CareerTemplate;
  onUse: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const src = tpl.kind === 'portfolio' ? portfolioPreviewHtml(tpl.spec) : resumePreviewHtml(tpl.spec);
  return (
    <div className="display-card p-3 flex flex-col group">
      <div className="relative h-32 rounded-md border border-border overflow-hidden bg-white mb-2">
        {/* Non-interactive thumbnail; scaled so the header + first section show. */}
        <iframe title={tpl.name} srcDoc={src} tabIndex={-1} scrolling="no" className="pointer-events-none origin-top-left" style={{ width: '250%', height: '250%', transform: 'scale(0.4)', border: 0 }} />
        <button onClick={onUse} className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-smooth opacity-0 group-hover:opacity-100">
          <span className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-md inline-flex items-center gap-1.5 bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]"><Icon name="SparklesIcon" size={13} /> Use</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold text-foreground truncate flex-1" title={tpl.name}>{tpl.name}</span>
        <button onClick={onEdit} title="Edit" className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5"><Icon name="PencilSquareIcon" size={15} /></button>
        <button onClick={onDuplicate} title="Duplicate" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><Icon name="DocumentDuplicateIcon" size={15} /></button>
        <button onClick={onDelete} title="Delete" className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5"><Icon name="TrashIcon" size={15} /></button>
      </div>
    </div>
  );
}

function TemplatesTab({ onUse, showToast }: { onUse: (kind: ViewKind, template: string) => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [templates, setTemplates] = useState<CareerTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [designer, setDesigner] = useState<{ kind: ViewKind; template: CareerTemplate | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await templatesService.list());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load templates', 'error');
    } finally {
      setLoaded(true);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const del = async (t: CareerTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"? Views already using it keep their current look until re-rendered.`)) return;
    try {
      await templatesService.remove(t.id);
      setTemplates((ts) => ts.filter((x) => x.id !== t.id));
      showToast('Template deleted');
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };

  const duplicate = async (t: CareerTemplate) => {
    try {
      const copy = await templatesService.duplicate(t.id);
      setTemplates((ts) => [...ts, copy]);
      showToast('Template duplicated');
    } catch (e: any) {
      showToast(e?.message || 'Duplicate failed', 'error');
    }
  };

  const onSaved = (saved: CareerTemplate) => {
    setTemplates((ts) => (ts.some((x) => x.id === saved.id) ? ts.map((x) => (x.id === saved.id ? saved : x)) : [...ts, saved]));
    setDesigner(null);
    showToast('Template saved');
  };

  const Section = ({ kind, title }: { kind: ViewKind; title: string }) => {
    const items = templates.filter((t) => t.kind === kind);
    return (
      <div className="mb-9">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="font-heading text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <Icon name={kind === 'portfolio' ? 'GlobeAltIcon' : 'DocumentTextIcon'} size={16} className="text-muted-foreground" /> {title}
            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
          </h3>
          <button onClick={() => setDesigner({ kind, template: null })} className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth inline-flex items-center gap-1.5"><Icon name="PlusIcon" size={14} /> New {kind}</button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">No {kind} templates yet. Click “New {kind}” to design one.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((t) => (
              <TemplateCard key={t.id} tpl={t} onUse={() => onUse(kind, t.id)} onEdit={() => setDesigner({ kind, template: t })} onDuplicate={() => duplicate(t)} onDelete={() => del(t)} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-heading text-lg font-semibold text-foreground">Template Designer &amp; Manager</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Design, edit, duplicate, or delete your resume &amp; portfolio templates. Built-in presets are yours to tweak too. “Use” spins up a new resume/portfolio from a profile with that template.</p>
      </div>
      {!loaded ? (
        <div className="py-16 flex justify-center"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <>
          <Section kind="resume" title="Resume templates" />
          <Section kind="portfolio" title="Portfolio templates" />
        </>
      )}
      {designer && <TemplateDesigner kind={designer.kind} template={designer.template} onClose={() => setDesigner(null)} onSaved={onSaved} />}
    </div>
  );
}

function CreateViewModal({ kind, initialTemplate, profiles, onClose, onCreated, showToast }: {
  kind: ViewKind;
  initialTemplate?: string;
  profiles: Resume[];
  onClose: () => void;
  onCreated: (id: string) => void;
  showToast: (m: string, t?: 'success' | 'error') => void;
}) {
  const label = kind === 'portfolio' ? 'Portfolio' : 'Resume';
  const fallback = (kind === 'portfolio' ? PORTFOLIO_STYLE_TEMPLATES : RESUME_TEMPLATES).map((t) => ({ id: t.id, name: t.name }));
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>(fallback);
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [template, setTemplate] = useState(initialTemplate || '');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Offer the user's own templates (built-in presets are seeded there too);
  // fall back to the code presets if the list can't be loaded.
  useEffect(() => {
    let alive = true;
    templatesService
      .list(kind)
      .then((rows) => {
        if (!alive) return;
        const list = rows.length ? rows.map((r) => ({ id: r.id, name: r.name })) : fallback;
        setTemplates(list);
        setTemplate((cur) => cur || list[0]?.id || '');
      })
      .catch(() => {
        if (!alive) return;
        setTemplate((cur) => cur || fallback[0].id);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const create = async () => {
    if (!profileId) return;
    setCreating(true);
    try {
      const v = await viewsService.create({ profileId, kind, title: title.trim() || undefined, template });
      onCreated(v.id);
    } catch (e: any) {
      showToast(e?.message || 'Could not create', 'error');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-base font-semibold text-foreground inline-flex items-center gap-2">
            <span className="cs-icon-chip w-8 h-8"><Icon name={kind === 'portfolio' ? 'GlobeAltIcon' : 'DocumentTextIcon'} size={16} className="text-primary" /></span> New {label}
          </h3>
          <button onClick={onClose} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">Data profile</label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-input px-3 py-2.5 focus-ring">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">Template</label>
            <div className="grid grid-cols-2 gap-1.5">
              {templates.map((t) => (
                <button key={t.id} onClick={() => setTemplate(t.id)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${template === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{t.name}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">Title (optional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${label} name`} className="w-full text-sm rounded-lg border border-border bg-input px-3 py-2.5 focus-ring" />
          </div>
          <button onClick={create} disabled={creating || !profileId || !template} className="w-full py-2.5 rounded-lg text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-105 disabled:opacity-50 transition-smooth inline-flex items-center justify-center gap-2 bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]">
            <Icon name="SparklesIcon" size={15} /> {creating ? 'Creating…' : `Create ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
