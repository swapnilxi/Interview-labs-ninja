import { handleGenerateOutline } from 'fe-apis/lms/workbookHandlers';

// Twin of POST /api/lms/workbooks/{id}/generate/outline in backend/modules/ai_lms/router.py. One AI call.
export const maxDuration = 300;

type Ctx = { params: Promise<{ workbookId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleGenerateOutline(req, workbookId);
}
