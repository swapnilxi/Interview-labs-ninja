import { handleProfileGet, handleProfilePut } from 'fe-apis/account';

// nextjs-api twin of GET/PUT /auth/profile (backend/modules/auth/router.py). See fe-apis/account.
export function GET(req: Request) {
  return handleProfileGet(req);
}

export function PUT(req: Request) {
  return handleProfilePut(req);
}
