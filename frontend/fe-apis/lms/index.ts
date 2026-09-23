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
  reorderLessons,
  getLessonNavigation,
  recordLessonView,
  getContinueLearning,
  searchLms,
  slugify,
} from './db';
import { callAIText, cleanHtmlOutput, extractJsonObject, generateNativeVisual } from './ai';
import { buildStructuredLessonHtml } from './htmlBuilder';

function getUserId(req: Request): number | null {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromAuthHeader(authHeader);
  return user ? user.id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classes Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListClasses(): Promise<NextResponse> {
  try {
    const classes = getAllClasses();
    return NextResponse.json(classes);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to list classes' }, { status: 500 });
  }
}

export async function handleCreateClass(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ detail: 'Name is required' }, { status: 400 });
    }
    const created = createClass(body.name, body.description || '', body.icon || 'BookmarkIcon');
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to create class' }, { status: 500 });
  }
}

export async function handleGetClass(classSlug: string): Promise<NextResponse> {
  try {
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

export async function handleDeleteClass(classSlug: string): Promise<NextResponse> {
  try {
    const ok = deleteClass(classSlug);
    if (!ok) {
      return NextResponse.json({ detail: 'Class not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Class deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to delete class' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subjects Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListSubjects(classSlug: string): Promise<NextResponse> {
  try {
    const subjects = getSubjectsByClass(classSlug);
    return NextResponse.json(subjects);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to list subjects' }, { status: 500 });
  }
}

export async function handleCreateSubject(classSlug: string, req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ detail: 'Name is required' }, { status: 400 });
    }
    const created = createSubject(classSlug, body.name, body.description || '');
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to create subject' }, { status: 500 });
  }
}

export async function handleGetSubject(classSlug: string, subjectSlug: string): Promise<NextResponse> {
  try {
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

export async function handleDeleteSubject(subjectId: string): Promise<NextResponse> {
  try {
    const ok = deleteSubject(subjectId);
    if (!ok) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Subject deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to delete subject' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListSubjectLessons(subjectId: string): Promise<NextResponse> {
  try {
    const lessons = getLessonsBySubject(subjectId);
    return NextResponse.json(lessons);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get lessons' }, { status: 500 });
  }
}

export async function handleListDirectLessons(classSlug: string): Promise<NextResponse> {
  try {
    const lessons = getDirectLessonsByClass(classSlug);
    return NextResponse.json(lessons);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get direct lessons' }, { status: 500 });
  }
}

export async function handleGetLesson(lessonId: string): Promise<NextResponse> {
  try {
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

export async function handleDeleteLesson(lessonId: string): Promise<NextResponse> {
  try {
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

export async function handleGetLessonNavigation(lessonId: string): Promise<NextResponse> {
  try {
    const nav = getLessonNavigation(lessonId);
    return NextResponse.json(nav);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get navigation' }, { status: 500 });
  }
}

export async function handleDownloadLesson(lessonId: string): Promise<Response> {
  try {
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
    const item = getContinueLearning(userId);
    return NextResponse.json({ item });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get continue learning' }, { status: 500 });
  }
}

export async function handleSearch(req: NextRequest): Promise<NextResponse> {
  try {
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
    if (subject_id) {
      const subj = getSubjectByIdOrSlug(class_id, subject_id);
      if (subj) subjectName = subj.name as string;
    }

    const prompt = `You are a world-class principal software architect, senior tech lead, and educational content designer at the level of ByteByteGo, NeetCode, and 3Blue1Brown.
Create a comprehensive, production-grade, highly engaging interactive lesson on the following topic.

Metadata:
- Class / Domain: ${cls.name}
- Subject: ${subjectName}
- Input Type: ${input_type || 'topic'}
- Topic / Source Material:
${content}
${suggestedTitle ? `- Suggested Title: ${suggestedTitle}` : ''}

Output ONLY a complete, standalone, valid HTML5 document starting with <!DOCTYPE html> and ending with </html>.
No surrounding markdown code blocks. Include embedded CSS, inline SVG diagrams or animations, syntax-highlighted code blocks, and at least 2 interactive multiple-choice quiz questions with instant feedback buttons.`;

    let rawAiText = '';
    try {
      rawAiText = await callAIText(prompt, body);
    } catch (aiErr) {
      console.warn('[fe-api/lms/generate] AI generation note:', aiErr);
    }

    const titleGuess = suggestedTitle || (content.length < 60 ? content.trim() : 'System Architecture & Mechanics');
    const finalHtml = buildStructuredLessonHtml({
      title: titleGuess,
      className: cls.name as string,
      subjectName,
      topicOrContent: content,
      rawAiOutput: rawAiText,
    });

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
Return a JSON object in EXACTLY this format:
{
  "visual_type": "Architecture Diagram" | "Interactive Simulation" | "Flowchart & Process",
  "title": "Concise Title",
  "explanation": "2-3 sentences explaining the visual.",
  "visual_html": "<div class=\\"lms-visualizer\\">...inline css, svg/canvas, and js...</div>"
}
Output ONLY the JSON object.`;

    try {
      const raw = await callAIText(prompt, body);
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

export async function handleEmbedVisual(lessonId: string, req: Request): Promise<NextResponse> {
  try {
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
