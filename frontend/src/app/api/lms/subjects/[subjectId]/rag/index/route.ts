import { handleBuildRagIndex, handleClearRagIndex, handleGetRagIndexStatus } from 'fe-apis/lms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleBuildRagIndex(subjectId, req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleClearRagIndex(subjectId, req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleGetRagIndexStatus(subjectId, req);
}
