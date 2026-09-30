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
  getSubjectByIdAnyClass,
  createSubject,
  updateSubject,
  deleteSubject,
  saveContextSummary,
  saveProjectPlan,
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
import { callAIText, cleanHtmlOutput, extractJsonObject, NoEmbeddingProviderError } from '../ai';
import { indexDocument as ragIndexDocument, indexStatus as ragIndexStatus, clearIndex as ragClearIndex, retrieve as ragRetrieve, type RagSection } from '../rag';
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
      body.ai_context || '',
      body.kind === 'project' ? 'project' : 'subject',
      body.project_context || '',
      body.context_source_name || ''
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

/**
 * AI-condense this row's long-form context (project_context for a project, ai_context
 * for a subject) into a compact, information-dense summary. Once stored, generation
 * prompts prefer this summary over a raw-text prefix (see generateLessonContent /
 * handlePlanProjectModules), so a long multi-document upload's substance reaches the
 * prompt instead of being silently cut off past the raw-prefix character budget -- the
 * efficient alternative to standing up a vector-DB/RAG pipeline for what is, here, a
 * small, fixed number of single-shot generation calls rather than open-ended
 * conversational retrieval. Mirrors backend/modules/ai_lms/router.py's summarize_context.
 */
export async function handleSummarizeContext(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const subj = getSubjectByIdAnyClass(subjectId);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }

    const isProject = subj.kind === 'project';
    const fieldLabel = isProject ? 'project README / context' : 'AI generation guidance context';
    const rawText = String((isProject ? subj.project_context : subj.ai_context) || '').trim();
    if (!rawText) {
      return NextResponse.json({ detail: `No ${fieldLabel} to summarize yet.` }, { status: 400 });
    }

    const targetChars = isProject ? PROJECT_CONTEXT_PROMPT_CHARS : AI_CONTEXT_PROMPT_CHARS;
    const summarizePrompt = `You are condensing a long ${fieldLabel} so it can be used efficiently in future AI
prompts, without losing anything a downstream generation step would need.

Source text:
"""
${rawText.slice(0, 100000)}
"""

Produce a dense, structured summary that:
1. Preserves every concrete fact a generator would need: goals, tech stack, constraints,
   APIs/endpoints, schemas, numbers, names, and scope boundaries -- do not vaguely
   paraphrase these away.
2. Cuts prose, repetition, and filler that doesn't change what gets built or how.
3. Uses short headed sections or bullets, not a single wall of text.
4. Stays well under ${targetChars} characters.

Output ONLY the summary text. No preamble, no markdown code fences.`;

    let summary = '';
    try {
      summary = (await callAIText(summarizePrompt, body, undefined, 4096)).trim();
    } catch (err) {
      return NextResponse.json(
        { detail: `Summarization failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }
    if (!summary) {
      return NextResponse.json(
        { detail: 'The AI provider returned an empty summary. Please try again.' },
        { status: 502 }
      );
    }

    saveContextSummary(subj.id as string, summary);
    return NextResponse.json(getSubjectByIdOrSlug(subj.class_id as string, subj.id as string));
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to summarize context' }, { status: 500 });
  }
}

/** Discard the stored AI summary, reverting generation prompts to a raw-text prefix. */
export async function handleClearContextSummary(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;

    const subj = getSubjectByIdAnyClass(subjectId);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }

    saveContextSummary(subj.id as string, '');
    return NextResponse.json(getSubjectByIdOrSlug(subj.class_id as string, subj.id as string));
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to clear summary' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG: chunk + embed + retrieve a subject/project's raw context
//
// All the actual chunk/embed/store/retrieve logic lives in 'fe-apis/rag' -- a
// generic pipeline any fe-api module can use for any (namespace, ownerId), not
// just this one (see that package's docstring). Everything below is ai_lms's
// thin domain-specific wrapper: it resolves a subjectId to its raw context text,
// does the one ai_lms-specific bit (splitting multi-file-upload text on its own
// "--- File: name ---" markers so a chunk never straddles two unrelated
// documents), and calls straight into the shared package for the rest.
//
// Mirrors backend/modules/ai_lms/router.py's build_rag_index/clear_rag_index/
// get_rag_index_status/_retrieve_relevant_chunks.
// ─────────────────────────────────────────────────────────────────────────────

const RAG_NAMESPACE = 'ai_lms_subject';
const RAG_CHUNK_CHAR_SIZE = 2000;
const RAG_TOP_K = 5;
const FILE_MARKER_RE = /^--- File: (.+?) ---$/gm;

/** Split raw multi-file-upload text on its "--- File: name ---" markers (see
 * extractMultipleFiles on the frontend) into sections, one per uploaded file --
 * passed to ragIndexDocument so a chunk never straddles two unrelated documents.
 * Falls back to one unlabeled section for plain typed text or a single-file
 * upload. */
function splitIntoFileSections(text: string): RagSection[] {
  const matches = [...text.matchAll(FILE_MARKER_RE)];
  if (matches.length === 0) return [{ sourceLabel: '', text: text.trim() }];

  const sections: RagSection[] = [];
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    sections.push({ sourceLabel: (m[1] || '').trim(), text: text.slice(start, end).trim() });
  });
  return sections;
}

/** Chunk this row's raw long-form context and embed each chunk, replacing any
 * previous index. Requires an embedding-capable provider (OpenAI key, Gemini key,
 * or a reachable local Ollama) -- returns a clear, actionable 400 if none is
 * configured, rather than a bare 500, since this is an optional enhancement on
 * top of context_summary (which works with any provider), not a hard
 * requirement. */
export async function handleBuildRagIndex(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const subj = getSubjectByIdAnyClass(subjectId);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }

    const isProject = subj.kind === 'project';
    const fieldLabel = isProject ? 'project README / context' : 'AI generation guidance context';
    const rawText = String((isProject ? subj.project_context : subj.ai_context) || '').trim();
    if (!rawText) {
      return NextResponse.json({ detail: `No ${fieldLabel} to index yet.` }, { status: 400 });
    }

    const sections = splitIntoFileSections(rawText);
    let chunkCount: number;
    try {
      chunkCount = await ragIndexDocument(RAG_NAMESPACE, subj.id as string, sections, body, RAG_CHUNK_CHAR_SIZE);
    } catch (err) {
      if (err instanceof NoEmbeddingProviderError) {
        return NextResponse.json({ detail: err.message }, { status: 400 });
      }
      return NextResponse.json(
        { detail: `Embedding failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    if (chunkCount === 0) {
      return NextResponse.json(
        { detail: 'Nothing to index -- the context is empty after cleanup.' },
        { status: 400 }
      );
    }

    const updated = getSubjectByIdOrSlug(subj.class_id as string, subj.id as string);
    return NextResponse.json({ ...updated, rag_chunk_count: chunkCount });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to build RAG index' }, { status: 500 });
  }
}

/** Drop this row's RAG index. Generation falls back to context_summary / a raw
 * prefix, exactly as if it had never been indexed. */
export async function handleClearRagIndex(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;

    const subj = getSubjectByIdAnyClass(subjectId);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }

    ragClearIndex(RAG_NAMESPACE, subj.id as string);
    const updated = getSubjectByIdOrSlug(subj.class_id as string, subj.id as string);
    return NextResponse.json({ ...updated, rag_chunk_count: 0 });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to clear RAG index' }, { status: 500 });
  }
}

