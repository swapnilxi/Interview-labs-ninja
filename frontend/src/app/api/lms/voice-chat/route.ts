import { NextRequest, NextResponse } from 'next/server';
import { callAIText } from 'fe-apis/lms/ai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, contextTitle, contextText } = body;
    
    const prompt = `You are a friendly, encouraging AI teaching assistant. The student is studying: ${contextTitle}.
Lesson context excerpt:
${(contextText || '').slice(0, 2000)}

The student asked verbally: "${message}"
Respond concisely in plain text (no markdown formatting, no code blocks, no asterisks). Your response will be spoken out loud via text-to-speech, so make it conversational, easy to understand, and brief (1-3 sentences max).`;

    const response = await callAIText(prompt);
    
    // Clean up any potential markdown that slipped through
    const spokenText = response.replace(/[*#_`]/g, '').trim();
    
    return NextResponse.json({ text: spokenText });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
