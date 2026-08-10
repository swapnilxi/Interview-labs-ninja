'use client';

/**
 * Resume Analyzer — split panel: a chosen profile's resume on the left, a job
 * description + section-by-section AI analysis on the right. Distinct from
 * JobMatchPanel (one flat fit report) and AnalysisPanel (flat quality-dimension
 * scores) — this is a Summary/Skills/Experience/Education/Projects-shaped
 * breakdown, one card per section, each with its own good/improve/rewrite, a
 * free-form "ask AI a follow-up" box for a better/more specific version, and
 * an edit-before-accept step.
 */

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { downloadBlob } from '../shared/exportUtils';
import { getActiveProfile } from '../shared/activeProfileStore';
import ErrorBanner from '../shared/ErrorBanner';
import ProfileSelector from '../profile/ProfileSelector';
import ResumePreview from './ResumePreview';
import StreamingText from '../shared/StreamingText';
import { SECTION_ICONS, SECTION_LABELS, type Resume, type SectionAnalysisItem, type SectionAnalysisResult } from '../shared/types';

const SCORE_TIERS = [
  { min: 80, label: 'Strong', color: 'var(--color-success)', soft: 'bg-success/10', text: 'text-success' },
  { min: 60, label: 'Solid', color: 'var(--color-primary)', soft: 'bg-primary/10', text: 'text-primary' },
  { min: 40, label: 'Needs work', color: 'var(--color-warning)', soft: 'bg-warning/10', text: 'text-warning' },
  { min: 0, label: 'Weak', color: 'var(--color-error)', soft: 'bg-error/10', text: 'text-error' },
];
function scoreTier(score: number | null) {
  const v = score ?? 0;
  return SCORE_TIERS.find((t) => v >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const value = score ?? 0;
  const tier = scoreTier(score);
  const inner = size - 12;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, background: `conic-gradient(${tier.color} ${value * 3.6}deg, var(--color-muted) 0deg)`, borderRadius: '9999px' }}>
      <div className="absolute inset-[6px] rounded-full bg-card flex items-center justify-center flex-col">
        <span className="text-lg font-bold text-foreground leading-none" style={{ fontSize: inner * 0.32 }}>{score ?? '—'}</span>
      </div>
    </div>
  );
}

