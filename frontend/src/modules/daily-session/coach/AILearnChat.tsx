'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import RichText from './RichText';
import CodeSpace from './CodeSpace';
import { EvaluationView } from './AnswerCoach';
import {
  answerCoachService,
  type ChatTurn,
  type Evaluation,
  type LearnReply,
} from './answerCoachService';
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
    } catch (e: unknown) {
      setTurns(next); // keep the learner's message so they can retry
      setError(
        (e as { message?: string } | null)?.message || 'The tutor is unavailable. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const requireLogin = () => {
    if (isLoggedIn()) return false;
    openLoginModal({
      feature: 'AI Learn Chat',
      redirectTo: `${window.location.pathname}${window.location.search}`,
    });
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
      const transcript = turns
        .map((t) => `${t.role === 'tutor' ? 'Tutor' : 'Learner'}: ${t.content}`)
        .join('\n\n');
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
    } catch (e: unknown) {
      setError((e as { message?: string } | null)?.message || 'Could not review the session.');
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
      <div className="bs-tutor-intro">
        <span className="ds-icon-tile ds-icon-tile-lg ds-tone-indigo">
          <Icon name="ChatBubbleLeftRightIcon" variant="solid" size={22} />
        </span>
        <h4 className="ds-h3 mt-3">Learn with an AI tutor</h4>
        <p className="mx-auto mt-1 max-w-[30rem] text-sm leading-relaxed ds-muted">
          Talk the topic through. Your tutor starts from what you already know and goes one step
          deeper at a time.
        </p>
        <ul className="mx-auto mt-4 grid max-w-[30rem] gap-2.5 text-left text-[13px] leading-snug ds-muted">
          <li className="flex items-start gap-2.5">
            <FlatIcon name="chat" size={17} className="mt-px" />
            <span>Guiding questions first, and an explanation whenever you get stuck.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <FlatIcon name="ok" size={17} className="mt-px" />
            <span>No grades or pressure while you learn.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <FlatIcon name="chart" size={17} className="mt-px" />
            <span>Afterwards, a review of what you learned and what to revisit.</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={start}
          className="ds-btn ds-btn-soft ds-tone-indigo mt-5 w-full sm:w-auto sm:min-w-[12rem]"
        >
          Start learning
        </button>
        {error && (
          <p className="ds-banner ds-tone-rose mt-3 text-left text-xs" role="alert">
            <Icon name="ExclamationTriangleIcon" variant="solid" size={15} />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: who, how deep, read-aloud */}
      <div className="flex items-center gap-3 px-0.5">
        <span
          className="ds-icon-tile bs-round ds-tone-indigo text-sm font-semibold"
          aria-hidden="true"
        >
          {name.replace('Dr. ', '')[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold ds-ink">
            {name} <span className="font-normal ds-faint">· {meta?.tutor.role ?? '…'} (AI)</span>
          </p>
          <div className="bs-depth mt-1.5" aria-label={`Depth ${depth} of 5`} role="img">
            {DEPTH_LABELS.map((l, i) => (
              <span key={l} title={l} data-on={i < depth} />
            ))}
          </div>
          <p className="mt-1 text-xs ds-faint">
            {depth
              ? `${DEPTH_LABELS[depth - 1]}${meta?.focus ? ` · ${meta.focus}` : ''}`
              : 'Getting started'}{' '}
            ·{' '}
            <span className="ds-num">
              {candidateCount}/{meta?.max_turns ?? 8}
            </span>{' '}
            messages
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setVoiceOn((v) => !v);
            stopSpeaking();
          }}
          aria-pressed={voiceOn}
          aria-label={voiceOn ? 'Reading aloud. Tap to stop' : "Read the tutor's messages aloud"}
          title="Read the tutor's messages aloud"
          className={`ds-btn ds-btn-icon bs-round flex-shrink-0 ${voiceOn ? 'ds-btn-soft ds-tone-indigo' : 'ds-btn-ghost'}`}
        >
          <Icon name={voiceOn ? 'SpeakerWaveIcon' : 'SpeakerXMarkIcon'} size={19} />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scroller} className="bs-chat" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className="bs-msg" data-role={t.role === 'learner' ? 'learner' : 'tutor'}>
            {t.role === 'learner' ? (
              <RichText text={t.content} />
            ) : (
              <span className="whitespace-pre-wrap">{t.content}</span>
            )}
          </div>
        ))}
        {busy && (
          <div className="bs-msg bs-typing" data-role="tutor" aria-label={`${name} is typing`}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {error && (
        <div className="ds-banner ds-banner-center ds-tone-rose" role="alert">
          <Icon name="ExclamationTriangleIcon" variant="solid" size={16} />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={retry}
            className="ds-btn ds-btn-secondary ds-btn-sm flex-shrink-0"
          >
            <Icon name="ArrowPathIcon" size={14} />
            Retry
          </button>
        </div>
      )}

      {!ev && (
        <>
          {wantsCode(kind) && showCode && (
            <CodeSpace
              kind={kind}
              value={code}
              onChange={setCode}
              language={language}
              onLanguageChange={setLanguage}
            />
          )}
          {meta?.wrap_up ? (
            <p className="ds-banner ds-banner-center ds-tone-indigo text-[13px]">
              <Icon name="CheckCircleIcon" variant="solid" size={16} />
              <span>Session wrapped up. End it to see your review.</span>
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <div className="relative min-w-0 flex-1">
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
                  className="ds-field bs-composer"
                />
                <span className="bs-mic">
                  <VoiceMicButton state={mic.state} onClick={mic.toggle} size="sm" />
                </span>
              </div>
              <button
                type="button"
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className={`ds-btn bs-send flex-shrink-0 ${busy || !input.trim() ? 'ds-btn-secondary' : 'ds-btn-primary'}`}
              >
                <Icon name="ArrowUpIcon" size={18} />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!meta?.wrap_up && (
              <button
                type="button"
                onClick={() => send("I'm stuck. Could you explain this part to me?")}
                disabled={busy || turns.length === 0}
                className="ds-btn ds-btn-soft ds-btn-sm ds-tone-gold"
              >
                <Icon name="LightBulbIcon" size={15} />
                Explain it to me
              </button>
            )}
            {wantsCode(kind) && (
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                aria-pressed={showCode}
                className="ds-btn ds-btn-secondary ds-btn-sm"
              >
                <Icon
                  name={
                    showCode
                      ? 'EyeSlashIcon'
                      : kind === 'dsa'
                        ? 'CodeBracketIcon'
                        : 'CubeTransparentIcon'
                  }
                  size={15}
                />
                {showCode ? 'Hide code space' : kind === 'dsa' ? 'Write code' : 'Sketch design'}
              </button>
            )}
            <button
              type="button"
              onClick={endAndReview}
              disabled={evaluating || busy || candidateCount === 0}
              className="ds-btn ds-btn-soft ds-btn-sm ds-tone-jade ml-auto"
            >
              {evaluating ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <Icon name="CheckCircleIcon" size={15} />
              )}
              {evaluating ? 'Reviewing…' : 'End & review'}
            </button>
          </div>
        </>
      )}

      {ev && (
        <div className="space-y-3">
          <EvaluationView ev={ev} />
          <button type="button" onClick={restart} className="ds-btn ds-btn-secondary ds-btn-sm">
            <Icon name="ArrowPathIcon" size={15} />
            Learn again
          </button>
        </div>
      )}
    </div>
  );
}
