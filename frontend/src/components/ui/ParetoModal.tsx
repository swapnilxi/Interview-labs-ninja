'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import { paretoService, ParetoTable } from '@/lib/services/paretoService';
import { withPeriod } from '@/lib/services/todoService';

interface ParetoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  table: ParetoTable;
  itemId: number;
  paretoScore: number | null | undefined;
  isTop20: boolean | undefined;
  paretoLocked?: boolean;
  reason?: string | null;
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
  paretoLocked,
  reason,
  model = 'gemini',
  onUpdate,
}: ParetoModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentReason, setCurrentReason] = useState<string | undefined | null>(reason);
  const [locked, setLocked] = useState(!!paretoLocked);

  if (!isOpen) return null;

  const scorePercent = paretoScore !== undefined && paretoScore !== null
    ? Math.round(paretoScore * 100)
    : null;

  const handleRescore = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paretoService.reanalyze(table, itemId, model);
      if (data.status === 'success') {
        setCurrentReason(data.reason);
        setLocked(false); // re-scoring is an explicit user action; it unlocks any manual pin
        onUpdate({
          pareto_score: data.pareto_score,
          is_top_20: data.is_top_20,
        });
      }
    } catch (err) {
      console.error('Failed to re-score task', err);
      // Used to be console-only, so a failed (or guest) re-score just looked like nothing happened.
      setError(withPeriod(err instanceof Error ? err.message : "Couldn't re-score this item"));
    } finally {
      setLoading(false);
    }
  };

  const handleManualToggle = (checked: boolean) => {
    setLocked(true); // manual toggles always lock — mirrors the backend's PATCH behavior
    onUpdate({ is_top_20: checked });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="pareto-modal-title"
      className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b mix-border-border/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <FlatIcon name="star" size={22} />
          </div>
          <div>
            <h3 id="pareto-modal-title" className="font-heading font-bold text-sm text-foreground">
              80/20 Pareto Analysis
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]" title={title}>
              {title}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
        >
          <Icon name="XMarkIcon" size={16} />
        </button>
      </div>

      {/* Score Display Card */}
      <div className="bg-gradient-to-br from-amber-500/10 via-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] to-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
              Leverage Score
            </span>
            <div className="text-3xl font-extrabold text-foreground mt-0.5">
              {scorePercent !== null ? `${scorePercent}%` : 'Not Scored'}
            </div>
          </div>
          <div>
            {isTop20 && locked ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold bg-gradient-to-r from-sky-500 to-sky-600 text-white px-3 py-1 rounded-full shadow-sm"
                title="Manually pinned — AI re-analysis will never overwrite this unless you re-score it yourself"
              >
                <FlatIcon name="pin" size={14} /> Manually Pinned
              </span>
            ) : isTop20 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white px-3 py-1 rounded-full shadow-sm">
                <FlatIcon name="star" size={14} /> Top 20% Task
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                Standard Task
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full mix-bg-muted/60 rounded-full h-2 overflow-hidden border mix-border-border/30">
          <div
            className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-500 rounded-full"
            style={{ width: `${scorePercent || 0}%` }}
          />
        </div>

        {/* AI Reason (if present) */}
        {currentReason && (
          <div className="mix-bg-card/70 border mix-border-border/50 rounded-lg p-2.5 text-xs text-muted-foreground italic flex items-start gap-1.5">
            <FlatIcon name="idea" size={16} className="mt-0.5" />
            <span className="leading-relaxed">"{currentReason}"</span>
          </div>
        )}
      </div>

      {/* Actions & Toggles */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleRescore}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:mix-bg-primary/90 transition-smooth flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Icon name="ArrowPathIcon" size={14} />
          )}
          {loading ? 'AI Analyzing Leverage...' : 'Re-calculate Pareto Score with AI'}
        </button>
        {error && (
          <div role="alert" className="todo-alert todo-alert-error">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">{error}</p>
          </div>
        )}

        <label className="flex items-center justify-between p-3 rounded-xl border mix-border-border/80 mix-bg-muted/20 hover:mix-bg-muted/40 cursor-pointer transition-smooth">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FlatIcon name="pin" size={16} /> Mark as Top 20% manually
          </span>
          <input
            type="checkbox"
            checked={!!isTop20}
            onChange={(e) => handleManualToggle(e.target.checked)}
            className="w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-500 cursor-pointer"
          />
        </label>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted-foreground text-center pt-1 border-t mix-border-border/40">
        {locked && isTop20
          ? 'Manually pinned — safe from AI re-analysis until you unlock it by re-scoring.'
          : 'The 80/20 Principle focuses effort on the top 20% of tasks that create 80% of your results.'}
      </div>
    </Modal>
  );
}
