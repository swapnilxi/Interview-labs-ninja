import { handlePreviewQuestionTopic } from 'fe-apis/lms/questionTopicHandlers';

export const maxDuration = 90;

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  return handlePreviewQuestionTopic(req, projectId);
}
