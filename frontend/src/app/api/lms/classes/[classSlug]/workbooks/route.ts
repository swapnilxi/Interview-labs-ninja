import { handleCreateWorkbook, handleListWorkbooks } from 'fe-apis/lms/workbookHandlers';

// Twin of GET/POST /api/lms/classes/{class}/workbooks in backend/modules/ai_lms/router.py.
type Ctx = { params: Promise<{ classSlug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleListWorkbooks(req, classSlug);
}

export async function POST(req: Request, { params }: Ctx) {
  const { classSlug } = await params;
  return handleCreateWorkbook(req, classSlug);
}
