import {
  handleDeleteWorkbook,
  handleGetWorkbook,
  handleUpdateWorkbook,
} from 'fe-apis/lms/workbookHandlers';

// Twin of GET/PATCH/DELETE /api/lms/workbooks/{id} in backend/modules/ai_lms/router.py.
type Ctx = { params: Promise<{ workbookId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleGetWorkbook(req, workbookId);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleUpdateWorkbook(req, workbookId);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleDeleteWorkbook(req, workbookId);
}
