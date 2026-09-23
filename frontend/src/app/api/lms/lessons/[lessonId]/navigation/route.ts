import { handleGetLessonNavigation } from 'fe-apis/lms';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  return handleGetLessonNavigation(lessonId);
}