/** Chunk count for this row's RAG index (0 if never built) -- lets the UI show
 * indexed/not-indexed status without fetching the whole subject. */
export async function handleGetRagIndexStatus(subjectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;

    const subj = getSubjectByIdAnyClass(subjectId);
    if (!subj) {
      return NextResponse.json({ detail: 'Subject not found' }, { status: 404 });
    }
    return NextResponse.json({ subject_id: subj.id, rag_chunk_count: ragIndexStatus(RAG_NAMESPACE, subj.id as string) });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to get RAG index status' }, { status: 500 });
  }
}

/** Thin ai_lms-scoped wrapper over fe-apis/rag's retrieve. Returns [] (never
 * throws) if nothing is indexed or embedding the query fails -- retrieval is a
 * best-effort enhancement on top of context_summary, not a hard dependency of
 * generation. */
async function retrieveRelevantChunks(subjectId: string, queryText: string, aiBody: any, topK: number = RAG_TOP_K) {
  return ragRetrieve(RAG_NAMESPACE, subjectId, queryText, aiBody, topK);
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

// Stored README/context can be one or several whole uploaded docs; only a prefix of
// each is sent to the LLM, so storage can stay generous without blowing up prompt cost.
const PROJECT_CONTEXT_PROMPT_CHARS = 16000;
// Class/Subject ai_context can likewise now be built from multiple uploaded docs plus
// typed text; stored size is generous but only a prefix is ever sent per generation
// call, since (unlike project_context) it's re-included on EVERY lesson in that
// class/subject, not just once per project-plan/module call. Mirrors
// backend/modules/ai_lms/router.py's AI_CONTEXT_PROMPT_CHARS.
const AI_CONTEXT_PROMPT_CHARS = 8000;

/**
 * Thrown by generateLessonContent on a user-facing generation failure (bad/missing AI
 * response). Callers catch this specifically and turn it into a NextResponse; any other
 * error propagates to the handler's own outer catch as an unexpected 500.
 *
 * (Note: this project's tsconfig has "strict": false, i.e. strictNullChecks is off, under
 * which this TS version doesn't narrow a `{ok: true} | {ok: false; response}` return value
 * the way it does under strict mode -- `if (!result.ok) return result.response` fails to
 * compile ("Property 'response' does not exist"). Throwing instead of returning a
 * discriminated union sidesteps that and also matches this file's existing try/catch idiom.)
 */
class LessonGenError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Runs the lesson-generation prompt and validates the output. Shared by one-off lesson
 * generation and project implementation modules, so both produce the same lesson schema.
 * Mirrors backend/modules/ai_lms/router.py's _generate_lesson_content.
 */
async function generateLessonContent(opts: {
  cls: Record<string, unknown>;
  subj: Record<string, unknown> | null;
  inputType: string;
  content: string;
  aiBody: any;
  fallbackTitle: string;
  extraInstructions?: string;
}): Promise<{ html: string; title: string; summary: string }> {
  const { cls, subj, inputType, content, aiBody, fallbackTitle, extraInstructions } = opts;

  const subjectName = subj ? ((subj.name as string) || 'General') : 'General';
  const subjectDesc = subj ? ((subj.description as string) || '') : '';
  const isProject = Boolean(subj) && subj?.kind === 'project';
  // A stored AI summary (see saveContextSummary / the /summarize-context endpoint) is
  // preferred over a naive raw-text prefix when present -- it's denser, so more of the
  // source document's substance actually reaches the prompt within the same character
  // budget, instead of silently dropping everything past the prefix cutoff.
  const contextSummary = (subj ? (subj.context_summary as string) || '' : '').trim();
  const subjectAiContext = (contextSummary && !isProject ? contextSummary : subj ? (subj.ai_context as string) || '' : '')
    .trim()
    .slice(0, AI_CONTEXT_PROMPT_CHARS);
  const rawProjectContext = isProject ? ((subj?.project_context as string) || '').trim() : '';
  const projectContext = (contextSummary && isProject ? contextSummary : rawProjectContext).slice(
    0,
    PROJECT_CONTEXT_PROMPT_CHARS
  );

  const classDesc = (cls.description as string) || '';
  const classAiContext = ((cls.ai_context as string) || '').trim().slice(0, AI_CONTEXT_PROMPT_CHARS);

  const subjectLabel = isProject ? 'Project' : 'Subject';
  const classDescSection = classDesc ? `\n- Class Description (for learners): ${classDesc}` : '';
  const classGuidanceSection = classAiContext ? `\n- Class AI Generation Guidance / Target Context: ${classAiContext}` : '';
  const subjectDescSection = subjectDesc ? `\n- ${subjectLabel} Description (for learners): ${subjectDesc}` : '';
  const subjectGuidanceSection = subjectAiContext ? `\n- ${subjectLabel} AI Generation Guidance / Target Focus: ${subjectAiContext}` : '';
  const projectContextSection = projectContext
    ? `\n- Project README / Context (the project the learner is building):\n"""\n${projectContext}\n"""`
    : '';
  const extraSection = extraInstructions?.trim() ? `\n${extraInstructions.trim()}\n` : '';

  // RAG: pull the source-context chunks most relevant to THIS specific
  // module/lesson (best-effort -- [] if nothing's indexed, or if embedding the
  // query fails, so this never blocks generation). contextSummary above carries
  // the big picture; these excerpts carry precise, sourced detail a compressed
  // summary can drop.
  const retrievedChunks = subj
    ? await retrieveRelevantChunks(subj.id as string, `${fallbackTitle}\n${content.slice(0, 1000)}`, aiBody)
    : [];
  let retrievedContextSection = '';
  if (retrievedChunks.length > 0) {
    const excerpts = retrievedChunks.map((c) => `[${c.sourceLabel || 'source'}]\n${c.content}`).join('\n\n');
    retrievedContextSection = `

Retrieved Relevant Context (grounded excerpts from the actual source document(s) for
this specific module/lesson -- ground implementation-level specifics in these over
generic/invented detail wherever they apply):
"""
${excerpts}
"""`;
  }

  const prompt = `You are a world-class principal software architect, senior tech lead, and educational content designer at the level of ByteByteGo, NeetCode, and 3Blue1Brown.
Create a comprehensive, production-grade, highly engaging interactive lesson on the following topic.

Target Domain & Guidance Context:
- Class / Domain: ${cls.name}${classDescSection}${classGuidanceSection}
- ${subjectLabel}: ${subjectName}${subjectDescSection}${subjectGuidanceSection}${projectContextSection}
- Input Type: ${inputType || 'topic'}
- Topic / Source Material:
${content}
${extraSection}${retrievedContextSection}
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
    rawAiText = await callAIText(prompt, aiBody, undefined, 16000);
  } catch (aiErr) {
    // Surface the real failure instead of silently substituting a generic,
    // topic-unaware template -- a lesson that looks legitimate but isn't actually
    // about what was asked for is worse than a visible error the user can retry.
    throw new LessonGenError(
      `AI generation failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`,
      502
    );
  }

  const finalHtml = cleanHtmlOutput(rawAiText);
  if (!isCompleteAiLessonHtml(finalHtml)) {
    throw new LessonGenError(
      'The AI provider returned an incomplete or invalid response. Please try again.',
      502
    );
  }

  const titleMatch = finalHtml.match(/<h1[^>]*>(.*?)<\/h1>/i) || finalHtml.match(/<title[^>]*>(.*?)<\/title>/i);
  const finalTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() || fallbackTitle : fallbackTitle;
  const finalSummary = `Interactive technical lesson on ${finalTitle}`;

  return { html: finalHtml, title: finalTitle, summary: finalSummary };
}

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

    const subj = subject_id ? getSubjectByIdOrSlug(class_id, subject_id) : null;

    const titleGuess = suggestedTitle || (content.length < 60 ? content.trim() : 'System Architecture & Mechanics');

    const result = await generateLessonContent({
      cls,
      subj,
      inputType: input_type || 'topic',
      content,
      aiBody: body,
      fallbackTitle: titleGuess,
    });

    const finalTitle = suggestedTitle || result.title;
    const created = createLesson({
      class_id: cls.id as string,
      subject_id: (subj?.id as string) || null,
      title: finalTitle,
      source_type: input_type || 'topic',
      source_content: content.slice(0, 2000),
      generated_html: result.html,
      summary: `Interactive technical lesson on ${finalTitle}`,
      read_time_minutes: 6,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Failed to generate lesson' },
      { status: err instanceof LessonGenError ? err.status : 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Track: README/context -> AI-planned implementation modules
//
// A project is an lms_subjects row with kind='project'. Its modules (and their
// sublessons, see Break Down below) are ordinary lessons (subject_id = project id), so
// the lesson viewer, navigation, download, and breadcrumbs all work unchanged. The
// outline lives in lms_subjects.project_plan as
//   [{title, focus, lesson_id, sublessons: [{title, focus, lesson_id}]}]
// linking each planned module (and, once broken down, each sublesson) to its lesson.
// Mirrors backend/modules/ai_lms/router.py's project endpoints exactly -- keep the two
// in sync (per CLAUDE.md: fastapi and nextjs-api modes must not silently diverge).
// ─────────────────────────────────────────────────────────────────────────────

type PlanItem = Record<string, any>;

function getProjectOr404(projectId: string): Record<string, unknown> | NextResponse {
  const subj = getSubjectByIdAnyClass(projectId);
  if (!subj || subj.kind !== 'project') {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 });
  }
  return subj;
}

/** Delete every lesson a plan (module + nested sublessons) currently points to. */
function deletePlanLessons(plan: PlanItem[]): void {
  for (const item of plan) {
    if (item.lesson_id) deleteLesson(item.lesson_id as string);
    deletePlanLessons((item.sublessons as PlanItem[]) || []);
  }
}

/** Walk the plan tree in display order: each module's own lesson (if any), then its
 * sublessons (if it's been broken down), then the next module. */
function flattenPlanLessonIds(plan: PlanItem[]): string[] {
  const ids: string[] = [];
  for (const item of plan) {
    if (item.lesson_id) ids.push(item.lesson_id as string);
    for (const sub of (item.sublessons as PlanItem[]) || []) {
      if (sub.lesson_id) ids.push(sub.lesson_id as string);
    }
  }
  return ids;
}

function syncProjectLessonOrder(project: Record<string, unknown>, plan: PlanItem[]): void {
  const plannedIds = flattenPlanLessonIds(plan);
  const current = getLessonsBySubject(project.id as string).map((l) => l.id as string);
  const extras = current.filter((id) => !plannedIds.includes(id));
  reorderLessons([...plannedIds.filter((id) => current.includes(id)), ...extras]);
}

/** The "this is a real implementation step, not a theory chapter" prompt contract shared
 * by module and sublesson generation. Scopes each lesson to ~2 hours of real, verifiable
 * work. Mirrors backend/modules/ai_lms/router.py's _build_implementation_extra_instructions. */
function buildImplementationExtraInstructions(projectName: string, positionLabel: string, focus: string): string {
  return `PROJECT TRACK INSTRUCTIONS (CRITICAL -- this is an IMPLEMENTATION lesson, not a theory chapter):
- This lesson is ${positionLabel} of an implementation roadmap for the project "${projectName}". The learner's whole goal is to move the project forward by actually building this specific piece: ${focus}
- Optimize for implementation momentum, not content volume. Scope this lesson to what a learner can realistically implement AND verify in about ONE ~2-hour session, ending with one concrete artifact (working code, an endpoint, a schema/migration, a UI component, a passing test suite, etc). Do not pad it into a long theory article, and do not repeat the project README back at the learner -- get to implementation fast.
- Structure the lesson around: Goal (what's being built), Prerequisites (what should already exist from earlier steps), Implementation (concrete steps, file/folder changes, and real code for the project's actual stack), Commands to run, Validation (how the learner verifies it works), and a closing 'Done When' checklist (e.g. "Endpoint created", "Tests passing").
- Assume earlier steps in the roadmap are already done; build on them without re-teaching or re-implementing them. Briefly point to what comes next at the end.
- Use the project README as the source of truth for goals, stack, scope and constraints.`;
}

export async function handlePlanProjectModules(projectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const project = getProjectOr404(projectId);
    if (project instanceof NextResponse) return project;
    const cls = project.class as Record<string, unknown>;

    const rawProjectContext = ((project.project_context as string) || '').trim();
    if (!rawProjectContext) {
      return NextResponse.json(
        { detail: 'Add a README / project context before generating modules.' },
        { status: 400 }
      );
    }
    // Prefer the stored AI summary when present -- denser, so more of the source
    // document's substance reaches the prompt within the same character budget.
    const contextSummary = ((project.context_summary as string) || '').trim();
    const projectContext = contextSummary || rawProjectContext;

    const classDesc = (cls.description as string) || '';
    const classAiContext = ((cls.ai_context as string) || '').trim().slice(0, AI_CONTEXT_PROMPT_CHARS);
    const projectDesc = (project.description as string) || '';
    const projectAiContext = ((project.ai_context as string) || '').trim().slice(0, AI_CONTEXT_PROMPT_CHARS);

    const planPrompt = `You are a staff software engineer and curriculum designer. A learner wants to BUILD the
project described below and learn by implementing it step by step. Decompose it into an ordered
sequence of implementation modules -- each module will later become one hands-on lesson that
teaches how to implement that step of THIS project.

Context:
- Class: ${cls.name}${classDesc ? `\n- Class Description: ${classDesc}` : ''}${classAiContext ? `\n- Class AI Guidance: ${classAiContext}` : ''}
- Project: ${project.name}${projectDesc ? `\n- Project Description: ${projectDesc}` : ''}${projectAiContext ? `\n- Project AI Guidance: ${projectAiContext}` : ''}

Project README / Context:
"""
${projectContext.slice(0, PROJECT_CONTEXT_PROMPT_CHARS)}
"""

Rules:
1. Optimize for implementation momentum, not fewer modules: each module must be small enough
   that a learner can realistically implement AND test it in about one focused ~2-hour session,
   producing one concrete artifact (an endpoint, a schema/migration, a UI component, a service,
   a middleware, a test suite, a config/deploy step, etc). If a natural step of the project is
   bigger than that (e.g. "Authentication"), split it into several sequential modules (e.g. "User
   Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes",
   "Authentication Tests") rather than one large module -- prefer more, smaller modules over a
   few big ones. This typically means more like 6-14 modules for a real project, not 4-6.
2. Order modules by implementation dependency (setup/architecture first, testing/deployment
   last); each module builds on the ones before it.
3. "focus" is 1-3 sentences on exactly what gets built in that module (components, files,
   endpoints, schema, config) and the key concepts it teaches.
4. Don't invent features the README doesn't call for; you may add essential glue steps
   (e.g. project setup, testing) that any real implementation needs.

Return a JSON object in EXACTLY this format:
{
  "modules": [
    {"title": "Project Setup & Architecture", "focus": "..."}
  ]
}
Output ONLY the JSON object. No markdown code blocks before or after.`;

    let result: Record<string, unknown>;
    try {
      const raw = await callAIText(planPrompt, body, undefined, 4096);
      result = extractJsonObject(raw);
    } catch (err) {
      return NextResponse.json(
        { detail: `Module planning failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    const modulesRaw = Array.isArray(result.modules) ? (result.modules as Record<string, unknown>[]) : [];
    const plan: PlanItem[] = modulesRaw
      .filter((m) => m && typeof m === 'object' && String(m.title || '').trim())
      .map((m) => ({
        title: String(m.title).trim().slice(0, 200),
        focus: String(m.focus || '').trim(),
        lesson_id: null as string | null,
        sublessons: [] as PlanItem[], // populated on demand via the "Break Down" action
      }));

    if (plan.length === 0) {
      return NextResponse.json(
        { detail: 'The AI provider returned no modules. Please try again.' },
        { status: 502 }
      );
    }

    // Modules from the previous outline no longer apply; drop their generated lessons.
    deletePlanLessons((project.project_plan as PlanItem[]) || []);

    saveProjectPlan(project.id as string, plan);
    const updated = getSubjectByIdOrSlug(cls.id as string, project.id as string);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to plan project modules' }, { status: 500 });
  }
}

