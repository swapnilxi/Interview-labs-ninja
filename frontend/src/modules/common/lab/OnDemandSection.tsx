'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/common/lab/Markdown';
import SectionContextPanel from '@/modules/common/lab/SectionContextPanel';
import AiError from '@/modules/common/lab/AiError';
import type { ContextMode } from '@/lib/services/labSectionsService';

interface OnDemandSectionProps {
  sectionIndex: number;
  icon: string;
  title: string;
  subtitle?: string;
  content: string | null;
  isGenerating: boolean;
  isGenerated: boolean;
  onGenerate: () => void;
  /** Enables the pen button + context box. Should reject with a readable message on failure. */
  onGenerateWithContext?: (context: string, mode: ContextMode) => Promise<void>;
  /** Context saved with the current content; pre-fills the box and marks the pen. */
  savedContext?: string;
  /** Why the last Generate failed; shown above the "locked" hint until the section is generated. */
  error?: string | null;
  children?: React.ReactNode; // for custom render (e.g. quiz)
}

export default function OnDemandSection({
  sectionIndex,
  icon,
  title,
  subtitle,
  content,
  isGenerating,
  isGenerated,
  onGenerate,
  onGenerateWithContext,
  savedContext,
  error,
  children,
}: OnDemandSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <div className="reading-card overflow-hidden transition-smooth mb-4 group/section">
      {/* ── Header ── */}
      <div
        className={`flex items-center justify-between px-4 py-3.5 border-b border-border transition-colors
          ${isGenerated ? 'bg-gradient-to-r from-surface to-card' : 'bg-surface/40'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Section number pill */}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold leading-none transition-colors
            ${isGenerated ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/60'}`}>
            {String(sectionIndex).padStart(2, '0')}
          </div>

          {/* Icon + title */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
            ${isGenerated ? 'bg-primary/10' : 'bg-muted/60'}`}>
            <Icon name={icon as any} size={16} className={isGenerated ? 'text-primary' : 'text-muted-foreground/50'} />
          </div>

          <div className="min-w-0">
            <h3 className={`text-sm font-semibold leading-tight transition-colors
              ${isGenerated ? 'text-foreground' : 'text-foreground/70'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {onGenerateWithContext && (
            <button
              type="button"
              onClick={() => setContextOpen((o) => !o)}
              title="Add context"
              aria-label="Add context to this section"
              aria-expanded={contextOpen}
              className={`relative p-1.5 rounded-lg transition-colors ${
                contextOpen ? 'mix-bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon name="PencilIcon" size={14} />
              {savedContext && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          )}
          {!isGenerated ? (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 hover:border-primary/40
                disabled:opacity-50 disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
                  Generating…
                </>
              ) : (
                <>
                  <Icon name="SparklesIcon" size={13} />
                  Generate
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <span className="text-[11px] text-primary flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  Updating…
                </span>
              ) : (
                <span className="text-[11px] text-success flex items-center gap-1 font-medium">
                  <Icon name="CheckCircleIcon" size={13} />
                  Done
                </span>
              )}
              {!children && (
                <button
                  onClick={() => setCollapsed(c => !c)}
                  className="p-1.5 rounded-lg hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground"
                  title={collapsed ? 'Expand' : 'Collapse'}
                >
                  <Icon name={collapsed ? 'ChevronDownIcon' : 'ChevronUpIcon'} size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Context box (pen) ── */}
      {contextOpen && onGenerateWithContext && (
        <SectionContextPanel
          initialContext={savedContext ?? ''}
          hasContent={isGenerated && !!content?.trim()}
          busy={isGenerating}
          onSubmit={onGenerateWithContext}
          onClose={() => setContextOpen(false)}
        />
      )}

      {/* ── Content ── */}
      {isGenerated && !collapsed && (
        <div className={`p-5 animate-fade-in transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
          {children ?? <Markdown content={content ?? ''} />}
        </div>
      )}

      {/* ── Generate failed ── */}
      {!isGenerated && !isGenerating && error && (
        <div className="px-4 py-2.5 border-t border-border mix-bg-error/10">
          <AiError message={error} />
        </div>
      )}

      {/* ── Locked state ── */}
      {!isGenerated && !isGenerating && (
        <div className="px-4 py-3 flex items-center gap-2.5 text-muted-foreground/60 bg-muted/20">
          <Icon name="LockClosedIcon" size={13} />
          <p className="text-xs">Click <span className="text-primary font-medium">Generate ✨</span> to load this section on-demand</p>
        </div>
      )}
    </div>
  );
}
