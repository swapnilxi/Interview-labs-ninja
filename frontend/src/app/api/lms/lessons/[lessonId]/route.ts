import { handleGetLesson, handleUpdateLesson, handleDeleteLesson } from 'fe-apis/lms';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  return handleGetLesson(lessonId, req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  return handleUpdateLesson(lessonId, req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  return handleDeleteLesson(lessonId, req);
}
