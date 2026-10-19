'use client';

import React, { useEffect, useRef, useState } from 'react';
import RichText from './RichText';
import CodeSpace from './CodeSpace';
import { EvaluationView } from './AnswerCoach';
import { answerCoachService, type ChatTurn, type Evaluation, type LearnReply } from './answerCoachService';
import { detectKind, wantsCode } from './questionKind';
import type { WorkspaceQuestion } from './AnswerWorkspace';
import { speak, stopSpeaking } from '../companion/voice';
import { useVoiceInput } from '@/components/voice/useVoiceInput';
import VoiceMicButton from '@/components/voice/VoiceMicButton';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';

const DEPTH_LABELS = ['Surface', 'Mechanism', 'Edge cases', 'Trade-offs', 'Scale'];

interface Props {
  question: WorkspaceQuestion;
  /** Called when the session ends and a review is produced. */
  onEvaluated?: (ev: Evaluation) => void;
}

/** AI Learn Chat: a Socratic AI tutor that teaches one topic in depth, step by step, then reviews what you learned. */
export default function AILearnChat({ question, onEvaluated }: Props) {
  const kind = detectKind(question.subType, question.category, question.questionText);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [meta, setMeta] = useState<LearnReply | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState(kind === 'system_design' ? 'Pseudo-code' : 'Python');
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const mic = useVoiceInput((text) => {
    const cur = inputRef.current;
    setInput(cur && !/\s$/.test(cur) ? `${cur} ${text}` : `${cur}${text}`);
  });
  const lastSentCode = useRef('');
  const started = turns.length > 0 || busy;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  useEffect(() => () => stopSpeaking(), []);

  const ask = async (next: ChatTurn[]) => {
    setBusy(true);
    setError(null);
    try {
      const reply = await answerCoachService.learnTurn(question, next);
      setMeta(reply);
      setTurns([...next, { role: 'tutor', content: reply.message }]);
      if (voiceOn) speak(reply.message, 'calm', null, 1);
    } catch (e: any) {
      setTurns(next); // keep the learner's message so they can retry
      setError(e?.message || 'The tutor is unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const requireLogin = () => {
    if (isLoggedIn()) return false;
    openLoginModal({ feature: 'AI Learn Chat', redirectTo: `${window.location.pathname}${window.location.search}` });
    return true;
  };

  const start = () => {
    if (requireLogin()) return;
    void ask([]);
  };

  const send = (text: string) => {
    const body = text.trim();
    if (!body || busy || meta?.wrap_up) return;
    let content = body;
    if (showCode && code.trim() && code !== lastSentCode.current) {
      content += `\n\n\`\`\`${language.toLowerCase()}\n${code.trim()}\n\`\`\``;
      lastSentCode.current = code;
    }
    setInput('');
    void ask([...turns, { role: 'learner', content }]);
  };

  const retry = () => {
    // The last turn is the learner's unanswered message.
    if (turns.length === 0 || turns[turns.length - 1].role !== 'learner') return void ask([]);
    void ask(turns);
  };

  const endAndReview = async () => {
    if (requireLogin()) return;
    setEvaluating(true);
    setError(null);
    stopSpeaking();
    try {
      const transcript = turns.map((t) => `${t.role === 'tutor' ? 'Tutor' : 'Learner'}: ${t.content}`).join('\n\n');
      const result = await answerCoachService.evaluate({
        questionText: question.questionText,
        answerText: transcript,
        category: question.category,
        subType: question.subType,
        difficulty: question.difficulty,
        isTranscript: true,
      });
      setEv(result);
      onEvaluated?.(result);
    } catch (e: any) {
      setError(e?.message || 'Could not review the session.');
    } finally {
      setEvaluating(false);
    }
  };

  const restart = () => {
    stopSpeaking();
    setTurns([]);
    setMeta(null);
    setEv(null);
    setError(null);
    setInput('');
    lastSentCode.current = '';
  };

  const name = meta?.tutor.name ?? 'Tutor';
  const candidateCount = turns.filter((t) => t.role === 'learner').length;
  const depth = meta?.depth ?? 0;

  if (!started) {
    return (
      <div className="rounded-3xl border-2 border-dashed mix-border-primary/40 lab-tint p-5 text-center">
        <div className="text-3xl" aria-hidden>🎙️</div>
        <h4 className="mt-1 font-heading text-base font-extrabold text-foreground">AI Learn Chat</h4>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Learn this topic in depth by talking it through. Your AI tutor starts from what you already know, asks guiding questions, explains when you get stuck, and goes deeper step by step. No grades or pressure. Afterwards you get a review of what you learned and what to revisit.
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-3 rounded-2xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_4px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] transition active:translate-y-[2px] active:shadow-none"
        >
          Start learning
        </button>
        {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: who, depth, controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl mix-bg-foreground/[0.05] px-3 py-2">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground" aria-hidden>
          {name.replace('Dr. ', '')[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-foreground">{name} <span className="font-semibold text-muted-foreground">· {meta?.tutor.role ?? '…'} (AI)</span></div>
          <div className="mt-1 flex items-center gap-1" aria-label={`Depth ${depth} of 5`}>
            {DEPTH_LABELS.map((l, i) => (
              <span key={l} title={l} className={`h-1.5 flex-1 rounded-full transition-colors ${i < depth ? 'bg-primary' : 'bg-border'}`} />
            ))}
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {depth ? `${DEPTH_LABELS[depth - 1]}${meta?.focus ? ` · ${meta.focus}` : ''}` : 'Getting started'} · {candidateCount}/{meta?.max_turns ?? 8} messages
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setVoiceOn((v) => !v);
            stopSpeaking();
          }}
          aria-pressed={voiceOn}
          title="Read the tutor's messages aloud"
          className={`rounded-full border-2 px-2.5 py-1 text-xs font-extrabold ${voiceOn ? 'border-primary lab-tint lab-ink' : 'border-border text-muted-foreground'}`}
        >
          {voiceOn ? '🔊 On' : '🔈 Off'}
        </button>
      </div>

      {/* Conversation */}
      <div ref={scroller} className="max-h-[26rem] min-h-[12rem] space-y-3 overflow-y-auto rounded-2xl border-2 border-border bg-card p-3" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'learner' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                t.role === 'learner'
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md border-2 mix-border-primary/30 bg-card text-foreground'
              }`}
            >
              {t.role === 'learner' ? <RichText text={t.content} className="text-primary-foreground [&_code]:mix-bg-primary-foreground/20" /> : <span className="whitespace-pre-wrap">{t.content}</span>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border-2 mix-border-primary/30 bg-card px-3.5 py-3" aria-label={`${name} is typing`}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={retry} className="rounded-full border border-rose-300 px-2.5 py-0.5 text-xs font-extrabold">Retry</button>
        </div>
      )}

      {!ev && (
        <>
          {wantsCode(kind) && showCode && (
            <CodeSpace kind={kind} value={code} onChange={setCode} language={language} onLanguageChange={setLanguage} />
          )}
          {meta?.wrap_up ? (
            <p className="rounded-xl lab-tint px-3 py-2 text-center text-xs font-semibold lab-ink">Session wrapped up. End it to see your review.</p>
          ) : (
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
              <textarea
                data-no-mic
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                disabled={busy || turns.length === 0}
                placeholder="Reply to your tutor… (Enter to send, Shift+Enter for a new line)"
                aria-label="Your reply"
                className="block min-h-[3rem] w-full resize-y rounded-2xl border-2 border-border bg-input py-2.5 pl-3.5 pr-[3rem] text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <VoiceMicButton state={mic.state} onClick={mic.toggle} size="sm" className="absolute bottom-[0.55rem] right-[0.5rem]" />
              </div>
              <button
                type="button"
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="h-[3rem] rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-[0_4px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!meta?.wrap_up && (
              <button
                type="button"
                onClick={() => send("I'm stuck. Could you explain this part to me?")}
                disabled={busy || turns.length === 0}
                className="rounded-full border-2 mix-border-primary/40 lab-tint px-3.5 py-1.5 text-xs font-extrabold lab-ink disabled:opacity-50"
              >
                😵 Explain it to me
              </button>
            )}
            {wantsCode(kind) && (
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="rounded-full border-2 border-border px-3.5 py-1.5 text-xs font-extrabold text-foreground"
              >
                {showCode ? 'Hide code space' : kind === 'dsa' ? '⌨️ Write code' : '📐 Sketch design'}
              </button>
            )}
            <button
              type="button"
              onClick={endAndReview}
              disabled={evaluating || busy || candidateCount === 0}
              className="ml-auto rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_0_0_#059669] transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {evaluating ? 'Reviewing…' : 'End & review'}
            </button>
          </div>
        </>
      )}

      {ev && (
        <div className="space-y-3">
          <EvaluationView ev={ev} />
          <button type="button" onClick={restart} className="rounded-full border-2 border-border px-4 py-1.5 text-xs font-extrabold text-foreground">
            Learn again
          </button>
        </div>
      )}
    </div>
  );
}
