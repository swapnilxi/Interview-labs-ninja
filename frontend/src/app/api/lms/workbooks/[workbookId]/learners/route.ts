import { handleListLearners } from 'fe-apis/lms/workbookHandlers';

// Twin of GET /api/lms/workbooks/{id}/learners (instructors only; names, percentages and dates, never answers).
type Ctx = { params: Promise<{ workbookId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { workbookId } = await params;
  return handleListLearners(req, workbookId);
}
