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
          <div aria-hidden="true" className="lab-tile h-[2.75rem] w-[2.75rem]">
            <Icon name="FolderOpenIcon" size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                Labs Project
              </h1>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70 transition-colors shadow-2xs cursor-pointer"
                title="Open Labs Project Guide: How to use"
              >
                <Icon name="BookOpenIcon" size={12} className="text-primary flex-shrink-0" />
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