export async function handleGenerateProjectModule(
  projectId: string,
  moduleIndex: number,
  req: Request
): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const project = getProjectOr404(projectId);
    if (project instanceof NextResponse) return project;
    const cls = project.class as Record<string, unknown>;

    const plan: PlanItem[] = ((project.project_plan as PlanItem[]) || []).slice();
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= plan.length) {
      return NextResponse.json({ detail: "Module not found in this project's outline." }, { status: 404 });
    }

    const moduleItem = plan[moduleIndex];
    const outline = plan
      .map((m, i) => `${i + 1}. ${m.title}${i === moduleIndex ? ' <- THIS MODULE' : ''}`)
      .join('\n');
    const moduleBrief = `Implementation Module ${moduleIndex + 1} of ${plan.length}: ${moduleItem.title}\nModule focus: ${moduleItem.focus || moduleItem.title}\n\nFull project module outline:\n${outline}`;
    const extraInstructions = buildImplementationExtraInstructions(
      project.name as string,
      `module ${moduleIndex + 1} of ${plan.length}`,
      moduleItem.focus || moduleItem.title
    );

    const result = await generateLessonContent({
      cls,
      subj: project,
      inputType: 'project',
      content: moduleBrief,
      aiBody: body,
      fallbackTitle: moduleItem.title as string,
      extraInstructions,
    });

    const existingLessonId = moduleItem.lesson_id as string | null;
    let lesson: Record<string, unknown> | null;
    if (existingLessonId && getLessonById(existingLessonId)) {
      lesson = updateLesson(existingLessonId, {
        title: result.title,
        generated_html: result.html,
        summary: result.summary,
      });
    } else {
      lesson = createLesson({
        class_id: cls.id as string,
        subject_id: project.id as string,
        title: result.title,
        source_type: 'project',
        source_content: moduleBrief.slice(0, 2000),
        generated_html: result.html,
        summary: result.summary,
        read_time_minutes: 6,
      });
    }

    plan[moduleIndex] = { ...moduleItem, lesson_id: lesson!.id as string };
    saveProjectPlan(project.id as string, plan);
    syncProjectLessonOrder(project, plan);

    return NextResponse.json({
      lesson,
      project: getSubjectByIdOrSlug(cls.id as string, project.id as string),
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Failed to generate project module' },
      { status: err instanceof LessonGenError ? err.status : 500 }
    );
  }
}

