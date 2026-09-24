import { handleListSubjectLessons } from 'fe-apis/lms';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleListSubjectLessons(subjectId);
}
