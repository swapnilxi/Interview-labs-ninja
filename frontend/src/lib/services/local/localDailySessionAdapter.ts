'use client';

/**
 * In-browser fallback for the Daily Session feature, used only when the real
 * backend is unreachable (see lib/http/backendAvailability.ts) — not a
 * guest-mode adapter like localTodoAdapter/localGoalAdapter, since Daily
 * Session has no guest mode at all today. Data lives in localStorage, keyed
 * by session date; it is never auto-synced to the backend once it comes back.
 *
 * AI-powered bits (generate-answer, resume PDF/DOCX extraction) are not
 * reimplemented here — DailySessionModule already degrades those gracefully
 * (canned explanations, manual paste) when the backend is unreachable.
 */

import type { Question } from '../questionsService';
import type { SessionAnswer, SessionProgressRow } from '../sessionService';

interface OfflineSessionRecord {
  sessionId: number;
  sessionCode: string;
  sessionDate: string;
  questions: Question[];
  answers: Record<string, SessionProgressRow>;
}

const STORAGE_KEY = 'ninja_offline_daily_sessions';

function readAll(): Record<string, OfflineSessionRecord> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, OfflineSessionRecord>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Mirrors the backend's format_session_code (e.g. "W34/20/August"). */
function formatSessionCode(d: Date): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `W${week}/${day}/${month}`;
}

export const localDailySessionAdapter = {
  createSessionWithQuestions(
    difficultyHint: string,
    defaultQuestions: Omit<Question, 'id'>[],
  ): { session_id: number; session_date: string; session_code: string } {
    const now = new Date();
    const sessionDate = now.toISOString().slice(0, 10);
    const sessionId = Date.now();
    const sessionCode = formatSessionCode(now);

    const questions: Question[] = defaultQuestions.map((q, idx) => ({
      ...q,
      id: String(sessionId + idx),
      difficulty: difficultyHint !== 'Mixed' ? (difficultyHint as Question['difficulty']) : q.difficulty,
      dateEncountered: sessionDate,
    }));

    const all = readAll();
    all[sessionDate] = { sessionId, sessionCode, sessionDate, questions, answers: {} };
    writeAll(all);

    return { session_id: sessionId, session_date: sessionDate, session_code: sessionCode };
  },

  getQuestions(sessionDate: string): Question[] {
    return readAll()[sessionDate]?.questions ?? [];
  },

  getSessionByDate(sessionDate: string): SessionProgressRow[] {
    const rec = readAll()[sessionDate];
    return rec ? Object.values(rec.answers) : [];
  },

  saveSessionAnswers(sessionDate: string, answers: SessionAnswer[]): void {
    const all = readAll();
    const rec = all[sessionDate];
    if (!rec) return;
    for (const a of answers) {
      rec.answers[a.questionText] = {
        id: a.questionId || `${a.sessionDate}::${a.questionText}`,
        sessionDate: a.sessionDate,
        questionText: a.questionText,
        answerText: a.answerText,
        category: a.category,
        difficulty: a.difficulty,
        questionType: a.questionType,
        isCompleted: a.isCompleted,
      };
    }
    writeAll(all);
  },

  /** Mirrors the shape of backend export_md.render_markdown_for_day, plus the learner's saved answers. */
  renderMarkdown(sessionDate: string, questions: Question[], answers: Record<string, string>): string {
    const lines: string[] = [`# Lab-Ninja Daily Questions - ${sessionDate}`, ''];
    const renderSection = (title: string, qs: Question[]) => {
      if (!qs.length) return;
      lines.push(`## ${title}`, '');
      qs.forEach((q, i) => {
        lines.push(`### ${i + 1}. ${q.subType} (${q.difficulty})`);
        if (q.questionType) {
          lines.push(`**Topics**: *${q.questionType}*`, '');
        }
        lines.push(q.questionText, '');
        const answer = answers[q.questionText];
        if (answer && answer.trim()) {
          lines.push('**Your Answer:**', '', answer.trim(), '');
        }
      });
    };
    renderSection('Section A — Core Interview Track', questions.slice(0, 5));
    renderSection('Section B — Computer Vision Excellence Track', questions.slice(5, 10));
    return lines.join('\n');
  },
};
