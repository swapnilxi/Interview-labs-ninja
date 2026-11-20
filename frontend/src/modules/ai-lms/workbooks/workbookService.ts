import { apiJson } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type {
  LearnerRow,
  ProgressView,
  WorkbookCreate,
  WorkbookDetail,
  WorkbookSummary,
  WorkbookUpdate,
} from './types';

/** The workbook endpoints (`/api/lms/...`, the same paths in fastapi and nextjs-api mode). */
export const workbookService = {
  list(classSlug: string): Promise<WorkbookSummary[]> {
    return apiJson<WorkbookSummary[]>(
      `/api/lms/classes/${encodeURIComponent(classSlug)}/workbooks`
    );
  },

  create(classSlug: string, payload: WorkbookCreate): Promise<WorkbookDetail> {
    return apiJson<WorkbookDetail>(`/api/lms/classes/${encodeURIComponent(classSlug)}/workbooks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  get(workbookId: string): Promise<WorkbookDetail> {
    return apiJson<WorkbookDetail>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}`);
  },

  update(workbookId: string, changes: WorkbookUpdate): Promise<WorkbookDetail> {
    return apiJson<WorkbookDetail>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },

  /** Plan the chapters (one AI call, with the model chosen in Config). Every chapter starts unwritten. */
  generateOutline(workbookId: string): Promise<WorkbookDetail> {
    return apiJson<WorkbookDetail>(
      `/api/lms/workbooks/${encodeURIComponent(workbookId)}/generate/outline`,
      { method: 'POST', body: JSON.stringify(defaultAIRequestFields()) }
    );
  },

  /** Write one chapter's readings and exercises (one AI call). */
  generateSection(workbookId: string, sectionId: string): Promise<WorkbookDetail> {
    return apiJson<WorkbookDetail>(
      `/api/lms/workbooks/${encodeURIComponent(workbookId)}/generate/sections/${encodeURIComponent(sectionId)}`,
      { method: 'POST', body: JSON.stringify(defaultAIRequestFields()) }
    );
  },

  /** The caller's own answers and progress. */
  getProgress(workbookId: string): Promise<ProgressView> {
    return apiJson<ProgressView>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}/progress`);
  },

  /** Save the caller's whole document; `version` is the one last loaded or saved (a stale one is a 409). */
  saveProgress(
    workbookId: string,
    version: number,
    state: unknown,
    keepalive = false
  ): Promise<ProgressView> {
    return apiJson<ProgressView>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ version, state }),
      keepalive,
    });
  },

  /** Delete the caller's own progress in this workbook. */
  resetProgress(workbookId: string): Promise<ProgressView> {
    return apiJson<ProgressView>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}/progress`, {
      method: 'DELETE',
    });
  },

  /** Instructors: who has started a class workbook (names, percentages, dates; never answers). */
  listLearners(workbookId: string): Promise<LearnerRow[]> {
    return apiJson<LearnerRow[]>(`/api/lms/workbooks/${encodeURIComponent(workbookId)}/learners`);
  },

  /** Instructors: reset one learner's progress. */
  resetLearner(workbookId: string, userId: number): Promise<{ reset: true; user_id: number }> {
    return apiJson(
      `/api/lms/workbooks/${encodeURIComponent(workbookId)}/learners/${userId}/progress`,
      { method: 'DELETE' }
    );
  },

  /** "Explain this to me": one block explained again in simpler words (one AI call, nothing saved). */
  explain(workbookId: string, blockId: string, question: string): Promise<{ text: string }> {
    return apiJson<{ text: string }>(
      `/api/lms/workbooks/${encodeURIComponent(workbookId)}/explain`,
      {
        method: 'POST',
        body: JSON.stringify({ ...defaultAIRequestFields(), block_id: blockId, question }),
      }
    );
  },

  remove(workbookId: string): Promise<{ deleted: true; id: string }> {
    return apiJson(`/api/lms/workbooks/${encodeURIComponent(workbookId)}`, { method: 'DELETE' });
  },
};
