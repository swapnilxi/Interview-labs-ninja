'use client';

import { apiFetch } from '../http/apiClient';

export interface SessionAnswer {
  questionId?: string;
  questionText: string;
  answerText: string;
  category: string;
  difficulty: string;
  questionType: string;
  isCompleted: boolean;
  sessionDate: string;
}

export interface SessionProgressRow {
  id: string;
  sessionDate: string;
  questionText: string;
  answerText: string;
  category: string;
  difficulty: string;
  questionType: string;
  isCompleted: boolean;
}

export interface RecentSession {
  sessionId: string;
  sessionDate: string;
  questionCount: number;
  answeredCount: number;
}

export const sessionService = {
  /** The caller's latest sessions (newest first) with how many questions each has and how many are answered. */
  async getRecentSessions(limit = 10): Promise<RecentSession[]> {
    try {
      const res = await apiFetch(`/sessions/recent?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const rows = await res.json();
      return rows.map((r: any) => ({
        sessionId: String(r.session_id),
        sessionDate: r.session_date,
        questionCount: r.question_count,
        answeredCount: r.answered_count,
      }));
    } catch (error) {
      console.error('Failed to get recent sessions:', error);
      return [];
    }
  },

  async saveSessionAnswers(answers: SessionAnswer[]): Promise<void> {
    try {
      const res = await apiFetch('/session-progress', {
        method: 'POST',
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
    } catch (error) {
      console.error('Failed to save session answers:', error);
    }
  },

  async getSessionByDate(date: string): Promise<SessionProgressRow[]> {
    try {
      const res = await apiFetch(`/session-progress?session_date=${encodeURIComponent(date)}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error(`Failed to get session by date ${date}:`, error);
      return [];
    }
  },

  async getProgressStats(userId?: string): Promise<{
    totalSessions: number;
    totalAnswered: number;
    completedAnswers: number;
    recentDates: string[];
    recentSessions?: { date: string; answered: number; completed: number }[];
  }> {
    try {
      const res = await apiFetch('/session-progress/stats');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to get progress stats:', error);
      return { totalSessions: 0, totalAnswered: 0, completedAnswers: 0, recentDates: [], recentSessions: [] };
    }
  },
};
