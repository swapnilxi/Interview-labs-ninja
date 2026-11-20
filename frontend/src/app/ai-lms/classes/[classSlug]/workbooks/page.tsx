import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ classSlug: string }>;
}

/** The class's workbooks are a band of the class page; this address (a static segment, so never a subject) goes there. */
export default async function ClassWorkbooksPage({ params }: PageProps) {
  const { classSlug } = await params;
  redirect(`/ai-lms/classes/${encodeURIComponent(classSlug)}#workbooks`);
}
