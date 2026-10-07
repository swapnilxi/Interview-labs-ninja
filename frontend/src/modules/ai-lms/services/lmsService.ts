import { apiFetch, apiJson, parseApiError } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type {
  BreakdownResult,
  ContinueLearningItem,
  DeeperExplanationResult,
  EasyReadResult,
  GenerateLessonRequest,
  LmsClass,
  LmsContentStatus,
  LmsLanding,
  LmsLandingAiResult,
  LmsLandingSaved,
  LmsLandingSection,
  LmsLesson,
  LmsNavigation,
  LmsPathTarget,
  LmsSearchResult,
  LmsSubject,
  VisualExplanationResult,
} from '../types';

/** Response shape from the project module/sublesson generate endpoints -- the freshly
 * generated (or regenerated) lesson, plus the project's full updated detail (plan + lessons)
 * so the caller can refresh in one round trip. */
export interface PlacementSuggestion {
  title: string;
  focus: string;
  suggestions: { label: string; module_index: number | null; position: number; reason: string }[];
}

/** The lesson changed since the editor loaded it (e.g. its .html file was saved in the IDE). */
export class LmsConflictError extends Error {}

export interface ProjectGenerateResult {
  lesson: LmsLesson;
  project: LmsSubject;
}

export const lmsService = {
  // ── Classes ──────────────────────────────────────────────────────────────
  async getClasses(): Promise<LmsClass[]> {
    return apiJson<LmsClass[]>('/api/lms/classes');
  },

  async getClass(idOrSlug: string): Promise<LmsClass> {
    return apiJson<LmsClass>(`/api/lms/classes/${encodeURIComponent(idOrSlug)}`);
  },

  async createClass(payload: {
    name: string;
    description?: string;
    icon?: string;
    ai_context?: string;
  }): Promise<LmsClass> {
    return apiJson<LmsClass>('/api/lms/classes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateClass(
    idOrSlug: string,
    payload: { name?: string; description?: string; icon?: string; ai_context?: string }
  ): Promise<LmsClass> {
    return apiJson<LmsClass>(`/api/lms/classes/${encodeURIComponent(idOrSlug)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteClass(idOrSlug: string): Promise<void> {
    await apiJson(`/api/lms/classes/${encodeURIComponent(idOrSlug)}`, {
      method: 'DELETE',
    });
  },

  async reorderClasses(classIds: string[]): Promise<void> {
    await apiJson('/api/lms/classes/reorder', {
      method: 'POST',
      body: JSON.stringify({ class_ids: classIds }),
    });
  },

  // ── Subjects ─────────────────────────────────────────────────────────────
  async getSubjects(classIdOrSlug: string): Promise<LmsSubject[]> {
    return apiJson<LmsSubject[]>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/subjects`);
  },

  async getSubject(classIdOrSlug: string, subjectIdOrSlug: string): Promise<LmsSubject> {
    return apiJson<LmsSubject>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/subjects/${encodeURIComponent(subjectIdOrSlug)}`
    );
  },

  async createSubject(
    classIdOrSlug: string,
    payload: {
      name: string;
      description?: string;
      ai_context?: string;
      kind?: 'subject' | 'project';
      project_context?: string;
      context_source_name?: string;
    }
  ): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/subjects`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Sugar over createSubject(kind: 'project') -- a Project is a Subject row with kind='project'
   * plus a README/context, so it reuses the same table, lesson schema, and viewer. */
  async createProject(
    classIdOrSlug: string,
    payload: { name: string; description?: string; project_context?: string; context_source_name?: string }
  ): Promise<LmsSubject> {
    return this.createSubject(classIdOrSlug, { ...payload, kind: 'project' });
  },

  async updateSubject(
    subjectId: string,
    payload: {
      name?: string;
      description?: string;
      ai_context?: string;
      project_context?: string;
      context_source_name?: string;
    }
  ): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/subjects/${encodeURIComponent(subjectId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteSubject(subjectId: string): Promise<void> {
    await apiJson(`/api/lms/subjects/${encodeURIComponent(subjectId)}`, {
      method: 'DELETE',
    });
  },

  async reorderSubjects(subjectIds: string[]): Promise<void> {
    await apiJson('/api/lms/subjects/reorder', {
      method: 'POST',
      body: JSON.stringify({ subject_ids: subjectIds }),
    });
  },

  // ── Lessons ──────────────────────────────────────────────────────────────
  async getLessonsForSubject(subjectId: string): Promise<LmsLesson[]> {
    return apiJson<LmsLesson[]>(`/api/lms/subjects/${encodeURIComponent(subjectId)}/lessons`);
  },

  async getDirectLessonsForClass(classIdOrSlug: string): Promise<LmsLesson[]> {
    return apiJson<LmsLesson[]>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/lessons`);
  },

  /** Pass the class (and subject) a slug came from: lesson slugs are only unique per class. */
  async getLesson(
    lessonId: string,
    scope?: { classSlug?: string; subjectSlug?: string }
  ): Promise<LmsLesson> {
    const params = new URLSearchParams();
    if (scope?.classSlug) params.set('class', scope.classSlug);
    if (scope?.subjectSlug) params.set('subject', scope.subjectSlug);
    const query = params.toString();
    return apiJson<LmsLesson>(
      `/api/lms/lessons/${encodeURIComponent(lessonId)}${query ? `?${query}` : ''}`
    );
  },

  /** Cheap change check (no view recorded); pulls in an IDE edit of the lesson file. */
  async getLessonStatus(lessonId: string): Promise<LmsContentStatus> {
    return apiJson<LmsContentStatus>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/status`, {
      cache: 'no-store',
    });
  },

  // ── Class folders (classes/<class>/landingpage.html and lesson files) ───
  async getLanding(classIdOrSlug: string): Promise<LmsLanding> {
    return apiJson<LmsLanding>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing`, {
      cache: 'no-store',
    });
  },

  async listLandingSections(classIdOrSlug: string): Promise<{ hash: string; sections: LmsLandingSection[] }> {
    return apiJson(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/sections`, {
      cache: 'no-store',
    });
  },

  /** Replace the whole landing page (editor+). base_hash guards against overwriting a newer version. */
  async saveLanding(classIdOrSlug: string, html: string, baseHash?: string): Promise<LmsLandingSaved> {
    return apiJson<LmsLandingSaved>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing`, {
      method: 'PUT',
      body: JSON.stringify({ html, base_hash: baseHash }),
    });
  },

  async addLandingSection(
    classIdOrSlug: string,
    section: { title: string; body_html: string; after_section_id?: string; position?: 'start' | 'end' }
  ): Promise<LmsLandingSaved> {
    return apiJson<LmsLandingSaved>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/sections`,
      { method: 'POST', body: JSON.stringify(section) }
    );
  },

  /** Edit a section's HTML in place and/or move it one step up/down the page. */
  async updateLandingSection(
    classIdOrSlug: string,
    sectionId: string,
    change: { html?: string; move?: 'up' | 'down' }
  ): Promise<LmsLandingSaved> {
    return apiJson<LmsLandingSaved>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/sections/${encodeURIComponent(sectionId)}`,
      { method: 'PATCH', body: JSON.stringify(change) }
    );
  },

  async deleteLandingSection(classIdOrSlug: string, sectionId: string): Promise<LmsLandingSaved> {
    return apiJson<LmsLandingSaved>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/sections/${encodeURIComponent(sectionId)}`,
      { method: 'DELETE' }
    );
  },

  /** AI reprompt of the landing page. Returns a PREVIEW; apply it with saveLanding(). */
  async landingAi(
    classIdOrSlug: string,
    instruction: string,
    mode: 'generate' | 'edit' | 'section',
    placement?: { after_section_id?: string; position?: 'start' | 'end' }
  ): Promise<LmsLandingAiResult> {
    return apiJson<LmsLandingAiResult>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/ai`,
      {
        method: 'POST',
        body: JSON.stringify({ ...defaultAIRequestFields(), instruction, mode, ...placement }),
      }
    );
  },

  async getLandingStatus(classIdOrSlug: string): Promise<LmsContentStatus> {
    return apiJson<LmsContentStatus>(
      `/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/landing/status`,
      { cache: 'no-store' }
    );
  },

  /** Download the class as <slug>.zip: the static site (landingpage.html, index.html, every
   * lesson/module page, class.json) plus vercel.json and a Dockerfile for Cloud Run. */
  async exportClass(classIdOrSlug: string): Promise<void> {
    const res = await apiFetch(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/export`);
    if (!res.ok) throw new Error(await parseApiError(res));
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${classIdOrSlug}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },

  /** Map a classes-folder path (a relative link clicked inside a page) to what it shows. */
  async resolvePath(path: string): Promise<LmsPathTarget> {
    return apiJson<LmsPathTarget>(`/api/lms/resolve-path?path=${encodeURIComponent(path)}`);
  },

  async createLesson(payload: {
    class_id: string;
    subject_id?: string | null;
    title: string;
    generated_html: string;
    summary?: string;
    read_time_minutes?: number;
  }): Promise<LmsLesson> {
    return apiJson<LmsLesson>('/api/lms/lessons', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateLesson(
    lessonId: string,
    payload: {
      title?: string;
      generated_html?: string;
      summary?: string;
      order_index?: number;
      read_time_minutes?: number;
      /** content_hash the edit started from; the server answers 409 if the lesson changed since. */
      base_hash?: string;
    }
  ): Promise<LmsLesson> {
    const res = await apiFetch(`/api/lms/lessons/${encodeURIComponent(lessonId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (res.status === 409) throw new LmsConflictError(await parseApiError(res));
    if (!res.ok) throw new Error(await parseApiError(res));
    return (await res.json()) as LmsLesson;
  },

  async deleteLesson(lessonId: string): Promise<void> {
    await apiJson(`/api/lms/lessons/${encodeURIComponent(lessonId)}`, {
      method: 'DELETE',
    });
  },

  async reorderLessons(lessonIds: string[]): Promise<void> {
    await apiJson('/api/lms/lessons/reorder', {
      method: 'POST',
      body: JSON.stringify({ lesson_ids: lessonIds }),
    });
  },

  async getNavigation(lessonId: string): Promise<LmsNavigation> {
    return apiJson<LmsNavigation>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/navigation`);
  },

  // ── Continue Learning & Tracking ─────────────────────────────────────────
  async getContinueLearning(): Promise<ContinueLearningItem | null> {
    const res = await apiJson<{ item: ContinueLearningItem | null }>('/api/lms/continue-learning');
    return res.item ?? null;
  },

  async recordLessonView(lessonId: string): Promise<void> {
    try {
      await apiFetch(`/api/lms/lessons/${encodeURIComponent(lessonId)}/view`, {
        method: 'POST',
      });
    } catch {
      // Non-critical background call
    }
  },

  // ── Search ───────────────────────────────────────────────────────────────
  async search(query: string): Promise<LmsSearchResult> {
    return apiJson<LmsSearchResult>(`/api/lms/search?q=${encodeURIComponent(query)}`);
  },

  // ── File Upload Extraction ───────────────────────────────────────────────
  async uploadSourceFile(
    file: File
  ): Promise<{ filename: string; text: string; word_count: number; preview: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('/api/lms/upload-source', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to extract text from file.' }));
      throw new Error(err.detail || 'Failed to extract text from file.');
    }
    return res.json();
  },

  // ── AI Generation ────────────────────────────────────────────────────────
  async generateLesson(req: GenerateLessonRequest): Promise<LmsLesson> {
    const aiFields = defaultAIRequestFields();
    const payload = {
      ...aiFields,
      class_id: req.class_id,
      subject_id: req.subject_id || null,
      input_type: req.input_type,
      content: req.content,
      title: req.title || undefined,
    };

    return apiJson<LmsLesson>('/api/lms/lessons/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ── Download HTML ────────────────────────────────────────────────────────
  async downloadLessonHtml(lesson: LmsLesson): Promise<void> {
    try {
      const res = await apiFetch(`/api/lms/lessons/${encodeURIComponent(lesson.id)}/download`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const classSlug = lesson.class_slug || 'class';
      const subjectSlug = lesson.subject_slug ? `${lesson.subject_slug}-` : '';
      const lessonSlug = lesson.slug || 'lesson';
      const filename = `${classSlug}-${subjectSlug}${lessonSlug}.html`;

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: build blob client-side if API stream fails
      if (lesson.generated_html) {
        const blob = new Blob([lesson.generated_html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${lesson.slug || 'lesson'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    }
  },

  // ── Visual Reinforcement & Simulation ────────────────────────────────────
  async visualizeLesson(lessonId: string, concept?: string): Promise<VisualExplanationResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<VisualExplanationResult>(
      `/api/lms/lessons/${encodeURIComponent(lessonId)}/visualize`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...aiFields,
          concept: concept || undefined,
        }),
      }
    );
  },

  // ── Easy Read (lighter, less text-heavy rewrite of the lesson's own content) ──
  async generateEasyRead(lessonId: string): Promise<EasyReadResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<EasyReadResult>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/easy-read`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields }),
    });
  },

  /** Reprompt: 'update' edits the existing lesson; 'regenerate' rebuilds it from its source.
   * Either way returns a preview (not saved). */
  async reviseLesson(
    lessonId: string,
    instruction: string,
    mode: 'update' | 'regenerate' = 'update'
  ): Promise<{ generated_html: string; title: string; summary: string }> {
    const aiFields = defaultAIRequestFields();
    return apiJson(`/api/lms/lessons/${encodeURIComponent(lessonId)}/revise`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields, instruction, mode }),
    });
  },

  async generateDeeperExplanation(lessonId: string): Promise<DeeperExplanationResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<DeeperExplanationResult>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/deeper`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields }),
    });
  },

  async generateBreakdown(lessonId: string): Promise<BreakdownResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<BreakdownResult>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/breakdown`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields }),
    });
  },

  async embedVisualInLesson(
    lessonId: string,
    payload: { visual_html: string; title?: string }
  ): Promise<LmsLesson> {
    return apiJson<LmsLesson>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/embed-visual`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ── Voice Assistant ──────────────────────────────────────────────────────
  async askVoiceAssistant(payload: {
    message: string;
    contextTitle: string;
    contextText: string;
  }): Promise<string> {
    const aiFields = defaultAIRequestFields();
    const res = await apiJson<{ text: string }>('/api/lms/voice-chat', {
      method: 'POST',
      body: JSON.stringify({ ...aiFields, ...payload }),
    });
    return res.text;
  },

  // ── Project Track: README/context -> AI-planned implementation modules ──
  /** Ask the AI to (re)decompose the project's README/context into an ordered module outline.
   * Replaces any existing outline and deletes the lessons it pointed to. */
  async planProjectModules(projectId: string): Promise<LmsSubject> {
    const aiFields = defaultAIRequestFields();
    return apiJson<LmsSubject>(`/api/lms/projects/${encodeURIComponent(projectId)}/plan`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields }),
    });
  },

  /** Generate (or regenerate in place) the standalone lesson for one planned module. */
  async generateProjectModule(projectId: string, moduleIndex: number): Promise<ProjectGenerateResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<ProjectGenerateResult>(
      `/api/lms/projects/${encodeURIComponent(projectId)}/modules/${moduleIndex}/generate`,
      { method: 'POST', body: JSON.stringify({ ...aiFields }) }
    );
  },

  /** Insert a user-authored step. `moduleIndex` null = top-level module at `position`;
   * otherwise a sublesson of that module. Returns the updated project. */
  async addProjectStep(
    projectId: string,
    payload: { title: string; focus?: string; context?: string; module_index: number | null; position: number }
  ): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/projects/${encodeURIComponent(projectId)}/steps`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Ask the AI where new context belongs in the outline (judged on module titles/focus).
   * Returns ranked insert targets plus a suggested title/focus for the new step. */
  async suggestProjectPlacement(
    projectId: string,
    payload: { context: string; title?: string }
  ): Promise<PlacementSuggestion> {
    const aiFields = defaultAIRequestFields();
    return apiJson<PlacementSuggestion>(
      `/api/lms/projects/${encodeURIComponent(projectId)}/suggest-placement`,
      { method: 'POST', body: JSON.stringify({ ...aiFields, ...payload }) }
    );
  },

  /** Move a module (moduleIndex null) or one of a module's sublessons to a new position. */
  async reorderProjectPlan(
    projectId: string,
    payload: { module_index: number | null; from_index: number; to_index: number }
  ): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/projects/${encodeURIComponent(projectId)}/reorder`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Break an already-generated module lesson down into smaller, sequential sublessons the
   * user can then generate individually. Requires the module to be generated first. */
  async breakDownProjectModule(projectId: string, moduleIndex: number): Promise<LmsSubject> {
    const aiFields = defaultAIRequestFields();
    return apiJson<LmsSubject>(
      `/api/lms/projects/${encodeURIComponent(projectId)}/modules/${moduleIndex}/breakdown`,
      { method: 'POST', body: JSON.stringify({ ...aiFields }) }
    );
  },

  /** Generate (or regenerate in place) the standalone lesson for one sublesson. */
  async generateProjectSublesson(
    projectId: string,
    moduleIndex: number,
    subIndex: number
  ): Promise<ProjectGenerateResult> {
    const aiFields = defaultAIRequestFields();
    return apiJson<ProjectGenerateResult>(
      `/api/lms/projects/${encodeURIComponent(projectId)}/modules/${moduleIndex}/sublessons/${subIndex}/generate`,
      { method: 'POST', body: JSON.stringify({ ...aiFields }) }
    );
  },

  // ── Long context handling (multi-doc + long text) ───────────────────────
  /** AI-condense a subject/project's long-form context (project_context for a project,
   * ai_context for a subject) into a compact summary. Generation then prefers this
   * summary over a raw-text prefix, so a long multi-document upload's substance
   * actually reaches the prompt instead of being silently cut off. */
  async summarizeContext(subjectId: string): Promise<LmsSubject> {
    const aiFields = defaultAIRequestFields();
    return apiJson<LmsSubject>(`/api/lms/subjects/${encodeURIComponent(subjectId)}/summarize-context`, {
      method: 'POST',
      body: JSON.stringify({ ...aiFields }),
    });
  },

  /** Discard the stored summary, reverting generation to a raw-text prefix. */
  async clearContextSummary(subjectId: string): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/subjects/${encodeURIComponent(subjectId)}/summarize-context`, {
      method: 'DELETE',
    });
  },

  // ── RAG index (retrieval-augmented generation over long context) ────────
  /** Chunk + embed + index this subject/project's raw context. Requires an
   * embedding-capable provider (OpenAI, Gemini, or a reachable local Ollama) --
   * throws with a clear, actionable message if none is configured. Once indexed,
   * generation automatically pulls the most relevant excerpts for each specific
   * module/lesson, grounding it in the source document rather than the general
   * summary alone. */
  async buildRagIndex(subjectId: string): Promise<LmsSubject & { rag_chunk_count: number }> {
    const aiFields = defaultAIRequestFields();
    return apiJson<LmsSubject & { rag_chunk_count: number }>(
      `/api/lms/subjects/${encodeURIComponent(subjectId)}/rag/index`,
      { method: 'POST', body: JSON.stringify({ ...aiFields }) }
    );
  },

  /** Drop the RAG index -- generation falls back to the summary/raw-text prefix. */
  async clearRagIndex(subjectId: string): Promise<LmsSubject & { rag_chunk_count: number }> {
    return apiJson<LmsSubject & { rag_chunk_count: number }>(
      `/api/lms/subjects/${encodeURIComponent(subjectId)}/rag/index`,
      { method: 'DELETE' }
    );
  },

  /** Chunk count for this subject/project's RAG index (0 if never built). */
  async getRagIndexStatus(subjectId: string): Promise<{ subject_id: string; rag_chunk_count: number }> {
    return apiJson<{ subject_id: string; rag_chunk_count: number }>(
      `/api/lms/subjects/${encodeURIComponent(subjectId)}/rag/index`
    );
  },
};
