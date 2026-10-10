import { handleListClasses, handleCreateClass } from 'fe-apis/lms';

export async function GET(req: Request) {
  return handleListClasses(req);
}

export async function POST(req: Request) {
  return handleCreateClass(req);
}
