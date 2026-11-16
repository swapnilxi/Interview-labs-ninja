import { NextResponse } from 'next/server';
import { aiDefaultInfo } from 'fe-apis/ai';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

/**
 * GET /api/config/ai-default (rewritten from /config/ai-default)
 *
 * Reports which provider/model this server uses when the client sends no model
 * (AI_PROVIDER / AI_MODEL). Only provider and model names — never keys. Login required,
 * like FastAPI's /config router (the app is login-only).
 */

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const auth = userIdOrAuthError(req);
  if (auth instanceof Response) return auth;
  return NextResponse.json(aiDefaultInfo());
}
