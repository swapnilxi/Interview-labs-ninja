import { NextRequest, NextResponse } from 'next/server';
import { callAIText } from 'fe-apis/ai';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromAuthHeader(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
    }
    const body = await req.json();
    const { message, contextTitle, contextText } = body;

    const prompt = `You are a friendly, encouraging AI teaching assistant. The student is studying: ${contextTitle}.
Lesson context excerpt:
${(contextText || '').slice(0, 2000)}

The student asked verbally: "${message}"
Respond concisely in plain text (no markdown formatting, no code blocks, no asterisks). Your response will be spoken out loud via text-to-speech, so make it conversational, easy to understand, and brief (1-3 sentences max).`;

    // Forward the caller's configured provider/key (same fields lessons/generate and
    // lessons/visualize use) instead of only relying on server env vars — otherwise a
    // user with only e.g. an OpenAI key configured gets working lesson generation but
    // voice chat 500s. Short timeout: this is a live spoken exchange, not a lesson
    // generation, so it should fail fast rather than wait the full generation timeout.
    const response = await callAIText(prompt, body, 20000);
    
    // Clean up any potential markdown that slipped through
    const spokenText = response.replace(/[*#_`]/g, '').trim();
    
    return NextResponse.json({ text: spokenText });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
