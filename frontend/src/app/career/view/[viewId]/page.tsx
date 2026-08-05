import Header from '@/components/common/Header';
import ViewEditor from '@/modules/career/ViewEditor';

export default async function ViewPage({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  return (
    <>
      <Header />
      <ViewEditor viewId={viewId} />
    </>
  );
}
