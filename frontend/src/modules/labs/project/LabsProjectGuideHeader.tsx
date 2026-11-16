'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabGuideModal from '@/modules/labs/common/LabGuideModal';

export default function LabsProjectGuideHeader() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <div className="mb-[1.5rem] flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="lab-tile hidden h-[2.75rem] w-[2.75rem] flex-shrink-0 sm:inline-flex">
            <Icon name="FolderOpenIcon" size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-heading text-[1.5rem] font-bold leading-tight tracking-[-0.022em] text-foreground">
                Labs Project
              </h1>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="todo-focus inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Open Labs Project Guide: How to use"
              >
                <Icon name="BookOpenIcon" size={13} className="lab-ink flex-shrink-0" />
                Guide
              </button>
            </div>
            <p className="mt-0.5 text-sm mix-text-foreground/[0.68]">
              Give labs context. Save the answers that matter.
            </p>
          </div>
        </div>
      </div>

      <LabGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        initialLab="labs_project"
      />
    </>
  );
}
