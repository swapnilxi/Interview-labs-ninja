import { handleTodo } from 'fe-apis/todo';

// AI endpoints wait up to 55s on the provider (fe-apis/ai/client.ts).
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return handleTodo(req, path);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
