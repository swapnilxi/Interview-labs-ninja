import { handleHealth } from 'fe-apis/health';

export function GET() {
  return handleHealth();
}
