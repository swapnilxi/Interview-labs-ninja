import { handleContinueLearning } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleContinueLearning(req);
}
