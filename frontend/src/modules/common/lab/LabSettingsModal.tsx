'use client';

import React, { useId } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { LabName } from '@/lib/services/labSectionsService';
import { LABS_CONFIG } from './labSectionDefaults';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                labMeta ? `${labMeta.bg} ${labMeta.border} border` : 'bg-primary/10 text-primary'
              }`}
            >
              <Icon
                name={labMeta ? (labMeta.icon as any) : 'AdjustmentsHorizontalIcon'}
                size={20}
                className={labMeta ? labMeta.color : 'text-primary'}
              />
            </div>
            <div>
              <h2 id={modalTitleId} className="text-base font-semibold text-foreground">
                {labMeta ? `${labMeta.shortName} Configuration` : 'Lab Settings & Prompt Management'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customize section prompts, prompt add-ons, and standing context.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
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
