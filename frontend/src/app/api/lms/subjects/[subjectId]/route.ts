import { handleUpdateSubject, handleDeleteSubject } from 'fe-apis/lms';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleUpdateSubject(subjectId, req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleDeleteSubject(subjectId, req);
}
