'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabGuideModal from '@/modules/common/lab/LabGuideModal';

export default function LabsProjectGuideHeader() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <div className="mb-[1.5rem] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="lab-tile hidden h-[2.75rem] w-[2.75rem] sm:inline-flex">
            <Icon name="FolderOpenIcon" size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-2xl sm:font-semibold">
                Labs Project
              </h1>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
                title="Open Labs Project Guide: How to use"
              >
                <Icon name="BookOpenIcon" size={14} className="lab-ink flex-shrink-0" />
                <span>Guide</span>
              </button>
            </div>
            <p className="mt-1 text-sm font-medium mix-text-foreground/[0.74]">
              Projects, their context, and what you saved from the labs.
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
