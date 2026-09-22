import { type NextRequest } from 'next/server';
import { handleMe } from 'fe-apis/auth';

export function GET(req: NextRequest) {
  return handleMe(req);
}
