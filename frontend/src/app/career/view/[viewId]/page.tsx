import Header from '@/components/common/Header';
import ViewEditor from '@/modules/career-studio/views/ViewEditor';

export default async function ViewPage({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  return (
    <>
      <Header />
      <ViewEditor viewId={viewId} />
    </>
  );
}
