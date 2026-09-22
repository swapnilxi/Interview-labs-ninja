import { type NextRequest } from 'next/server';
import { handleLogin } from 'fe-apis/auth';

export async function POST(req: NextRequest) {
  return handleLogin(req);
}
