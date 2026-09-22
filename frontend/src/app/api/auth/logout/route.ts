import { handleLogout } from 'fe-apis/auth';

export function POST() {
  return handleLogout();
}
