import { type NextRequest } from 'next/server';
import { handleSignup } from 'fe-apis/auth';

export async function POST(req: NextRequest) {
  return handleSignup(req);
}
