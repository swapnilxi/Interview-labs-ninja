'use client';

/**
 * Shared "cover image" for a template: a non-interactive, scaled-down live
 * render of its spec (same portfolioPreviewHtml/resumePreviewHtml the
 * Template Designer uses), plus a selectable grid-card wrapper around it.
 * Used by the Templates gallery and every "pick a template" grid (the
 * Portfolios/Resumes tab's "Generate a new …" picker, the view editor's
 * Template switcher, and the New-view modal) so they all look like one
 * consistent grid of cover-image cards instead of plain text buttons.
 */

import Icon from '@/components/ui/AppIcon';
import type { ViewKind } from '../shared/types';
import { portfolioPreviewHtml, resumePreviewHtml } from './templatePreview';

export function TemplatePreviewThumb({ kind, spec }: { kind: ViewKind; spec: any }) {
  const src = kind === 'portfolio' ? portfolioPreviewHtml(spec) : resumePreviewHtml(spec);
  return (
    <iframe
      title="template preview"
      srcDoc={src}
      tabIndex={-1}
      scrolling="no"
      className="pointer-events-none origin-top-left"
      style={{ width: '250%', height: '250%', transform: 'scale(0.4)', border: 0 }}
    />
  );
}

export function TemplatePickerCard({
  kind, name, spec, selected, busy, disabled, onClick, onEdit,
}: {
  kind: ViewKind;
  name: string;
  /** Undefined when only the built-in id/name fallback loaded (no live spec yet) — shows a plain placeholder instead of a misleading preview. */
  spec?: any;
  selected?: boolean;
  /** This specific card is mid-action — shows a spinner over the thumbnail. */
  busy?: boolean;
  /** Disabled (e.g. a sibling card is busy) without the spinner. */
  disabled?: boolean;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="relative group/tpl">
      <button
        onClick={onClick}
        disabled={busy || disabled}
        className={`w-full rounded-lg border overflow-hidden text-left transition-smooth disabled:opacity-60 ${
          selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-primary/50'
        }`}
      >
        <div className="relative h-20 bg-white overflow-hidden">
          {spec ? (
            <TemplatePreviewThumb kind={kind} spec={spec} />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground/50"><Icon name="SwatchIcon" size={20} /></div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className={`px-2 py-1.5 text-xs font-medium truncate ${selected ? 'text-primary bg-primary/10' : 'text-foreground bg-card'}`}>{name}</div>
      </button>
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          disabled={busy || disabled}
          title={`Edit ${name}`}
          className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-card border border-border text-muted-foreground opacity-0 group-hover/tpl:opacity-100 hover:text-primary hover:border-primary transition-smooth disabled:opacity-0"
        >
          <Icon name="PencilSquareIcon" size={10} />
        </button>
      )}
    </div>
  );
}
