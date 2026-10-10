import { NextRequest } from 'next/server';
import { handleSearch } from 'fe-apis/lms';

export async function GET(req: NextRequest) {
  return handleSearch(req);
}
