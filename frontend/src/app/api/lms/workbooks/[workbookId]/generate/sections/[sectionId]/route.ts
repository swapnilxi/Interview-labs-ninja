import { handleGenerateSection } from 'fe-apis/lms/workbookHandlers';

// Twin of POST /api/lms/workbooks/{id}/generate/sections/{sectionId} in backend/modules/ai_lms/router.py. One AI call.
export const maxDuration = 300;

type Ctx = { params: Promise<{ workbookId: string; sectionId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { workbookId, sectionId } = await params;
  return handleGenerateSection(req, workbookId, sectionId);
}
