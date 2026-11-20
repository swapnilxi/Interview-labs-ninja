import {
  handleGetProgress,
  handleResetProgress,
  handleSaveProgress,
} from 'fe-apis/lms/workbookHandlers';

// Twin of GET/PUT/DELETE /api/lms/workbooks/{id}/progress in backend/modules/ai_lms/router.py: the caller's own answers.
type Ctx = { params: Promise<{ workbookId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleGetProgress(req, workbookId);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleSaveProgress(req, workbookId);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleResetProgress(req, workbookId);
}
