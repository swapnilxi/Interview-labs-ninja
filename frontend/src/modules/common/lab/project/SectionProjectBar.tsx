'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import {
  sectionHref,
  type LabProject,
  type ProjectSection,
} from '@/lib/services/labProjectsService';
import SaveToProjectDialog, {
  type SaveSource,
} from '@/modules/common/lab/project/SaveToProjectDialog';
import { useLabProjects } from '@/modules/common/lab/project/useLabProjects';

/** What a lab tells its section card so the card can offer "Save to Project" (the text itself is the card's own). */
export type SectionSaveInfo = Omit<SaveSource, 'content'>;

/**
 * The strip under a generated lab section: which project it was written for (when it was written for
 * one), and the explicit "Save to Project" action. Saving is always the user's choice, never automatic.
 */
export default function SectionProjectBar({
  content,
  info,
  busy = false,
}: {
  content: string;
  info: SectionSaveInfo;
  /** The section is being regenerated: saving the old text now would be confusing. */
  busy?: boolean;
}) {
  const { allProjects, selected } = useLabProjects();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ project: LabProject; section: ProjectSection } | null>(null);

  // New text (regenerated or edited) is not what was saved a moment ago.
  useEffect(() => setSaved(null), [content]);

  const forId = info.generatedForProjectId ?? null;
  const forProject = forId !== null ? allProjects.find((p) => p.id === forId) : undefined;
  const differs = forId !== (selected?.id ?? null);

  let chip: string | null = null;
  if (forId !== null)
    chip = forProject ? `Written for ${forProject.name}` : 'Written for a deleted project';

  let hint: string | null = null;
  if (selected && differs) {
    hint =
      forId === null
        ? `Written without a project. Use the pen to rewrite it for “${selected.name}”.`
        : `Use the pen to rewrite it for “${selected.name}”.`;
  } else if (!selected && forId !== null) {
    hint = 'No project is selected now: regenerating will give a general answer.';
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 mix-bg-muted/20">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
        {chip && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border mix-border-primary/30 mix-bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Icon name="FolderOpenIcon" size={12} className="flex-shrink-0" />
            <span className="truncate">{chip}</span>
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {saved && (
          <span className="text-xs text-success" role="status">
            Saved to {saved.project.name} ·{' '}
            <Link
              href={sectionHref(saved.project.id, saved.section.id)}
              className="font-semibold underline underline-offset-2"
            >
              Open section
            </Link>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy || !content.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg border mix-border-primary/30 mix-bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:mix-bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="BookmarkIcon" size={13} />
        Save to Project
      </button>

      <SaveToProjectDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        source={{ ...info, content }}
        onSaved={(project, section) => setSaved({ project, section })}
      />
    </div>
  );
}
