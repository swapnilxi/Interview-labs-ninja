'use client';

import React, { useId } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { LabName } from '@/lib/services/labSectionsService';
import { LABS_CONFIG, labTileStyle } from './labSectionDefaults';
import LabSettingsManager from './LabSettingsManager';

interface LabSettingsModalProps {
  lab?: LabName;
  isOpen: boolean;
  onClose: () => void;
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  onSectionUpdated?: (sectionId: string) => void;
}

export default function LabSettingsModal({
  lab,
  isOpen,
  onClose,
  currentTopic,
  onSectionUpdated,
}: LabSettingsModalProps) {
  const modalTitleId = useId();
  if (!isOpen) return null;

  const labMeta = lab ? LABS_CONFIG[lab] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="lab-page relative w-full max-w-4xl bg-card border border-border rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-[1.5rem] py-4 border-b">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lab-tile h-9 w-9" style={labTileStyle(lab)}>
              <Icon
                name={labMeta ? (labMeta.icon as any) : 'AdjustmentsHorizontalIcon'}
                size={20}
              />
            </div>
            <div className="min-w-0">
              <h2 id={modalTitleId} className="text-base font-semibold text-foreground">
                {labMeta ? `${labMeta.shortName} Configuration` : 'Lab Settings & Prompt Management'}
              </h2>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                Customize section prompts, prompt add-ons, and standing context.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="todo-focus flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.06] transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-[1.5rem] overflow-y-auto flex-1">
          <LabSettingsManager
            initialLab={lab || 'dsa'}
            fixedLab={lab}
            currentTopic={currentTopic}
            onSectionUpdated={onSectionUpdated}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
