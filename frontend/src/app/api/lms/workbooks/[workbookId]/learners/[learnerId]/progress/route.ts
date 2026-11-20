import { handleResetLearner } from 'fe-apis/lms/workbookHandlers';

// Twin of DELETE /api/lms/workbooks/{id}/learners/{learnerId}/progress (an instructor resets one learner).
type Ctx = { params: Promise<{ workbookId: string; learnerId: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  const { workbookId, learnerId } = await params;
  return handleResetLearner(req, workbookId, learnerId);
}
