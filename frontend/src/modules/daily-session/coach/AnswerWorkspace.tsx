'use client';

import React, { useRef, useState } from 'react';
import AnswerCoach from './AnswerCoach';
import { useVoiceInput } from '@/components/voice/useVoiceInput';
import VoiceMicButton from '@/components/voice/VoiceMicButton';
import CodeSpace from './CodeSpace';
import { detectKind, wantsCode, KIND_LABEL } from './questionKind';

export interface WorkspaceQuestion {
  questionText: string;
  category?: string;
  subType?: string;
  difficulty?: string;
}

interface Props {
  question: WorkspaceQuestion;
  answer: string;
  onAnswerChange: (v: string) => void;
  code: string;
  onCodeChange: (v: string) => void;
  /** Rows for the written-answer box. */
  rows?: number;
}

/** Written answer + (for DSA / System Design) a code space + the AI coach. */
export default function AnswerWorkspace({ question, answer, onAnswerChange, code, onCodeChange, rows = 7 }: Props) {
  const kind = detectKind(question.subType, question.category, question.questionText);
  const [language, setLanguage] = useState(kind === 'system_design' ? 'Pseudo-code' : 'Python');
  // Dictation appends to the end of the answer (a ref keeps it correct across several chunks).
  const answerRef = useRef(answer);
  answerRef.current = answer;
  const mic = useVoiceInput((text) => {
    const cur = answerRef.current;
    onAnswerChange(cur && !/\s$/.test(cur) ? `${cur} ${text}` : `${cur}${text}`);
  });
  const recording = mic.state === 'recording';

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="answer-box" className="text-sm font-semibold ds-ink">
            Your answer
          </label>
          <span className="ds-chip ds-tone-indigo">{KIND_LABEL[kind]}</span>
        </div>
        {mic.error && <p className="mb-1.5 text-xs font-semibold ds-tone-rose ds-tone-text">{mic.error}</p>}
        <div className="relative">
        <textarea
          id="answer-box"
          data-no-mic
          rows={rows}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder={
            kind === 'behavioral'
              ? 'Situation → Task → Action (what *you* did) → Result (with numbers)…'
              : 'Explain your thinking out loud: approach, trade-offs, edge cases…'
          }
          className="ds-field ds-field-mic resize-y"
        />
        <VoiceMicButton state={mic.state} onClick={mic.toggle} className="absolute bottom-[0.6rem] right-[0.6rem]" />
        {recording && (
          <span className="pointer-events-none absolute bottom-[0.9rem] right-[3.4rem] text-xs font-bold ds-tone-rose ds-tone-text">Listening…</span>
        )}
        </div>
      </div>

      {wantsCode(kind) && (
        <CodeSpace kind={kind} value={code} onChange={onCodeChange} language={language} onLanguageChange={setLanguage} />
      )}

      <AnswerCoach
        key={question.questionText}
        input={{
          questionText: question.questionText,
          answerText: answer,
          codeText: code,
          language: wantsCode(kind) ? language : undefined,
          category: question.category,
          subType: question.subType,
          difficulty: question.difficulty,
        }}
        onUseExpanded={onAnswerChange}
      />
    </div>
  );
}
