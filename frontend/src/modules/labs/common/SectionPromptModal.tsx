'use client';

import { useId } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import type { LabName, SectionSettings } from '@/lib/services/labSectionsService';
import { LABS_CONFIG, type SectionDef } from './labSectionDefaults';
import SectionPromptEditor from './SectionPromptEditor';

interface SectionPromptModalProps {
  lab: LabName;
  section: SectionDef;
  /** Current saved settings for this section (if any) */
  currentSettings?: SectionSettings;
  /** Lab-wide settings (for showing what also applies) */
  labWideSettings?: SectionSettings;
  /** Current page topic info if opened from within a lab */
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  /** That topic's own add-on and context (topic management). */
  topicSettings?: SectionSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: { prompt: string; addon: string; context: string }) => Promise<void>;
  onSaveAndGenerate?: (settings: {
    prompt: string;
    addon: string;
    context: string;
  }) => Promise<void>;
}

/** The quick edit of one section's settings, as a dialog over a lab page. The same editor is a page in lab management. */
export default function SectionPromptModal({
  lab,
  section,
  currentSettings,
  labWideSettings,
  currentTopic,
  topicSettings,
  isOpen,
  onClose,
  onSave,
  onSaveAndGenerate,
}: SectionPromptModalProps) {
  const titleId = useId();
  const labMeta = LABS_CONFIG[lab];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop={false}
      className="lab-page flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-lg"
    >
      <div className="flex items-start justify-between gap-3 border-b px-[1.5rem] py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {section.label}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {section.subtitle || `${labMeta.shortName} section`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="todo-focus flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="XMarkIcon" size={18} />
        </button>
      </div>
      <SectionPromptEditor
        lab={lab}
        section={section}
        currentSettings={currentSettings}
        labWideSettings={labWideSettings}
        currentTopic={currentTopic}
        topicSettings={topicSettings}
        variant="modal"
        onSave={onSave}
        onSaveAndGenerate={onSaveAndGenerate}
        onClose={onClose}
      />
    </Modal>
  );
}
