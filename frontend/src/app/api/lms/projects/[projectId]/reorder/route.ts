import { handleReorderProjectPlan } from 'fe-apis/lms';

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return handleReorderProjectPlan(projectId, req);
}
