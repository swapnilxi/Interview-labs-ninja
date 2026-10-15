import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type { QuestionKind } from './questionKind';

export interface CoachInput {
  questionText: string;
  answerText: string;
  codeText?: string;
  language?: string;
  category?: string;
  subType?: string;
  difficulty?: string;
  /** answerText is a tutor/learner chat transcript. */
  isTranscript?: boolean;
}

export interface ChatTurn {
  role: 'tutor' | 'learner';
  content: string;
}

export interface LearnReply {
  tutor: { name: string; role: string };
  message: string;
  depth: number;
  focus: string;
  wrap_up: boolean;
  learner_turns: number;
  max_turns: number;
}

export interface RubricCriterion {
  key: string;
  label: string;
  weight: number;
  score: number; // 0-5
  comment: string;
  improve: string;
}

export interface Evaluation {
  kind: QuestionKind;
  overall: number; // 0-100
  level: 'Excellent' | 'Strong' | 'Developing' | 'Needs work';
  criteria: RubricCriterion[];
  strengths: string[];
  factual_issues: { claim: string; correction: string; severity: 'minor' | 'major' }[];
  missing: string[];
  improvements: string[];
  better_answer: string;
  follow_ups: string[];
  confidence_notes: string;
}

export interface Expansion {
  kind: QuestionKind;
  summary: string;
  expanded_answer: string;
  added_points: string[];
  corrections: { claim: string; correction: string }[];
  confidence_notes: string;
}

const body = (i: CoachInput) =>
  JSON.stringify({
    question_text: i.questionText,
    answer_text: i.answerText,
    code_text: i.codeText || undefined,
    language: i.language || undefined,
    category: i.category,
    sub_type: i.subType,
    difficulty: i.difficulty,
    is_transcript: i.isTranscript || undefined,
    ...defaultAIRequestFields(),
  });

async function post<T>(path: string, input: CoachInput): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', body: body(input) });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

export const answerCoachService = {
  evaluate: (input: CoachInput) => post<Evaluation>('/sessions/evaluate-answer', input),
  expand: (input: CoachInput) => post<Expansion>('/sessions/expand-answer', input),
  async learnTurn(input: Pick<CoachInput, 'questionText' | 'category' | 'subType' | 'difficulty'>, messages: ChatTurn[]): Promise<LearnReply> {
    const res = await apiFetch('/sessions/learn-chat', {
      method: 'POST',
      body: JSON.stringify({
        question_text: input.questionText,
        category: input.category,
        sub_type: input.subType,
        difficulty: input.difficulty,
        messages,
        ...defaultAIRequestFields(),
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
};
