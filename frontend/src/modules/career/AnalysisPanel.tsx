'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import type { AnalysisRecord, AnalysisReport } from './types';

const DIMENSIONS: { key: keyof AnalysisReport; label: string }[] = [
  { key: 'grammar_score', label: 'Grammar' },
  { key: 'readability_score', label: 'Readability' },
  { key: 'achievement_score', label: 'Achievements' },
  { key: 'impact_score', label: 'Impact' },
  { key: 'action_verb_score', label: 'Action verbs' },
  { key: 'formatting_score', label: 'Formatting' },
  { key: 'technical_skills_score', label: 'Technical skills' },
  { key: 'soft_skills_score', label: 'Soft skills' },
];

const ISSUE_GROUPS: { key: keyof AnalysisReport; label: string }[] = [
  { key: 'weak_bullets', label: 'Weak bullets' },
  { key: 'red_flags', label: 'Red flags' },
  { key: 'passive_voice_instances', label: 'Passive voice' },
  { key: 'cliches', label: 'Clichés' },
  { key: 'repetitive_words', label: 'Repetitive words' },
  { key: 'missing_skills', label: 'Missing skills' },
  { key: 'missing_sections', label: 'Missing sections' },
];

const scoreColor = (n?: number) => (n == null ? 'text-muted-foreground' : n >= 80 ? 'text-success' : n >= 60 ? 'text-warning' : 'text-error');
const barColor = (n?: number) => (n == null ? 'bg-muted' : n >= 80 ? 'bg-success' : n >= 60 ? 'bg-warning' : 'bg-error');
const sevColor = (s?: string) => (s === 'high' ? 'bg-error/10 text-error border-error/30' : s === 'medium' ? 'bg-warning/10 text-warning border-warning/30' : 'bg-muted text-muted-foreground border-border');

