'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/common/lab/Markdown';
import SectionContextPanel from '@/modules/common/lab/SectionContextPanel';
import AiError from '@/modules/common/lab/AiError';
import type { ContextMode } from '@/lib/services/labSectionsService';
import SectionProjectBar, { type SectionSaveInfo } from '@/modules/common/lab/project/SectionProjectBar';

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
  /** The learner customised this section in the lab settings: shows a small "Custom" badge. */
  customised?: boolean;
  /** Lets the user click to open the prompt/addon editor modal */
  onOpenPromptSettings?: () => void;
  /** Lets the pen's Regenerate run without typing anything (see SectionContextPanel). */
  allowEmptyRegenerate?: boolean;
  /** Draws the generated text itself (the Approaches tabs); the plain Markdown view is used when absent. */
  renderContent?: (content: string) => React.ReactNode;
  /** Adds the project strip under the text: the project it was written for and "Save to Project". */
  projectSave?: SectionSaveInfo;
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
  customised,
  onOpenPromptSettings,
  allowEmptyRegenerate,
  renderContent,
  projectSave,
  children,
}: OnDemandSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <div className="reading-card overflow-hidden p-0 transition-smooth mb-4 group/section">
      {/* ── Header ── (flat: a hairline under it once there is content, no band and no gradient) */}
      <div
        className={`flex items-center justify-between gap-x-3 gap-y-2 px-[1.25rem] max-sm:flex-wrap py-[0.875rem] transition-colors ${
          isGenerated ? 'border-b' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Section number pill */}
          <div
            className={`h-[1.5rem] w-[1.5rem] rounded-md flex items-center justify-center flex-shrink-0 text-xs font-semibold leading-none tabular-nums transition-colors
            ${isGenerated ? 'lab-tint lab-ink' : 'mix-bg-foreground/[0.06] text-muted-foreground'}`}
          >
            {String(sectionIndex).padStart(2, '0')}
          </div>

          {/* Icon + title */}
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
            ${isGenerated ? 'lab-tint' : 'mix-bg-foreground/[0.05]'}`}
          >
            <Icon
              name={icon as any}
              size={16}
              className={isGenerated ? 'text-primary' : 'text-muted-foreground'}
            />
          </div>

          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold leading-snug text-foreground">
              {title}
              {customised && (
                <span
                  title="Customised in this lab's settings"
                  className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md lab-tint lab-ink"
                >
                  Custom
                </span>
              )}
            </h3>
            {subtitle && (
              <p className="mt-0.5 break-words text-xs font-medium leading-snug text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {onOpenPromptSettings && (
            <button
              type="button"
              onClick={onOpenPromptSettings}
              title="Edit section prompt, add-ons & context"
              aria-label="Edit section prompt and configuration"
              className={`todo-focus relative p-1.5 rounded-lg transition-colors ${
                customised
                  ? 'lab-tint lab-ink hover:mix-bg-primary/[0.18]'
                  : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.06]'
              }`}
            >
              <Icon name="AdjustmentsHorizontalIcon" size={15} />
              {customised && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          )}
          {onGenerateWithContext && (
            <button
              type="button"
              onClick={() => setContextOpen((o) => !o)}
              title="Add context"
              aria-label="Add context to this section"
              aria-expanded={contextOpen}
              className={`todo-focus relative p-1.5 rounded-lg transition-colors ${
                contextOpen
                  ? 'lab-tint lab-ink'
                  : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.06]'
              }`}
            >
              <Icon name="PencilIcon" size={14} />
              {savedContext && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          )}
          {!isGenerated ? (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="todo-btn border mix-border-primary/30 lab-tint lab-ink hover:mix-bg-primary/[0.18] disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
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
                <span className="text-xs lab-ink flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  Updating…
                </span>
              ) : (
                <span className="text-xs text-success flex items-center gap-1 font-medium">
                  <Icon name="CheckCircleIcon" size={13} />
                  Done
                </span>
              )}
              {!children && (
                <button
                  onClick={() => setCollapsed((c) => !c)}
                  className="todo-focus p-1.5 rounded-lg hover:mix-bg-foreground/[0.06] transition-all text-muted-foreground hover:text-foreground"
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
          allowEmptyRegenerate={allowEmptyRegenerate}
          onOpenPromptSettings={onOpenPromptSettings}
          onSubmit={onGenerateWithContext}
          onClose={() => setContextOpen(false)}
        />
      )}

      {/* ── Content ── */}
      {isGenerated && !collapsed && (
        <div
          className={`p-5 animate-fade-in transition-opacity ${isGenerating ? 'opacity-60' : ''}`}
        >
          {children ??
            (renderContent ? renderContent(content ?? '') : <Markdown content={content ?? ''} />)}
        </div>
      )}

      {/* ── Project: which project it is for + Save to Project ── */}
      {projectSave && isGenerated && !collapsed && !children && !!content?.trim() && (
        <SectionProjectBar content={content} info={projectSave} busy={isGenerating} />
      )}

      {/* ── Generate failed ── */}
      {!isGenerated && !isGenerating && error && (
        <div className="px-[1.25rem] py-2.5 border-t mix-bg-error/5">
          <AiError message={error} />
        </div>
      )}

      {/* ── Locked state ── */}
      {!isGenerated && !isGenerating && (
        <div className="px-[1.25rem] pb-[1rem] flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
          <Icon name="LockClosedIcon" size={13} />
          <p>
            Click{' '}
            <span className="inline-flex items-center gap-1 align-middle font-semibold lab-ink">
              <Icon name="SparklesIcon" size={12} />
              Generate
            </span>{' '}
            to load this section on-demand
          </p>
        </div>
      )}
    </div>
  );
}
