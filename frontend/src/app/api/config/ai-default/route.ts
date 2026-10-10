import { NextResponse } from 'next/server';
import { aiDefaultInfo } from 'fe-apis/ai';

/**
 * GET /api/config/ai-default (rewritten from /config/ai-default)
 *
 * Public: reports which provider/model this server uses when the client sends no
 * model (AI_PROVIDER / AI_MODEL). Only provider and model names — never keys.
 */

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(aiDefaultInfo());
}
