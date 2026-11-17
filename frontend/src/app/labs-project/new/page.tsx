import { Suspense } from 'react';
import type { Metadata } from 'next';
import LabsProjectFrame from '@/modules/labs/project/LabsProjectFrame';
import ProjectForm from '@/modules/labs/project/ProjectForm';

export const metadata: Metadata = {
  title: 'New project — Labs Project — InterviewNinja',
  description:
    'Create a project: a name, a line about it and the context every lab can generate with.',
};

export default function NewProjectPage() {
  return (
    <LabsProjectFrame>
      {/* the chosen example is read from the URL (useSearchParams), which needs a Suspense boundary */}
      <Suspense
        fallback={
          <div className="py-[3rem] text-center text-sm text-muted-foreground">Loading…</div>
        }
      >
        <ProjectForm />
      </Suspense>
    </LabsProjectFrame>
  );
}
