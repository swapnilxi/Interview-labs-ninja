import { handleGenerateQuestionTopic } from 'fe-apis/lms/questionTopicHandlers';

// Generation waits on the AI provider (up to 240 s per attempt in questionTopicHandlers.ts).
export const maxDuration = 300;

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  return handleGenerateQuestionTopic(req, projectId);
}
