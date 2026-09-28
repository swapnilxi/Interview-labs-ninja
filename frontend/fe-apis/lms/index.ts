/**
 * fe-apis/lms/index.ts
 *
 * Route handlers for Next.js App Router API routes under /api/lms.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../_shared/db';
import {
  getAllClasses,
  getClassByIdOrSlug,
  createClass,
  updateClass,
  deleteClass,
  getSubjectsByClass,
  getSubjectByIdOrSlug,
  createSubject,
  updateSubject,
  deleteSubject,
  getLessonsBySubject,
  getDirectLessonsByClass,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderClasses,
  reorderSubjects,
  reorderLessons,
  getLessonNavigation,
  recordLessonView,
  getContinueLearning,
  searchLms,
} from './db';
import { callAIText, cleanHtmlOutput, extractJsonObject } from '../ai';
import { generateNativeVisual } from './visualEngine';
import { isCompleteAiLessonHtml, PREMIUM_DESIGN_SYSTEM_PROMPT } from './htmlBuilder';

function getUserId(req: Request): number | null {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromAuthHeader(authHeader);
  return user ? user.id : null;
}

function requireUserId(req: Request): number | NextResponse {
  const userId = getUserId(req);
  if (userId === null) {
    return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
  }
  return userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classes Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListClasses(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const classes = getAllClasses();
    return NextResponse.json(classes);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to list classes' }, { status: 500 });
  }
}

export async function handleCreateClass(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ detail: 'Name is required' }, { status: 400 });
    }
    const created = createClass(
      body.name,
      body.description || '',
      body.icon || 'BookmarkIcon',
      body.ai_context || ''
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to create class' }, { status: 500 });
  }
}

export async function handleGetClass(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const cls = getClassByIdOrSlug(classSlug);
    if (!cls) {
      return NextResponse.json({ detail: 'Class not found' }, { status: 404 });
    }
    return NextResponse.json(cls);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get class' }, { status: 500 });
  }
}

export async function handleUpdateClass(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    const updated = updateClass(classSlug, body);
    if (!updated) {
      return NextResponse.json({ detail: 'Class not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to update class' }, { status: 500 });
  }
}

export async function handleDeleteClass(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const ok = deleteClass(classSlug);
    if (!ok) {
      return NextResponse.json({ detail: 'Class not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Class deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to delete class' }, { status: 500 });
  }
}

export async function handleReorderClasses(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!Array.isArray(body.class_ids)) {
      return NextResponse.json({ detail: 'class_ids must be an array' }, { status: 400 });
    }
    reorderClasses(body.class_ids);
    return NextResponse.json({ message: 'Classes reordered successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to reorder classes' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subjects Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListSubjects(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const subjects = getSubjectsByClass(classSlug);
    return NextResponse.json(subjects);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to list subjects' }, { status: 500 });
  }
}

export async function handleCreateSubject(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ detail: 'Name is required' }, { status: 400 });
    }
    const created = createSubject(
      classSlug,
      body.name,
      body.description || '',
      body.ai_context || ''
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to create subject' }, { status: 500 });
  }
}

export async function handleGetSubject(classSlug: string, subjectSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const subj = getSubjectByIdOrSlug(classSlug, subjectSlug);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }
    return NextResponse.json(subj);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get subject' }, { status: 500 });
  }
}

export async function handleUpdateSubject(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    const updated = updateSubject(subjectId, body);
    if (!updated) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to update subject' }, { status: 500 });
  }
}

export async function handleDeleteSubject(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const ok = deleteSubject(subjectId);
    if (!ok) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Subject deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to delete subject' }, { status: 500 });
  }
}

export async function handleReorderSubjects(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!Array.isArray(body.subject_ids)) {
      return NextResponse.json({ detail: 'subject_ids must be an array' }, { status: 400 });
    }
    reorderSubjects(body.subject_ids);
    return NextResponse.json({ message: 'Subjects reordered successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to reorder subjects' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListSubjectLessons(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lessons = getLessonsBySubject(subjectId);
    return NextResponse.json(lessons);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get lessons' }, { status: 500 });
  }
}

export async function handleListDirectLessons(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lessons = getDirectLessonsByClass(classSlug);
    return NextResponse.json(lessons);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get direct lessons' }, { status: 500 });
  }
}

export async function handleGetLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }
    return NextResponse.json(lesson);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get lesson' }, { status: 500 });
  }
}

export async function handleCreateLesson(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!body.class_id || !body.title || !body.generated_html) {
      return NextResponse.json({ detail: 'class_id, title, and generated_html are required' }, { status: 400 });
    }
    const created = createLesson({
      class_id: body.class_id,
      subject_id: body.subject_id || null,
      title: body.title,
      source_type: body.source_type || 'manual',
      source_content: body.source_content || '',
      generated_html: body.generated_html,
      summary: body.summary || '',
      read_time_minutes: body.read_time_minutes || 5,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to create lesson' }, { status: 500 });
  }
}

export async function handleUpdateLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    const updated = updateLesson(lessonId, body);
    if (!updated) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to update lesson' }, { status: 500 });
  }
}

export async function handleDeleteLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const ok = deleteLesson(lessonId);
    if (!ok) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Lesson deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to delete lesson' }, { status: 500 });
  }
}

export async function handleReorderLessons(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    if (!Array.isArray(body.lesson_ids)) {
      return NextResponse.json({ detail: 'lesson_ids must be an array' }, { status: 400 });
    }
    reorderLessons(body.lesson_ids);
    return NextResponse.json({ message: 'Lessons reordered successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to reorder lessons' }, { status: 500 });
  }
}

export async function handleGetLessonNavigation(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const nav = getLessonNavigation(lessonId);
    return NextResponse.json(nav);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get navigation' }, { status: 500 });
  }
}

export async function handleDownloadLesson(lessonId: string, req: Request): Promise<Response> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return new Response(JSON.stringify({ detail: 'Lesson not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const classSlug = (lesson.class_slug as string) || 'class';
    const subjPart = lesson.subject_slug ? `${lesson.subject_slug}-` : '';
    const lessonSlug = (lesson.slug as string) || 'lesson';
    const filename = `${classSlug}-${subjPart}${lessonSlug}.html`;

    return new Response(lesson.generated_html as string, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ detail: err.message || 'Failed to download lesson' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function handleRecordLessonView(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const userId = auth;
    recordLessonView(lessonId, userId);
    return NextResponse.json({ message: 'View recorded' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to record view' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Continue Learning & Search
// ─────────────────────────────────────────────────────────────────────────────

export async function handleContinueLearning(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const userId = auth;
    const item = getContinueLearning(userId);
    return NextResponse.json({ item });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get continue learning' }, { status: 500 });
  }
}

export async function handleSearch(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query.trim()) {
      return NextResponse.json({ query: '', classes: [], subjects: [], lessons: [] });
    }
    const result = searchLms(query);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Search failed' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Source Document
// ─────────────────────────────────────────────────────────────────────────────

export async function handleUploadSource(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ detail: 'No file uploaded' }, { status: 400 });
    }

    let text = '';
    const fname = file.name.toLowerCase();

    if (fname.endsWith('.pdf') || file.type === 'application/pdf') {
      try {
        const { extractPdfTextBestEffort } = await import(
          '@/modules/swipe-pdf-reader/utils/pdfProcessor'
        );
        const { pageTexts } = await extractPdfTextBestEffort(file);
        text = pageTexts.join('\n\n');
      } catch {
        // Fallback simple read
        text = await file.text();
      }
    } else {
      text = await file.text();
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return NextResponse.json({
      filename: file.name,
      text,
      word_count: wordCount,
      preview: text.slice(0, 300) + (text.length > 300 ? '...' : ''),
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to process file' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Generation & Visualizer
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGenerateLesson(req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json();
    const { class_id, subject_id, input_type, content, title: suggestedTitle } = body;

    if (!class_id || !content) {
      return NextResponse.json({ detail: 'class_id and content are required' }, { status: 400 });
    }

    const cls = getClassByIdOrSlug(class_id);
    if (!cls) {
      return NextResponse.json({ detail: 'Class not found' }, { status: 404 });
    }

    let subjectName = 'General';
    let subjectDesc = '';
    let subjectAiContext = '';
    if (subject_id) {
      const subj = getSubjectByIdOrSlug(class_id, subject_id);
      if (subj) {
        subjectName = subj.name as string;
        subjectDesc = (subj.description as string) || '';
        subjectAiContext = (subj.ai_context as string) || '';
      }
    }

    const classDesc = (cls.description as string) || '';
    const classAiContext = (cls.ai_context as string) || '';

    const classDescSection = classDesc ? `\n- Class Description (for learners): ${classDesc}` : '';
    const classGuidanceSection = classAiContext ? `\n- Class AI Generation Guidance / Target Context: ${classAiContext}` : '';
    const subjectDescSection = subjectDesc ? `\n- Subject Description (for learners): ${subjectDesc}` : '';
    const subjectGuidanceSection = subjectAiContext ? `\n- Subject AI Generation Guidance / Target Focus: ${subjectAiContext}` : '';

    const prompt = `You are a world-class principal software architect, senior tech lead, and educational content designer at the level of ByteByteGo, NeetCode, and 3Blue1Brown.
Create a comprehensive, production-grade, highly engaging interactive lesson on the following topic.

Target Domain & Guidance Context:
- Class / Domain: ${cls.name}${classDescSection}${classGuidanceSection}
- Subject: ${subjectName}${subjectDescSection}${subjectGuidanceSection}
- Input Type: ${input_type || 'topic'}
- Topic / Source Material:
${content}
${suggestedTitle ? `- Suggested Title: ${suggestedTitle}` : ''}

OUTPUT CONTRACT:
- Output ONLY the complete, valid standalone HTML5 document, starting with <!DOCTYPE html> and ending with </html>.
- No surrounding markdown code blocks, no intro chatter.
- Everything (HTML, CSS, JavaScript) must be self-contained in this single document -- no external CDNs.

${PREMIUM_DESIGN_SYSTEM_PROMPT}

CONTENT STRUCTURE:
- Lesson header: class/subject breadcrumb badges, a clear descriptive title, a read-time badge.
- Learning objectives: 3-4 bullet goals.
- Core concepts, with real-world analogies tailored to the class/subject domain.
- At least one inline SVG/Canvas visual (see design system above) illustrating the mental model -- pick the medium (architecture diagram, pointer/array simulation, loss curve, packet flow, decision matrix, etc.) that best fits this specific topic.
- Practical code examples in a code block with a working "Copy" button.
- Interactive knowledge check: at least 2 multiple-choice questions with clickable options, immediate feedback, and a score counter.
- A closing summary or key-takeaways checklist.
- All interactive JavaScript (quiz clicks, copy button, visual controls) must be self-contained and run cleanly inside a sandboxed iframe without errors.`;

    let rawAiText = '';
    try {
      rawAiText = await callAIText(prompt, body, undefined, 16000);
    } catch (aiErr) {
      // Surface the real failure instead of silently substituting a generic,
      // topic-unaware template -- a lesson that looks legitimate but isn't actually
      // about what was asked for is worse than a visible error the user can retry.
      return NextResponse.json(
        { detail: `AI generation failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}` },
        { status: 502 }
      );
    }

    const finalHtml = cleanHtmlOutput(rawAiText);
    if (!isCompleteAiLessonHtml(finalHtml)) {
      return NextResponse.json(
        { detail: 'The AI provider returned an incomplete or invalid response. Please try again.' },
        { status: 502 }
      );
    }

    const titleGuess = suggestedTitle || (content.length < 60 ? content.trim() : 'System Architecture & Mechanics');
    const titleMatch = finalHtml.match(/<h1[^>]*>(.*?)<\/h1>/i) || finalHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    const finalTitle = suggestedTitle || (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : titleGuess);
    const finalSummary = `Interactive technical lesson on ${finalTitle}`;

    const created = createLesson({
      class_id: cls.id as string,
      subject_id: subject_id || null,
      title: finalTitle,
      source_type: input_type || 'topic',
      source_content: content.slice(0, 2000),
      generated_html: finalHtml,
      summary: finalSummary,
      read_time_minutes: 6,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to generate lesson' }, { status: 500 });
  }
}

export async function handleVisualizeLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const focusConcept = (body.concept as string) || '';

    const prompt = `You are a technical illustrator and visual educator at ByteByteGo.
Create an intuitive, interactive NATIVE WEB VISUALIZATION for:
- Lesson Title: ${lesson.title}
- Class: ${lesson.class_name}
- Subject: ${lesson.subject_name || 'General'}
- Focus: ${focusConcept || 'Core architectural or algorithmic mechanism'}

Rules:
- COLOR & THEME SAFETY (CRITICAL): This visual renders inside a page that supports BOTH
  light and dark mode via prefers-color-scheme. Prefer CSS classes with
  color: var(--text), background: var(--card), border-color: var(--border) etc. over raw
  hex values so the visual adapts automatically. If you draw raw SVG fills/strokes or
  Canvas colors that can't reference a CSS variable, choose mid-tone, moderately
  saturated colors (e.g. a blue like #4f7cff, not #0f172a or #f8fafc) that stay visible
  against BOTH a dark (#0f172a) and a light (#f7f3ec) background -- never rely on
  near-black or near-white for a shape's own fill/stroke, and never render text in a
  color that could match its background in either theme.
Return a JSON object in EXACTLY this format:
{
  "visual_type": "Architecture Diagram" | "Interactive Simulation" | "Flowchart & Process",
  "title": "Concise Title",
  "explanation": "2-3 sentences explaining the visual.",
  "visual_html": "<div class=\\"lms-visualizer\\">...inline css, svg/canvas, and js...</div>"
}
Output ONLY the JSON object.`;

    try {
      const raw = await callAIText(prompt, body, undefined, 8192);
      const parsed = extractJsonObject(raw);
      if (parsed.visual_html) {
        return NextResponse.json({
          visual_type: parsed.visual_type || 'Interactive Visualization',
          title: parsed.title || `Visual: ${lesson.title}`,
          explanation: parsed.explanation || 'Visual demonstration of this core concept.',
          visual_html: parsed.visual_html,
        });
      }
    } catch {
      // Fall through to native visual engine
    }

    const nativeResult = generateNativeVisual(lesson, focusConcept);
    return NextResponse.json(nativeResult);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to visualize concept' }, { status: 500 });
  }
}

export async function handleEasyReadLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const sourceText = String(lesson.generated_html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
    if (!sourceText) {
      return NextResponse.json({ detail: 'Lesson has no content to simplify yet.' }, { status: 400 });
    }

    const prompt = `You are an expert technical editor who specializes in making dense material fast
and easy to read, without ever removing or dumbing down the actual technical substance.

Lesson title: ${lesson.title}
Lesson content (extracted, tags stripped):
"""
${sourceText}
"""

Rewrite this content into an "easy read" version of the SAME material:
1. Start with a "Key Takeaways" list of 3-6 short bullets capturing the core ideas.
2. Break the rest into short sections, each with a clear, bold heading.
3. Keep paragraphs to 1-3 short sentences. Prefer bullet lists over dense prose wherever
   the source content is enumerable (steps, comparisons, properties, examples).
4. Bold the key terms a reader should remember.
5. Preserve every distinct technical fact, number, and example from the source -- you are
   restructuring for readability, not summarizing away detail or inventing new content.
6. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no
   <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this easy-read view covers.",
  "easy_read_html": "<div class=\\"lms-easy-read\\">...semantic HTML only...</div>"
}
Output ONLY the JSON object. No markdown code blocks before or after.`;

    const raw = await callAIText(prompt, body, undefined, 8192);
    const parsed = extractJsonObject(raw);
    if (!parsed.easy_read_html) {
      throw new Error('No easy_read_html in AI response');
    }
    return NextResponse.json({
      title: parsed.title || lesson.title,
      summary: parsed.summary || 'A lighter, scannable version of this lesson.',
      easy_read_html: parsed.easy_read_html,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Easy Read generation failed' }, { status: 502 });
  }
}

export async function handleDeeperLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const sourceText = String(lesson.generated_html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
    if (!sourceText) {
      return NextResponse.json({ detail: 'Lesson has no content to go deeper on yet.' }, { status: 400 });
    }

    const prompt = `You are a principal-level engineer who writes "go deeper" extensions for
technical lessons -- the reader has already read and understood the lesson below, so your job
is to extend it with material a solid intro lesson leaves out, not to repeat it.

Lesson title: ${lesson.title}
Lesson content (extracted, tags stripped) -- treat this as material the reader ALREADY KNOWS:
"""
${sourceText}
"""

Write a deeper-dive extension of this SAME topic:
1. Do NOT re-explain the basics already covered above -- assume they're understood. Every
   sentence should teach something the source content didn't already say.
2. Cover what an intro lesson skips: edge cases and failure modes, the underlying mechanics
   or math, production/real-world trade-offs, common misconceptions, and how this connects to
   more advanced related topics.
3. Organize into short sections, each with a clear, bold heading.
4. Keep the same technical domain and terminology as the source -- this is a continuation,
   not a new topic.
5. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no
   <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this deeper-dive extension covers.",
  "deeper_html": "<div class=\\"lms-deeper\\">...semantic HTML only...</div>"
}
Output ONLY the JSON object. No markdown code blocks before or after.`;

    const raw = await callAIText(prompt, body, undefined, 8192);
    const parsed = extractJsonObject(raw);
    if (!parsed.deeper_html) {
      throw new Error('No deeper_html in AI response');
    }
    return NextResponse.json({
      title: parsed.title || lesson.title,
      summary: parsed.summary || 'A deeper dive into this lesson\'s material.',
      deeper_html: parsed.deeper_html,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Explain Deeper generation failed' }, { status: 502 });
  }
}

export async function handleBreakdownLesson(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const sourceText = String(lesson.generated_html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
    if (!sourceText) {
      return NextResponse.json({ detail: 'Lesson has no content to break down yet.' }, { status: 400 });
    }

    const prompt = `You are an expert at distilling dense technical material into a small
number of short, punchy, high-signal chunks for a reader who wants the essence fast.

Lesson title: ${lesson.title}
Lesson content (extracted, tags stripped):
"""
${sourceText}
"""

Break this lesson down into 5-8 small chunks, in the same logical order as the source:
1. Each chunk = one short, bold micro-heading (a few words) + at most 2-3 sentences covering
   ONE idea -- the single most important point from that part of the lesson.
2. Actively trim: cut supporting detail, caveats, and examples that aren't essential to
   understanding the core idea. This is a condensed, high-impact skim version, not a
   restructuring that keeps everything -- prioritize clarity and brevity over completeness.
3. Every chunk should be independently readable and feel like a complete, standalone thought.
4. Output ONLY semantic HTML for the body content: a series of short <section> or <div>
   blocks each with one heading + a short paragraph. No <html>/<head>/<body> wrapper, no
   inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this breakdown covers.",
  "chunk_count": 6,
  "breakdown_html": "<div class=\\"lms-breakdown\\">...semantic HTML only...</div>"
}
Output ONLY the JSON object. No markdown code blocks before or after.`;

    const raw = await callAIText(prompt, body, undefined, 8192);
    const parsed = extractJsonObject(raw);
    if (!parsed.breakdown_html) {
      throw new Error('No breakdown_html in AI response');
    }
    return NextResponse.json({
      title: parsed.title || lesson.title,
      summary: parsed.summary || 'A condensed, high-impact breakdown of this lesson.',
      chunk_count: parsed.chunk_count,
      breakdown_html: parsed.breakdown_html,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Breakdown generation failed' }, { status: 502 });
  }
}

export async function handleEmbedVisual(lessonId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const lesson = getLessonById(lessonId);
    if (!lesson) {
      return NextResponse.json({ detail: 'Lesson not found' }, { status: 404 });
    }

    const body = await req.json();
    const { visual_html, title: widgetTitle } = body;
    if (!visual_html) {
      return NextResponse.json({ detail: 'visual_html is required' }, { status: 400 });
    }

    const currentHtml = lesson.generated_html as string;
    const visualBlock = `
<!-- LMS Visual Reinforcement Component -->
<section class="lms-embedded-visual" style="margin: 2.5rem 0; padding: 1.5rem; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 1rem;">
  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;"></span>
    <h3 style="margin: 0; color: #38bdf8; font-size: 1.1rem; font-weight: 700;">✨ Visual Reinforcement: ${widgetTitle || 'Visual Explanation'}</h3>
  </div>
  ${visual_html}
</section>
`;

    let updatedHtml = '';
    if (currentHtml.includes('</body>')) {
      updatedHtml = currentHtml.replace('</body>', `${visualBlock}\n</body>`);
    } else {
      updatedHtml = currentHtml + visualBlock;
    }

    const updated = updateLesson(lesson.id as string, { generated_html: updatedHtml });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to embed visual' }, { status: 500 });
  }
}
