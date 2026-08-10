'use client';

import Icon from '@/components/ui/AppIcon';
import type { GapAnalysis } from '../shared/types';

/** Fit-score ring + matched/missing/ATS/recommendations breakdown. Shared by the
 * Generate tab (after tailoring a resume) and the Job Matcher (standalone fit check). */
export default function GapAnalysisResult({ gapAnalysis }: { gapAnalysis: GapAnalysis }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0"
          style={{ background: `conic-gradient(var(--color-primary) ${(gapAnalysis.fit_score ?? 0) * 3.6}deg, var(--color-muted) 0deg)` }}
        >
          <div className="w-11 h-11 rounded-full bg-card flex items-center justify-center text-sm font-semibold text-foreground">{gapAnalysis.fit_score ?? 0}</div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Job fit score</p>
          {gapAnalysis.experience_gap && <p className="text-xs text-muted-foreground">{gapAnalysis.experience_gap}</p>}
        </div>
      </div>

      {(gapAnalysis.matched_skills?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Matched skills</p>
          <div className="flex flex-wrap gap-1.5">
            {(gapAnalysis.matched_skills ?? []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success/10 text-success"><Icon name="CheckIcon" size={11} />{s}</span>
            ))}
          </div>
        </div>
      )}

      {(gapAnalysis.missing_skills?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Missing skills</p>
          <div className="flex flex-wrap gap-1.5">
            {(gapAnalysis.missing_skills ?? []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning"><Icon name="ExclamationTriangleIcon" size={11} />{s}</span>
            ))}
          </div>
        </div>
      )}

      {(gapAnalysis.missing_certifications?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Missing certifications</p>
          <div className="flex flex-wrap gap-1.5">
            {(gapAnalysis.missing_certifications ?? []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning"><Icon name="CheckBadgeIcon" size={11} />{s}</span>
            ))}
          </div>
        </div>
      )}

      {(gapAnalysis.ats_keywords_missing?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">ATS keywords to add</p>
          <div className="flex flex-wrap gap-1.5">
            {(gapAnalysis.ats_keywords_missing ?? []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}

      {(gapAnalysis.recommendations?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Recommendations</p>
          <ul className="space-y-1">
            {(gapAnalysis.recommendations ?? []).map((r, i) => (
              <li key={i} className="text-xs text-foreground flex items-start gap-1.5"><Icon name="LightBulbIcon" size={13} className="text-primary shrink-0 mt-0.5" />{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
