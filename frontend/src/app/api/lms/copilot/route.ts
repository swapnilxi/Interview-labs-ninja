import { NextRequest, NextResponse } from 'next/server';
import { callAIText } from 'fe-apis/ai';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';

// Twin of POST /api/lms/copilot in backend/modules/ai_lms/router.py -- keep the prompt in sync.
const SCOPE_LABEL: Record<string, string> = {
  home: 'the AI Learning Platform home (all classes)',
  class: 'a class (a curriculum domain)',
  subject: 'a subject inside a class',
  project: 'a hands-on project track',
  module: 'one module/step of a project',
  lesson: 'a single lesson',
};

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromAuthHeader(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
    }
    const body = await req.json();
    const question = String(body.question || '').slice(0, 2000);
    if (!question.trim()) {
      return NextResponse.json({ detail: 'question is required' }, { status: 422 });
    }
    const scope = SCOPE_LABEL[body.scope] ? body.scope : 'home';
    const history: { role: string; content: string }[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const turns = history
      .map((t) => `${t.role === 'user' ? 'Student' : 'Copilot'}: ${String(t.content || '').slice(0, 800)}`)
      .join('\n');

    const prompt = `You are the learning copilot inside an AI LMS. The student currently has ${SCOPE_LABEL[scope]} open.
Open item: ${body.contextTitle || '(none)'}
Where it sits: ${body.breadcrumb || '(top level)'}

Content of the open item (excerpt):
${String(body.contextText || '').slice(0, 6000)}

${turns ? `Conversation so far:\n${turns}` : ''}

Student: ${question}

Answer for THIS open item, using its content above. If the question is about something outside it, say so briefly and connect it back. If the content does not contain the answer, say what is missing rather than inventing details. Be concise and practical: short paragraphs or "- " bullets, **bold** for key terms, no headings.`;

    const answer = await callAIText(prompt, body, 45000);
    return NextResponse.json({ answer: answer.trim() });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
