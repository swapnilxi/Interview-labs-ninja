import { buildGenerationRef } from '@/lib/services/labProjectsService';
import type { LabName, LabPage } from '@/lib/services/labSectionsService';
import type { SectionState } from '@/modules/common/lab/useLabSections';
import type { SectionSaveInfo } from '@/modules/common/lab/project/SectionProjectBar';

/** The lab names as users see them (what a saved project section shows as its source). */
export const LAB_DISPLAY_NAMES: Record<LabName, string> = {
  dsa: 'DSA Lab',
  cv: 'CV Lab',
  system_design: 'System Design Lab',
};

/**
 * What a lab section card needs to offer "Save to Project": a suggested title, where the text came from,
 * and which project (if any) it was written for. `state` is the section's `SectionState`.
 */
export function sectionSaveInfo(args: {
  lab: LabName;
  topic: LabPage;
  subtopic: LabPage | null;
  sectionId: string;
  sectionLabel: string;
  state: Partial<SectionState>;
}): SectionSaveInfo {
  const { lab, topic, subtopic, sectionId, sectionLabel, state } = args;
  return {
    defaultTitle: `${sectionLabel} — ${subtopic?.name ?? topic.name}`.slice(0, 200),
    sourceLabId: lab,
    sourceLabName: LAB_DISPLAY_NAMES[lab],
    sourceGenerationId: buildGenerationRef(
      lab,
      topic.id,
      subtopic?.id ?? '',
      sectionId,
      state.updatedAt
    ),
    generatedForProjectId: state.projectId ?? null,
  };
}
