'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useResumeStore } from './store/resumeStore';
import SectionBlock from './SectionBlock';
import SectionTypeMenu from './SectionTypeMenu';
import type { ResumeSection } from '../shared/types';

function SortableSection({ section }: { section: ResumeSection }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (
    <div ref={setNodeRef} style={style}>
      <SectionBlock section={section} isDragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

/** "Insert a section here" affordance between two rows (and above the first)
 * — same type menu as the bottom "Add section" button, just a small "+"
 * instead, so you're not limited to always appending at the end. Faintly
 * visible at rest (not opacity-0) rather than purely hover-revealed — a
 * fully invisible 12px strip was too easy to miss/mis-click; this stays
 * clickable and discoverable without needing to find it blind first. */
function InsertGap({ onInsert }: { onInsert: (sectionType: string, label: string) => void }) {
  return (
    <div className="group relative h-5 flex items-center justify-center">
      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-primary/50 transition-smooth" />
      <div className="relative z-10 opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-smooth">
        <SectionTypeMenu variant="inline" onPick={onInsert} />
      </div>
    </div>
  );
}

export default function SectionManager() {
  const sections = useResumeStore((s) => s.resume?.sections ?? []);
  const reorder = useResumeStore((s) => s.reorder);
  const insertSectionAt = useResumeStore((s) => s.insertSectionAt);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    void reorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div>
          {sections.length > 0 && <InsertGap onInsert={(type, label) => void insertSectionAt(0, type, label)} />}
          {sections.map((section, i) => (
            <div key={section.id}>
              <SortableSection section={section} />
              <InsertGap onInsert={(type, label) => void insertSectionAt(i + 1, type, label)} />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
