'use client';

import { useResumeStore } from './store/resumeStore';
import SectionManager from './SectionManager';
import SectionTypeMenu from './SectionTypeMenu';

export default function ResumeEditor() {
  const addSection = useResumeStore((s) => s.addSection);

  return (
    <div className="space-y-4">
      <SectionManager />
      <SectionTypeMenu variant="full" label="Add section" onPick={(type, label) => void addSection(type, label)} />
    </div>
  );
}