/** Editable suggestion box shared by the auto-generated rewrite and any "ask AI" follow-up. */
function SuggestionBox({
  text, streaming, onAccept, onDiscard, saving, saveError,
}: {
  text: string;
  streaming: boolean;
  onAccept: (finalText: string) => void;
  onDiscard: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setDraft(text); }, [text, editing]);

  if (streaming) {
    return (
      <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3">
        <StreamingText text={text} streaming />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        <Icon name="SparklesIcon" size={12} /> AI suggestion
      </div>
      {!editing ? (
        <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          autoFocus
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-[13px] text-foreground focus-ring resize-y"
        />
      )}
      {saveError && <p className="text-xs text-error">{saveError}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        {!editing ? (
          <>
            <button onClick={() => onAccept(draft)} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success text-white text-[11px] font-semibold hover:bg-success/90 disabled:opacity-50 shadow-sm">
              {saving && <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <Icon name="CheckIcon" size={12} /> Use this
            </button>
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted">
              <Icon name="PencilIcon" size={12} /> Edit first
            </button>
          </>
        ) : (
          <button onClick={() => onAccept(draft)} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success text-white text-[11px] font-semibold hover:bg-success/90 disabled:opacity-50 shadow-sm">
            {saving && <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            <Icon name="CheckIcon" size={12} /> Save this version
          </button>
        )}
        <button onClick={onDiscard} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted">
          <Icon name="XMarkIcon" size={12} /> Discard
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  item, resumeId, jobDescription, currentContent, onApplied,
}: {
  item: SectionAnalysisItem;
  resumeId: string;
  jobDescription: string;
  currentContent: any;
  onApplied: (sectionId: string, content: any) => void;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(item.suggested_rewrite);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askDraft, setAskDraft] = useState('');

  const needsWork = item.improve.length > 0;
  const icon = SECTION_ICONS[item.section_type] || 'DocumentTextIcon';

  const accept = async (finalText: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const nextContent = { ...(currentContent || {}), text: finalText.trim() };
      await careerService.updateSection(resumeId, item.section_id, { content: nextContent });
      setApplied(true);
      onApplied(item.section_id, nextContent);
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save this section.');
    } finally {
      setSaving(false);
    }
  };

  const askAI = async () => {
    setAsking(true);
    setAskError(null);
    setAskDraft('');
    try {
      await careerService.rewriteSection(item.section_id, askText.trim() || undefined, jobDescription || undefined, (chunk) => setAskDraft((d) => d + chunk));
    } catch (e: any) {
      setAskError(e?.message || 'Could not get a suggestion.');
    } finally {
      setAsking(false);
    }
  };

  useEffect(() => {
    if (!asking && askDraft) {
      setSuggestion(askDraft);
      setDismissed(false);
      setApplied(false);
      setAskOpen(false);
      setAskText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

  return (
    <div className="lab-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="cs-icon-chip w-8 h-8"><Icon name={icon} size={15} className="text-primary" /></span>
          <h4 className="text-sm font-semibold text-foreground truncate">{item.title || SECTION_LABELS[item.section_type] || item.section_type}</h4>
        </div>
        {applied ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success shrink-0"><Icon name="CheckCircleIcon" size={13} variant="solid" /> Applied</span>
        ) : (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${needsWork ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
            {needsWork ? `${item.improve.length} to improve` : 'Looking good'}
          </span>
        )}
      </div>

      {(item.good.length > 0 || item.improve.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-2">
          {item.good.length > 0 && (
            <div className="rounded-lg bg-success/[0.06] border border-success/15 p-2.5 space-y-1">
              {item.good.map((g, i) => (
                <p key={i} className="text-[12px] text-foreground/90 flex items-start gap-1.5"><Icon name="CheckIcon" size={12} className="text-success shrink-0 mt-0.5" />{g}</p>
              ))}
            </div>
          )}
          {item.improve.length > 0 && (
            <div className="rounded-lg bg-warning/[0.06] border border-warning/15 p-2.5 space-y-1">
              {item.improve.map((g, i) => (
                <p key={i} className="text-[12px] text-foreground/90 flex items-start gap-1.5"><Icon name="ExclamationTriangleIcon" size={12} className="text-warning shrink-0 mt-0.5" />{g}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {suggestion && !dismissed && !applied && !asking && (
        <SuggestionBox text={suggestion} streaming={false} onAccept={accept} onDiscard={() => setDismissed(true)} saving={saving} saveError={saveError} />
      )}

      {asking && <SuggestionBox text={askDraft} streaming onAccept={() => {}} onDiscard={() => {}} saving={false} saveError={null} />}

      {!applied && !asking && (
        <div className="pt-1">
          {!askOpen ? (
            <button onClick={() => setAskOpen(true)} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Icon name="ChatBubbleLeftRightIcon" size={13} />
              {suggestion ? 'Not quite right? Ask AI for something else' : 'Ask AI to write this section'}
            </button>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
              <label className="block text-[11px] font-medium text-muted-foreground">Give context or ask for something specific</label>
              <textarea
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                rows={2}
                placeholder="e.g. &quot;Make this sound more senior&quot;, or &quot;I also led a team of 5 engineers — work that in&quot;"
                className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-xs text-foreground focus-ring resize-y"
              />
              {askError && <p className="text-xs text-error">{askError}</p>}
              <div className="flex items-center gap-2">
                <button onClick={askAI} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90">
                  <Icon name="SparklesIcon" size={12} /> Get suggestion
                </button>
                <button onClick={() => { setAskOpen(false); setAskText(''); }} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalyzerPanel({ profiles, loaded, onGoToProfiles, onProfilesChanged, showToast }: { profiles: Resume[]; loaded: boolean; onGoToProfiles: () => void; onProfilesChanged: () => void; showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [profileId, setProfileId] = useState('');
  const [resumeDetail, setResumeDetail] = useState<Resume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SectionAnalysisResult | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);

  useEffect(() => {
    if (!profiles.length || profileId) return;
    const activeRef = getActiveProfile();
    const stillExists = activeRef && profiles.some((p) => p.id === activeRef.id);
    setProfileId(stillExists ? activeRef!.id : profiles[0].id);
  }, [profiles, profileId]);

  useEffect(() => {
    if (!profileId) { setResumeDetail(null); return; }
    setResumeLoading(true);
    setResult(null);
    setError(null);
    careerService.getProfile(profileId)
      .then(setResumeDetail)
      .catch(() => setResumeDetail(null))
      .finally(() => setResumeLoading(false));
  }, [profileId]);

  const analyze = async () => {
    if (!profileId) { setError('Choose a resume to analyze.'); return; }
    setError(null);
    setResult(null);
    setAnalyzing(true);
    try {
      const res = await careerService.analyzeResumeSections(profileId, jobDescription.trim() || undefined, jobTitle.trim() || undefined);
      setResult(res);
      showToast('Analysis ready');
    } catch (e: any) {
      setError(e?.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const onSectionApplied = (sectionId: string, content: any) => {
    setResumeDetail((prev) => prev ? { ...prev, sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, content } : s)) } : prev);
  };

  const download = async (format: 'pdf' | 'docx') => {
    if (!resumeDetail) return;
    setDownloading(format);
    try {
      const blob = await careerService.exportResumeBlob(resumeDetail.id, format);
      downloadBlob(blob, `${resumeDetail.title || 'resume'}.${format}`);
    } catch (e: any) {
      showToast(e?.message || 'Download failed.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  if (loaded && profiles.length === 0) {
    return (
      <div className="lab-card p-12 text-center">
        <div className="cs-empty-badge"><Icon name="MagnifyingGlassCircleIcon" size={28} className="text-primary" /></div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">To analyze a resume, first create a data profile with your real experience.</p>
        <button onClick={onGoToProfiles} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 hover:shadow-glow transition-smooth"><Icon name="IdentificationIcon" size={16} /> Go to Profiles</button>
      </div>
    );
  }

  const tier = result ? scoreTier(result.overall_score) : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="cs-icon-chip w-11 h-11"><Icon name="MagnifyingGlassCircleIcon" size={22} className="text-primary" /></span>
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Resume Analyzer</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pick a resume, optionally target a job, and get a section-by-section breakdown you can act on immediately.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5 items-start">
        {/* Left panel — resume */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <ProfileSelector value={profileId} profiles={profiles} onChange={setProfileId} onProfilesChanged={onProfilesChanged} showToast={showToast} />
          {resumeLoading ? (
            <div className="lab-card p-12 flex items-center justify-center"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : resumeDetail ? (
            <>
              <div className="rounded-xl overflow-hidden ring-1 ring-border/60 shadow-sm">
                <ResumePreview resume={resumeDetail} />
              </div>
              <div className="lab-card p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="cs-icon-chip w-9 h-9"><Icon name="ArrowDownTrayIcon" size={15} className="text-primary" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Download Updated Resume</p>
                    <p className="text-[11px] text-muted-foreground">Includes any accepted rewrites above.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => download('pdf')} disabled={downloading !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-smooth">
                    {downloading === 'pdf' ? <span className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <Icon name="ArrowDownTrayIcon" size={14} />} PDF
                  </button>
                  <button onClick={() => download('docx')} disabled={downloading !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-smooth">
                    {downloading === 'docx' ? <span className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <Icon name="ArrowDownTrayIcon" size={14} />} DOCX
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Right panel — job description + results */}
        <div className="flex flex-col gap-4">
          <ErrorBanner message={error} className="" />

          <div className="lab-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Icon name="BriefcaseIcon" size={15} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Target a job <span className="font-normal text-muted-foreground">(optional)</span></h3>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job description</label>
              <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={6} placeholder="Paste the job posting here to also score fit and keyword gaps against it…" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring resize-y" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Job title</label>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior ML Engineer" className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-ring" />
            </div>
            <button onClick={analyze} disabled={analyzing || !profileId} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-semibold shadow-md hover:shadow-lg hover:brightness-105 disabled:opacity-50 transition-smooth bg-gradient-to-br from-[#5b5bd6] to-[#7c3aed]">
              {analyzing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="MagnifyingGlassCircleIcon" size={17} />}
              {analyzing ? 'Analyzing your resume…' : jobDescription.trim() ? 'Analyze against this job' : 'Analyze resume quality'}
            </button>
          </div>

          {result && resumeDetail && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="lab-card p-5 flex items-center gap-4" style={{ borderColor: `color-mix(in srgb, ${tier!.color} 35%, var(--color-border))` }}>
                <ScoreRing score={result.overall_score} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">Overall match score</p>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${tier!.soft} ${tier!.text}`}>{tier!.label}</span>
                  </div>
                  {result.overall_summary && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.overall_summary}</p>}
                </div>
              </div>

              {result.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No sections to analyze yet — add some content to this resume first.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-0.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section-by-section breakdown</h3>
                    <span className="text-[11px] text-muted-foreground/70">({result.sections.length})</span>
                  </div>
                  {result.sections.map((item) => (
                    <SectionCard
                      key={item.section_id}
                      item={item}
                      resumeId={resumeDetail.id}
                      jobDescription={jobDescription.trim()}
                      currentContent={resumeDetail?.sections.find((s) => s.id === item.section_id)?.content}
                      onApplied={onSectionApplied}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {!result && !analyzing && (
            <div className="lab-card p-8 text-center border-dashed">
              <Icon name="DocumentMagnifyingGlassIcon" size={26} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">Your section-by-section breakdown will appear here — strengths, gaps, and a ready-to-use rewrite for each section.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
