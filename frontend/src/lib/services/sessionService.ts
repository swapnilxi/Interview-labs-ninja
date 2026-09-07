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

export const sessionService = {
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
  }> {
    try {
      const res = await apiFetch('/session-progress/stats');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to get progress stats:', error);
      return { totalSessions: 0, totalAnswered: 0, completedAnswers: 0, recentDates: [] };
    }
  },
};
