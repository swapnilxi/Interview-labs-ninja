'use client';

import { apiFetch } from '../http/apiClient';

export interface Question {
  id: string;
  questionText: string;
  category: 'Interview' | 'CV Skill';
  subType: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionType?: string;
  dateEncountered: string;
  /** The session this question was generated for (undefined for offline/local questions). */
  sessionId?: string;
  lastReviewed: string | null;
  userPerformance?: number;
}

function mapBackendQuestion(q: any): Question {
  // Map category code to frontend values
  let category: 'Interview' | 'CV Skill' = 'Interview';
  if (q.category === 'cv_skill') {
    category = 'CV Skill';
  }

  // Normalize difficulty casing
  let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
  const diffLower = String(q.difficulty).toLowerCase();
  if (diffLower === 'easy') {
    difficulty = 'Easy';
  } else if (diffLower === 'hard') {
    difficulty = 'Hard';
  }

  return {
    id: String(q.id),
    questionText: q.question_text,
    category,
    subType: q.sub_type,
    difficulty,
    questionType: q.question_type || q.sub_type,
    dateEncountered: q.question_date,
    sessionId: q.session_id != null ? String(q.session_id) : undefined,
    lastReviewed: q.last_reviewed || null,
    userPerformance: q.user_performance ?? undefined,
  };
}

export const questionsService = {
  async getAll(): Promise<Question[]> {
    try {
      const res = await apiFetch('/questions');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      return data.map(mapBackendQuestion);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
      return [];
    }
  },

  async getById(id: string): Promise<Question | null> {
    try {
      const res = await apiFetch(`/questions/${id}`);
      if (res.ok) {
        const data = await res.json();
        return mapBackendQuestion(data);
      }
    } catch (error) {
      console.error(`Failed to fetch question ${id}:`, error);
    }
    const all = await this.getAll();
    return all.find((q) => String(q.id) === String(id)) || null;
  },

  async upsertMany(questions: Omit<Question, 'id'>[]): Promise<void> {
    try {
      // 1. Create a session first
      const sessionRes = await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          difficulty_hint: 'mixed',
          cv_present: false,
          jd_present: false,
        }),
      });
      if (!sessionRes.ok) throw new Error('Failed to create session');
      const { session_id } = await sessionRes.json();

      // 2. Map questions format to backend QuestionIn
      const backendQuestions = questions.map((q) => {
        let categoryCode = 'interview';
        if (q.category === 'CV Skill') {
          categoryCode = 'cv_skill';
        }
        
        return {
          section: 'A', // Default section
          number: 1, // Placeholder number
          category: categoryCode,
          sub_type: q.subType,
          difficulty: q.difficulty.toLowerCase(),
          topics: [],
          question_text: q.questionText,
          question_type: q.questionType || q.subType,
        };
      });

      // 3. Post questions batch
      const res = await apiFetch('/sessions/questions', {
        method: 'POST',
        body: JSON.stringify({
          session_id,
          questions: backendQuestions,
        }),
      });
      if (!res.ok) throw new Error('Failed to insert questions batch');
    } catch (error) {
      console.error('Failed to upsert questions:', error);
    }
  },

  async updatePerformance(id: string, performance: number): Promise<void> {
    try {
      const res = await apiFetch(`/questions/${id}/performance`, {
        method: 'PATCH',
        body: JSON.stringify({
          user_performance: performance,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
    } catch (error) {
      console.error(`Failed to update performance for question ${id}:`, error);
    }
  },

  async clearDuplicates(): Promise<{ cleared_count: number; message: string }> {
    try {
      const res = await apiFetch('/questions/clear-duplicates', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to clear duplicates:', error);
      throw error;
    }
  },

  async importDeck(payload: {
    date?: string;
    session?: string;
    format?: string;
    questions: any[];
  }): Promise<{ success: boolean; total: number; inserted: number; duplicates: number; message: string }> {
    try {
      const res = await apiFetch('/questions/import-deck', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to import deck to question bank:', error);
      throw error;
    }
  },
};
