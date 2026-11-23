import { handleGetQuestionTopicOperation } from 'fe-apis/lms/questionTopicHandlers';

type Ctx = { params: Promise<{ projectId: string; opId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { projectId, opId } = await params;
  return handleGetQuestionTopicOperation(req, projectId, opId);
}
