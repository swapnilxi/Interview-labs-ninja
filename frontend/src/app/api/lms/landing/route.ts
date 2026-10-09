import { handleGetModuleLanding, handlePutModuleLanding } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleGetModuleLanding(req);
}

export async function PUT(req: Request) {
  return handlePutModuleLanding(req);
}