/** Insert a user-authored module (moduleIndex null) or sublesson at `position`. Mirrors
 * router.py's add_project_step. */
export async function handleAddProjectStep(projectId: string, req: Request): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return NextResponse.json({ detail: 'Title is required.' }, { status: 422 });

    const project = getProjectOr404(projectId);
    if (project instanceof NextResponse) return project;
    const cls = project.class as Record<string, unknown>;

    const plan: PlanItem[] = ((project.project_plan as PlanItem[]) || []).slice();
    const item: PlanItem = { title, focus: String(body.focus || '').trim().slice(0, 1000), lesson_id: null, sublessons: [] };
    const position = Number.isInteger(body.position) ? (body.position as number) : 0;
    const clamp = (len: number) => Math.max(0, Math.min(position, len));

    if (body.module_index === null || body.module_index === undefined) {
      plan.splice(clamp(plan.length), 0, item);
    } else {
      const mi = body.module_index as number;
      if (!Number.isInteger(mi) || mi < 0 || mi >= plan.length) {
        return NextResponse.json({ detail: "Module not found in this project's outline." }, { status: 404 });
      }
      const subs: PlanItem[] = ((plan[mi].sublessons as PlanItem[]) || []).slice();
      subs.splice(clamp(subs.length), 0, item);
      plan[mi] = { ...plan[mi], sublessons: subs };
    }
    saveProjectPlan(project.id as string, plan);
    syncProjectLessonOrder(project, plan);
    return NextResponse.json(getSubjectByIdOrSlug(cls.id as string, project.id as string));
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to add step' },
      { status: 500 }
    );
  }
}

