import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import CreateWorkbookModule from '@/modules/ai-lms/workbooks/CreateWorkbookModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{ classSlug: string }>;
}

export const metadata: Metadata = {
  title: 'New workbook | Lab Ninja',
  description: 'Turn a book, lesson, PDF or text into an interactive workbook.',
};

export default async function NewWorkbookPage({ params }: PageProps) {
  const { classSlug } = await params;
  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="wb-page">
          <CreateWorkbookModule classSlug={classSlug} />
        </main>
      </RequireAuth>
    </>
  );
}
