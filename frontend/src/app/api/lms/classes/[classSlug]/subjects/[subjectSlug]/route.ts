import { handleGetSubject } from 'fe-apis/lms';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ classSlug: string; subjectSlug: string }> }
) {
  const { classSlug, subjectSlug } = await params;
  return handleGetSubject(classSlug, subjectSlug);
}
