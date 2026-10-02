import { handleSuggestProjectPlacement } from 'fe-apis/lms';

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return handleSuggestProjectPlacement(projectId, req);
}
