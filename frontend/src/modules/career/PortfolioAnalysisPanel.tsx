'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { portfolioService } from '@/lib/services/portfolioService';
import type { AnalysisRecord } from './types';

const DIMENSIONS: { key: string; label: string }[] = [
  { key: 'design_score', label: 'Design' },
  { key: 'ux_score', label: 'UX' },
  { key: 'content_score', label: 'Content' },
  { key: 'seo_score', label: 'SEO' },
  { key: 'accessibility_score', label: 'Accessibility' },
  { key: 'personal_branding_score', label: 'Personal branding' },
  { key: 'navigation_score', label: 'Navigation' },
  { key: 'responsiveness_score', label: 'Responsiveness' },
  { key: 'recruiter_friendliness_score', label: 'Recruiter-friendliness' },
];

const ISSUE_GROUPS = [
  { key: 'missing_sections', label: 'Missing sections' },
  { key: 'content_gaps', label: 'Content gaps' },
  { key: 'branding_issues', label: 'Branding issues' },
  { key: 'red_flags', label: 'Red flags' },
];

const sc = (n?: number) => (n == null ? 'text-muted-foreground' : n >= 80 ? 'text-success' : n >= 60 ? 'text-warning' : 'text-error');
const bc = (n?: number) => (n == null ? 'bg-muted' : n >= 80 ? 'bg-success' : n >= 60 ? 'bg-warning' : 'bg-error');
const sev = (s?: string) => (s === 'high' ? 'bg-error/10 text-error border-error/30' : s === 'medium' ? 'bg-warning/10 text-warning border-warning/30' : 'bg-muted text-muted-foreground border-border');

function IssueGroup({ label, items }: { label: string; items?: Array<{ text?: string; suggestion?: string }> }) {
  const [open, setOpen] = useState(false);
  const list = (items || []).filter((i) => i && (i.text || i.suggestion));
  if (!list.length) return null;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 bg-card hover:bg-muted">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2"><span className="text-xs bg-error/10 text-error rounded-full px-2 py-0.5">{list.length}</span><Icon name="ChevronDownIcon" size={14} className={`transition-smooth ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && (
        <div className="p-2 space-y-2 bg-background/50">
          {list.map((it, i) => (
            <div key={i} className="rounded-md border border-border p-2.5 text-xs">
              {it.text && <p className="text-foreground">{it.text}</p>}
              {it.suggestion && <p className="text-success mt-1 flex gap-1"><Icon name="ArrowRightIcon" size={12} className="flex-shrink-0 mt-0.5" /><span>{it.suggestion}</span></p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortfolioAnalysisPanel({ masterId, open, onClose }: { masterId: string; open: boolean; onClose: () => void }) {
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const r = (await portfolioService.getAnalysis(masterId)) as AnalysisRecord;
      if (r && (r as any).report) setRecord(r);
    } catch {
      /* none */
    }
  }, [masterId]);

  useEffect(() => {
    if (open) void loadLatest();
  }, [open, loadLatest]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setRecord(await portfolioService.analyzePortfolio(masterId));
    } catch (e: any) {
      setError(e?.message || 'Analysis failed');
    } finally {
      setRunning(false);
    }
  };

  const report = record?.report;

  return (
    <>
      <div className={`fixed inset-0 z-[240] bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed top-0 right-0 z-[250] h-full w-[440px] max-w-[95vw] bg-card border-l border-border shadow-xl flex flex-col transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 h-[56px] border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2"><Icon name="SparklesIcon" size={18} className="text-primary" /><span className="font-heading text-sm font-semibold text-foreground">AI Portfolio Analysis</span></div>
          <button onClick={onClose} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>
        <div className="p-3 border-b border-border flex-shrink-0">
          <button onClick={run} disabled={running} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
            <Icon name="SparklesIcon" size={16} /> {running ? 'Analyzing…' : record ? 'Re-run analysis' : 'Analyze portfolio'}
          </button>
          {error && <p className="text-xs text-error mt-2">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-clean p-3 space-y-4">
          {!report && !running && (
            <div className="text-center py-12"><Icon name="ChartBarSquareIcon" size={30} className="text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Run an analysis for design/UX/branding scores and fixes.</p><p className="text-xs text-muted-foreground mt-1">Requires an AI key in Config.</p></div>
          )}
          {running && !report && <p className="text-sm text-muted-foreground text-center py-12 animate-pulse">Reviewing your portfolio…</p>}
          {report && (
            <>
              <div className="rounded-xl border border-border p-4 text-center">
                <div className={`text-3xl font-bold ${sc(report.overall_score)}`}>{report.overall_score ?? '—'}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">Overall</div>
              </div>
              {report.summary && <p className="text-sm text-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">{report.summary}</p>}
              <div className="space-y-2">
                {DIMENSIONS.map((d) => {
                  const v = report[d.key] as number | undefined;
                  return (
                    <div key={d.key}>
                      <div className="flex items-center justify-between text-xs mb-0.5"><span className="text-muted-foreground">{d.label}</span><span className={sc(v)}>{v ?? '—'}</span></div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${bc(v)}`} style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              {!!report.top_suggestions?.length && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top suggestions</p>
                  {report.top_suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1"><span className="text-sm font-medium text-foreground">{s.title}</span>{s.severity && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sev(s.severity)}`}>{s.severity}</span>}</div>
                      {s.explanation && <p className="text-xs text-muted-foreground">{s.explanation}</p>}
                      {s.suggested_rewrite && <p className="text-xs text-success mt-1.5 bg-success/5 rounded-md p-2">{s.suggested_rewrite}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">{ISSUE_GROUPS.map((g) => <IssueGroup key={g.key} label={g.label} items={report[g.key] as any} />)}</div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
