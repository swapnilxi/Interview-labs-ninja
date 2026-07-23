'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface ParetoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  table: 'tasks' | 'quick_tasks' | 'project_nodes' | 'projects';
  itemId: number;
  paretoScore: number | null | undefined;
  isTop20: boolean | undefined;
  reason?: string;
  model?: 'ollama' | 'gemini';
  onUpdate: (updates: { pareto_score?: number | null; is_top_20?: boolean }) => void;
}

export default function ParetoModal({
  isOpen,
  onClose,
  title,
  table,
  itemId,
  paretoScore,
  isTop20,
  reason,
  model = 'gemini',
  onUpdate,
}: ParetoModalProps) {
  const [loading, setLoading] = useState(false);
  const [currentReason, setCurrentReason] = useState<string | undefined>(reason);

  if (!isOpen) return null;

  const scorePercent = paretoScore !== undefined && paretoScore !== null
    ? Math.round(paretoScore * 100)
    : null;

  const handleRescore = async () => {
    setLoading(true);
    try {
      const apiTable = table === 'projects' ? 'projects' : table;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'}/pareto/reanalyze/${apiTable}/${itemId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setCurrentReason(data.reason);
          onUpdate({
            pareto_score: data.pareto_score,
            is_top_20: data.is_top_20,
          });
        }
      }
    } catch (err) {
      console.error('Failed to re-score task', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md mx-4 p-5 animate-in zoom-in-95 duration-150 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-lg">
              ⭐
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-foreground">
                80/20 Pareto Analysis
              </h3>
              <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[260px]" title={title}>
                {title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Score Display Card */}
        <div className="bg-gradient-to-br from-amber-500/10 via-muted/30 to-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
                Leverage Score
              </span>
              <div className="text-3xl font-extrabold text-foreground mt-0.5">
                {scorePercent !== null ? `${scorePercent}%` : 'Not Scored'}
              </div>
            </div>
            <div>
              {isTop20 ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white px-3 py-1 rounded-full shadow-sm">
                  ⭐ Top 20% Task
                </span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  Standard Task
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden border border-border/30">
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-500 rounded-full"
              style={{ width: `${scorePercent || 0}%` }}
            />
          </div>

          {/* AI Reason (if present) */}
          {currentReason && (
            <div className="bg-card/70 border border-border/50 rounded-lg p-2.5 text-[11px] text-muted-foreground italic flex items-start gap-1.5">
              <span className="text-amber-500 shrink-0 mt-0.5">💡</span>
              <span className="leading-relaxed">"{currentReason}"</span>
            </div>
          )}
        </div>

        {/* Actions & Toggles */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleRescore}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>↺</span>
            )}
            {loading ? 'AI Analyzing Leverage...' : 'Re-calculate Pareto Score with AI'}
          </button>

          <label className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-smooth">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>⭐</span> Pin as Top 20% Priority Task
            </span>
            <input
              type="checkbox"
              checked={!!isTop20}
              onChange={(e) => onUpdate({ is_top_20: e.target.checked })}
              className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-muted-foreground text-center pt-1 border-t border-border/40">
          The 80/20 Principle focuses effort on the top 20% of tasks that create 80% of your results.
        </div>
      </div>
    </div>
  );
}
