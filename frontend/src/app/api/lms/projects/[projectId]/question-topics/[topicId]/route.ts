import { handleDeleteQuestionTopic, handleUpdateQuestionTopic } from 'fe-apis/lms/questionTopicHandlers';

type Ctx = { params: Promise<{ projectId: string; topicId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { projectId, topicId } = await params;
  return handleUpdateQuestionTopic(req, projectId, topicId);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId, topicId } = await params;
  return handleDeleteQuestionTopic(req, projectId, topicId);
}