function ScoreBadge({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex-1 rounded-xl border border-border p-4 text-center">
      <div className={`text-3xl font-bold ${scoreColor(value)}`}>{value ?? '—'}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function IssueGroup({ label, items }: { label: string; items?: Array<{ text?: string; suggestion?: string }> }) {
  const [open, setOpen] = useState(false);
  const list = (items || []).filter((i) => i && (i.text || i.suggestion));
  if (list.length === 0) return null;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 bg-card hover:bg-muted transition-smooth">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs bg-error/10 text-error rounded-full px-2 py-0.5">{list.length}</span>
          <Icon name="ChevronDownIcon" size={14} className={`transition-smooth ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="p-2 space-y-2 bg-background/50">
          {list.map((it, i) => (
            <div key={i} className="rounded-md border border-border p-2.5 text-xs">
              {it.text && <p className="text-foreground">{it.text}</p>}
              {it.suggestion && (
                <p className="text-success mt-1 flex gap-1"><Icon name="ArrowRightIcon" size={12} className="flex-shrink-0 mt-0.5" /><span>{it.suggestion}</span></p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Resume analysis drawer. By default it scores a Master Profile / resume by
 * `masterId` via careerService, but callers (e.g. the view editor) can inject
 * their own `analyze`/`getAnalysis` functions to score a live view instead —
 * the UI is identical either way.
 */
export default function AnalysisPanel({
  masterId,
  open,
  onClose,
  analyze,
  getAnalysis,
  onApplyFix,
}: {
  masterId?: string;
  open: boolean;
  onClose: () => void;
  analyze?: (jobDescription?: string) => Promise<AnalysisRecord>;
  getAnalysis?: () => Promise<AnalysisRecord | Record<string, never>>;
  /** When a top_suggestion carries section_id + content, render a one-click
   * "Apply" that writes it straight back (e.g. via viewsService.applyTailor). */
  onApplyFix?: (fix: { section_id: string; title?: string | null; content: any }) => Promise<void>;
}) {
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jd, setJd] = useState('');
  const [showJd, setShowJd] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set());

  const runAnalyze = useCallback(
    (jobDescription?: string): Promise<AnalysisRecord> =>
      analyze ? analyze(jobDescription) : careerService.analyzeResume(masterId!, jobDescription),
    [analyze, masterId],
  );
  const fetchAnalysis = useCallback(
    (): Promise<AnalysisRecord | Record<string, never>> =>
      getAnalysis ? getAnalysis() : careerService.getAnalysis(masterId!),
    [getAnalysis, masterId],
  );

  const loadLatest = useCallback(async () => {
    try {
      const r = (await fetchAnalysis()) as AnalysisRecord;
      if (r && (r as any).report) setRecord(r);
    } catch {
      /* none yet */
    }
  }, [fetchAnalysis]);

  useEffect(() => {
    if (open) void loadLatest();
  }, [open, loadLatest]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setAppliedIndices(new Set());
    try {
      setRecord(await runAnalyze(jd.trim() || undefined));
    } catch (e: any) {
      setError(e?.message || 'Analysis failed');
    } finally {
      setRunning(false);
    }
  };

  const applyFix = async (i: number, s: NonNullable<AnalysisReport['top_suggestions']>[number]) => {
    if (!onApplyFix || !s.section_id || s.content == null) return;
    setApplyingIndex(i);
    try {
      await onApplyFix({ section_id: s.section_id, title: s.title, content: s.content });
      setAppliedIndices((prev) => new Set(prev).add(i));
    } catch (e: any) {
      setError(e?.message || 'Could not apply that fix');
    } finally {
      setApplyingIndex(null);
    }
  };

  const report = record?.report;

  return (
    <>
      <div className={`fixed inset-0 z-[240] bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed top-0 right-0 z-[250] h-full w-[440px] max-w-[95vw] bg-card border-l border-border shadow-xl flex flex-col transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 h-[56px] border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="SparklesIcon" size={18} className="text-primary" />
            <span className="font-heading text-sm font-semibold text-foreground">AI Resume Analysis</span>
          </div>
          <button onClick={onClose} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <div className="p-3 border-b border-border flex-shrink-0 space-y-2">
          <button
            onClick={() => setShowJd((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-smooth"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="BriefcaseIcon" size={13} />
              Target a job description {jd.trim() ? <span className="text-primary">(added)</span> : <span className="opacity-70">(optional)</span>}
            </span>
            <Icon name="ChevronDownIcon" size={13} className={`transition-smooth ${showJd ? 'rotate-180' : ''}`} />
          </button>
          {showJd && (
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={5}
              placeholder="Paste the job description here to score ATS/keyword fit against a specific role…"
              className="w-full text-xs rounded-lg border border-border bg-background p-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <button onClick={run} disabled={running} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
            <Icon name="SparklesIcon" size={16} /> {running ? 'Analyzing…' : record ? 'Re-run analysis' : 'Analyze resume'}
          </button>
          {error && <p className="text-xs text-error mt-2">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-clean p-3 space-y-4">
          {!report && !running && (
            <div className="text-center py-12">
              <Icon name="ChartBarSquareIcon" size={30} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Run an analysis to get an ATS score, strengths, and specific fixes.</p>
              <p className="text-xs text-muted-foreground mt-1">Requires an AI key set in Config.</p>
            </div>
          )}
          {running && !report && <p className="text-sm text-muted-foreground text-center py-12 animate-pulse">Scoring your resume…</p>}

          {report && (
            <>
              <div className="flex gap-2">
                <ScoreBadge label="Overall" value={report.overall_score} />
                <ScoreBadge label="ATS" value={report.ats_score} />
              </div>

              {report.summary && <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">{report.summary}</p>}

              <div className="space-y-2">
                {DIMENSIONS.map((d) => {
                  const v = report[d.key] as number | undefined;
                  return (
                    <div key={String(d.key)}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{d.label}</span>
                        <span className={scoreColor(v)}>{v ?? '—'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${barColor(v)}`} style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {report.keyword_match && (
                <div className="space-y-2">
                  {!!report.keyword_match.missing?.length && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Missing keywords</p>
                      <div className="flex flex-wrap gap-1">
                        {report.keyword_match.missing.map((k, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30">{k}</span>)}
                      </div>
                    </div>
                  )}
                  {!!report.keyword_match.matched?.length && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Matched keywords</p>
                      <div className="flex flex-wrap gap-1">
                        {report.keyword_match.matched.map((k, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">{k}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!!report.top_suggestions?.length && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top suggestions</p>
                  {report.top_suggestions.map((s, i) => {
                    const canApply = !!(onApplyFix && s.section_id && s.content != null);
                    const applied = appliedIndices.has(i);
                    return (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">{s.title}</span>
                          {s.severity && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sevColor(s.severity)}`}>{s.severity}</span>}
                        </div>
                        {s.explanation && <p className="text-xs text-muted-foreground">{s.explanation}</p>}
                        {s.suggested_rewrite && <p className="text-xs text-success mt-1.5 bg-success/5 rounded-md p-2">{s.suggested_rewrite}</p>}
                        {canApply && (
                          <button
                            onClick={() => applyFix(i, s)}
                            disabled={applied || applyingIndex === i}
                            className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-smooth disabled:opacity-60 ${applied ? 'border-success/30 bg-success/5 text-success' : 'border-primary/30 text-primary hover:bg-primary/5'}`}
                          >
                            {applied ? <Icon name="CheckIcon" size={13} /> : applyingIndex === i ? <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Icon name="BoltIcon" size={13} />}
                            {applied ? 'Applied' : applyingIndex === i ? 'Applying…' : 'Apply this fix'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                {ISSUE_GROUPS.map((g) => <IssueGroup key={String(g.key)} label={g.label} items={report[g.key] as any} />)}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