export async function handleBreakDownProjectModule(
  projectId: string,
  moduleIndex: number,
  req: Request
): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const project = getProjectOr404(projectId);
    if (project instanceof NextResponse) return project;
    const cls = project.class as Record<string, unknown>;

    const plan: PlanItem[] = ((project.project_plan as PlanItem[]) || []).slice();
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= plan.length) {
      return NextResponse.json({ detail: "Module not found in this project's outline." }, { status: 404 });
    }

    const moduleItem = plan[moduleIndex];
    const lessonId = moduleItem.lesson_id as string | null;
    const lesson = lessonId ? getLessonById(lessonId) : null;
    if (!lesson) {
      return NextResponse.json(
        { detail: "Generate this module's lesson before breaking it down." },
        { status: 400 }
      );
    }

    const sourceText = String(lesson.generated_html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const breakdownPrompt = `You are a staff engineer decomposing one implementation module of a larger project
into small, sequential, independently implementable sublessons.

Project: ${project.name}
Module ${moduleIndex + 1}: ${moduleItem.title}
Module focus: ${moduleItem.focus || moduleItem.title}

The module's current lesson content (what it currently covers):
"""
${sourceText}
"""

Break this module down into 2-6 smaller sublessons, each:
- Scoped to what a learner can implement AND verify in about ~2 hours or less.
- Focused on ONE concrete deliverable (for example, a module about authentication might split
  into "User Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes",
  "Authentication Tests").
- Ordered so each builds on the previous ones.

Return a JSON object in EXACTLY this format:
{
  "sublessons": [
    {"title": "User Model & Password Hashing", "focus": "..."}
  ]
}
Output ONLY the JSON object. No markdown code blocks before or after.`;

    let result: Record<string, unknown>;
    try {
      const raw = await callAIText(breakdownPrompt, body, undefined, 2048);
      result = extractJsonObject(raw);
    } catch (err) {
      return NextResponse.json(
        { detail: `Breakdown failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    const rawSubs = Array.isArray(result.sublessons) ? (result.sublessons as Record<string, unknown>[]) : [];
    const sublessons: PlanItem[] = rawSubs
      .filter((s) => s && typeof s === 'object' && String(s.title || '').trim())
      .map((s) => ({
        title: String(s.title).trim().slice(0, 200),
        focus: String(s.focus || '').trim(),
        lesson_id: null as string | null,
        sublessons: [] as PlanItem[],
      }));

    if (sublessons.length === 0) {
      return NextResponse.json(
        { detail: 'The AI provider returned no sublessons. Please try again.' },
        { status: 502 }
      );
    }

    // Replace whatever this module was previously broken down into (and their lessons), if any.
    deletePlanLessons((moduleItem.sublessons as PlanItem[]) || []);
    plan[moduleIndex] = { ...moduleItem, sublessons };
    saveProjectPlan(project.id as string, plan);

    return NextResponse.json(getSubjectByIdOrSlug(cls.id as string, project.id as string));
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to break down module' }, { status: 500 });
  }
}

export async function handleGenerateProjectSublesson(
  projectId: string,
  moduleIndex: number,
  subIndex: number,
  req: Request
): Promise<NextResponse> {
  try {
    const auth = requireUserId(req);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));

    const project = getProjectOr404(projectId);
    if (project instanceof NextResponse) return project;
    const cls = project.class as Record<string, unknown>;

    const plan: PlanItem[] = ((project.project_plan as PlanItem[]) || []).slice();
    if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= plan.length) {
      return NextResponse.json({ detail: "Module not found in this project's outline." }, { status: 404 });
    }
    const moduleItem = plan[moduleIndex];
    const sublessons: PlanItem[] = ((moduleItem.sublessons as PlanItem[]) || []).slice();
    if (!Number.isInteger(subIndex) || subIndex < 0 || subIndex >= sublessons.length) {
      return NextResponse.json({ detail: 'Sublesson not found in this module.' }, { status: 404 });
    }

    const sub = sublessons[subIndex];
    const siblingOutline = sublessons
      .map((s, i) => `  ${i + 1}. ${s.title}${i === subIndex ? ' <- THIS SUBLESSON' : ''}`)
      .join('\n');
    const moduleBrief = `Implementation Module ${moduleIndex + 1} of ${plan.length}: ${moduleItem.title} (module focus: ${moduleItem.focus || moduleItem.title})\n\nSublesson ${subIndex + 1} of ${sublessons.length}: ${sub.title}\nSublesson focus: ${sub.focus || sub.title}\n\nThis module's sublesson breakdown:\n${siblingOutline}`;
    const extraInstructions = buildImplementationExtraInstructions(
      project.name as string,
      `sublesson ${subIndex + 1} of ${sublessons.length} in module "${moduleItem.title}"`,
      sub.focus || sub.title
    );

    const result = await generateLessonContent({
      cls,
      subj: project,
      inputType: 'project',
      content: moduleBrief,
      aiBody: body,
      fallbackTitle: sub.title as string,
      extraInstructions,
    });

    const existingLessonId = sub.lesson_id as string | null;
    let lesson: Record<string, unknown> | null;
    if (existingLessonId && getLessonById(existingLessonId)) {
      lesson = updateLesson(existingLessonId, {
        title: result.title,
        generated_html: result.html,
        summary: result.summary,
      });
    } else {
      lesson = createLesson({
        class_id: cls.id as string,
        subject_id: project.id as string,
        title: result.title,
        source_type: 'project',
        source_content: moduleBrief.slice(0, 2000),
        generated_html: result.html,
        summary: result.summary,
        read_time_minutes: 6,
      });
    }

    sublessons[subIndex] = { ...sub, lesson_id: lesson!.id as string };
    plan[moduleIndex] = { ...moduleItem, sublessons };
    saveProjectPlan(project.id as string, plan);
    syncProjectLessonOrder(project, plan);

    return NextResponse.json({
      lesson,
      project: getSubjectByIdOrSlug(cls.id as string, project.id as string),
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Failed to generate sublesson' },
      { status: err instanceof LessonGenError ? err.status : 500 }
    );
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
