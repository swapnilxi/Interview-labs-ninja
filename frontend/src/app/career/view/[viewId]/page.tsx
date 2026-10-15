import { Suspense } from 'react';
import Header from '@/components/common/Header';
import ViewEditor from '@/modules/career-studio/views/ViewEditor';

export default async function ViewPage({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  return (
    <>
      <Header />
      {/* The editor keeps its Edit/Preview mode and open sub-screens in the URL, which needs a Suspense boundary above it. */}
      <Suspense
        fallback={
          <div className="pt-[60px] h-screen flex items-center justify-center bg-background">
            <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }
      >
        <ViewEditor viewId={viewId} />
      </Suspense>
    </>
  );
}
