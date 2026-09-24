import { apiFetch, apiJson, API_BASE_URL } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type {
  ContinueLearningItem,
  GenerateLessonRequest,
  LmsClass,
  LmsLesson,
  LmsNavigation,
  LmsSearchResult,
  LmsSubject,
  VisualExplanationResult,
} from '../types';

export const lmsService = {
  // ── Classes ──────────────────────────────────────────────────────────────
  async getClasses(): Promise<LmsClass[]> {
    return apiJson<LmsClass[]>('/api/lms/classes');
  },

  async getClass(idOrSlug: string): Promise<LmsClass> {
    return apiJson<LmsClass>(`/api/lms/classes/${encodeURIComponent(idOrSlug)}`);
  },

  async createClass(payload: { name: string; description?: string; icon?: string; ai_context?: string }): Promise<LmsClass> {
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
    payload: { name: string; description?: string; ai_context?: string }
  ): Promise<LmsSubject> {
    return apiJson<LmsSubject>(`/api/lms/classes/${encodeURIComponent(classIdOrSlug)}/subjects`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateSubject(
    subjectId: string,
    payload: { name?: string; description?: string; ai_context?: string }
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

  async getLesson(lessonId: string): Promise<LmsLesson> {
    return apiJson<LmsLesson>(`/api/lms/lessons/${encodeURIComponent(lessonId)}`);
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
    }
  ): Promise<LmsLesson> {
    return apiJson<LmsLesson>(`/api/lms/lessons/${encodeURIComponent(lessonId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
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
    return apiJson<VisualExplanationResult>(`/api/lms/lessons/${encodeURIComponent(lessonId)}/visualize`, {
      method: 'POST',
      body: JSON.stringify({
        ...aiFields,
        concept: concept || undefined,
      }),
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
};
