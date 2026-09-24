import { handleListClasses, handleCreateClass } from 'fe-apis/lms';

export async function GET() {
  return handleListClasses();
}

export async function POST(req: Request) {
  return handleCreateClass(req);
}
