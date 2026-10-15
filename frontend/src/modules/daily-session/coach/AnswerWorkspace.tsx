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
          <label htmlFor="answer-box" className="text-sm font-extrabold text-foreground">
            ✍️ Your answer
          </label>
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
            {KIND_LABEL[kind]}
          </span>
        </div>
        {mic.error && <p className="mb-1.5 text-xs font-semibold text-rose-500">{mic.error}</p>}
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
          className="block w-full resize-y rounded-2xl border-2 border-border bg-input py-3 pl-4 pr-[3.25rem] pb-[3rem] text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none"
        />
        <VoiceMicButton state={mic.state} onClick={mic.toggle} className="absolute bottom-[0.6rem] right-[0.6rem]" />
        {recording && (
          <span className="pointer-events-none absolute bottom-[0.9rem] right-[3.4rem] text-xs font-bold text-rose-500">Listening…</span>
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
