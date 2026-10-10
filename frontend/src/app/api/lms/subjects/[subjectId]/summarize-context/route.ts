import { handleSummarizeContext, handleClearContextSummary } from 'fe-apis/lms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleSummarizeContext(subjectId, req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params;
  return handleClearContextSummary(subjectId, req);
}
