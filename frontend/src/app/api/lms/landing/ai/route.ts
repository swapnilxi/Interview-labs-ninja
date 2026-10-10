import { handleModuleLandingAi } from 'fe-apis/lms';

export async function POST(req: Request) {
  return handleModuleLandingAi(req);
}
