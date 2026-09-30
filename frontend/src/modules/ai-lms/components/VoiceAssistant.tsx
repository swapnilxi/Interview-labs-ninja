'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { deepgramSTT, deepgramTTS, isDeepgramEnabled } from '../services/voiceService';
import { lmsService } from '../services/lmsService';

interface VoiceAssistantProps {
  lessonTitle: string;
  lessonContentHtml: string;
}

// listening: recording. transcribing: STT in progress after recording stops.
// reviewing: transcript ready, shown to the user for edit/discard/send -- nothing
// is sent to the AI until the user explicitly clicks Send. thinking: AI is
// generating a reply. speaking: reply is being read aloud.
type AssistantState = 'idle' | 'listening' | 'transcribing' | 'reviewing' | 'thinking' | 'speaking';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

// Single source of truth per state, so adding/adjusting a state doesn't require
// touching half a dozen separate ternary chains scattered through the render.
const STATE_ACCENT: Record<AssistantState, string> = {
  idle: '99,102,241',
  listening: '239,68,68',
  transcribing: '96,165,250',
  reviewing: '167,139,250',
  thinking: '251,191,36',
  speaking: '52,211,153',
};

const STATE_HEX: Record<AssistantState, string> = {
  idle: '#818cf8',
  listening: '#f87171',
  transcribing: '#60a5fa',
  reviewing: '#a78bfa',
  thinking: '#fbbf24',
  speaking: '#34d399',
};

const STATE_ORB_BG: Record<AssistantState, string> = {
  idle: 'radial-gradient(circle at 35% 35%, #818cf8, #6366f1 60%, #4338ca)',
  listening: 'radial-gradient(circle at 35% 35%, #f87171, #ef4444 60%, #b91c1c)',
  transcribing: 'radial-gradient(circle at 35% 35%, #60a5fa, #3b82f6 60%, #1d4ed8)',
  reviewing: 'radial-gradient(circle at 35% 35%, #a78bfa, #8b5cf6 60%, #5b21b6)',
  thinking: 'radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b 60%, #b45309)',
  speaking: 'radial-gradient(circle at 35% 35%, #34d399, #10b981 60%, #065f46)',
};

const STATE_ORB_ICON: Record<AssistantState, string> = {
  idle: 'SparklesIcon',
  listening: 'StopIcon',
  transcribing: 'ArrowPathIcon',
  reviewing: 'PencilSquareIcon',
  thinking: 'SparklesIcon',
  speaking: 'SpeakerWaveIcon',
};

const STATE_ORB_TITLE: Record<AssistantState, string> = {
  idle: 'Ask a question',
  listening: 'Listening... tap to stop',
  transcribing: 'Transcribing...',
  reviewing: 'Review your question below',
  thinking: 'Thinking...',
  speaking: 'Speaking... tap to stop',
};

const STATE_BADGE_TEXT: Record<AssistantState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  transcribing: 'Transcribing',
  reviewing: 'Ready to send',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const STATE_BUTTON_TEXT: Record<AssistantState, string> = {
  idle: '🎙 Speak a Question',
  listening: 'Stop Recording',
  transcribing: 'Transcribing...',
  reviewing: '',
  thinking: 'Thinking...',
  speaking: 'Stop Speaking',
};

// The Web Speech API (SpeechRecognition) is a non-standardized browser API with no
// types in TypeScript's DOM lib, so we declare just the surface this component uses.
interface SpeechRecognitionResultLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export default function VoiceAssistant({ lessonTitle, lessonContentHtml }: VoiceAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [orbScale, setOrbScale] = useState(1);
  // Transcript that's been recorded/transcribed but not yet sent -- the user
  // reviews (and can edit) this, then explicitly sends it or discards it.
  const [pendingTranscript, setPendingTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Mirrors assistantState for the mount-only effect below, whose handlers would
  // otherwise always see the 'idle' value from the render they were created in.
  const assistantStateRef = useRef<AssistantState>('idle');
  const isMountedRef = useRef(true);

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  // Animate orb while speaking/listening
  useEffect(() => {
    if (assistantState === 'speaking') {
      let t = 0;
      const animate = () => {
        t += 0.08;
        setOrbScale(1 + 0.18 * Math.sin(t) + 0.06 * Math.sin(t * 2.3));
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);
    } else if (assistantState === 'listening') {
      let t = 0;
      const animate = () => {
        t += 0.12;
        setOrbScale(1 + 0.1 * Math.abs(Math.sin(t)));
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setOrbScale(1);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [assistantState]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Safety net: 'transcribing' and 'thinking' are the two states nothing in the UI
  // can cancel out of (no button is shown/enabled) -- if whatever async work is
  // supposed to end them hangs for any reason (a stuck STT call, a network request
  // that never resolves or rejects), force a recovery instead of leaving the orb
  // stuck forever with no explanation. Cleared by the effect re-running (or
  // unmounting) the moment the state actually moves on, so this never fires for a
  // normal-speed request.
  useEffect(() => {
    if (assistantState !== 'transcribing' && assistantState !== 'thinking') return;
    const timeoutMs = assistantState === 'transcribing' ? 15000 : 30000;
    const message =
      assistantState === 'transcribing'
        ? 'Transcription is taking too long -- please try again.'
        : 'The assistant is taking too long to respond -- please try again.';
    const timer = setTimeout(() => {
      setError(message);
      setAssistantState('idle');
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [assistantState]);

  // Setup Web Speech API. Deps intentionally empty -- this performs one-time setup of
  // the recognition object, paired with the isMountedRef/teardown logic in the cleanup
  // below, which must only run on actual unmount.
  useEffect(() => {
    // React 18 StrictMode (on by default in `next dev`) deliberately mounts every
    // component, runs this effect, tears it down, then mounts it again -- so the
    // cleanup below always fires once before the "real" mount settles. Without this
    // line, isMountedRef.current would be left `false` forever after that first
    // simulated unmount (it's only ever set back to true here, never in the cleanup),
    // so every async flow that checks it post-await -- e.g. startListening() after
    // `await getUserMedia(...)` -- would always take its "unmounted" branch and never
    // start recording. This is why voice input worked in production but appeared
    // completely dead in local dev.
    isMountedRef.current = true;
    if (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    ) {
      const w = window as WindowWithSpeechRecognition;
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (SR) {
        recognitionRef.current = new SR();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event) => {
          // The browser does STT internally, so there's no separate 'transcribing'
          // phase here -- the final transcript arrives directly, ready to review.
          const transcript = Array.from(event.results)
            .map((r) => r[0].transcript)
            .join('');
          if (transcript.trim()) {
            setPendingTranscript(transcript.trim());
            setAssistantState('reviewing');
          } else {
            setAssistantState('idle');
          }
        };

        recognitionRef.current.onerror = (event) => {
          if (event.error !== 'aborted') {
            setError(`Mic error: ${event.error}`);
            setAssistantState('idle');
          }
        };

        recognitionRef.current.onend = () => {
          // Read from the ref, not assistantState: this handler is set up once on mount
          // and would otherwise always see the initial 'idle' value, so recognition
          // ending in silence (no onresult, no onerror) would leave the UI stuck showing
          // "Listening...".
          if (assistantStateRef.current === 'listening') {
            setAssistantState('idle');
          }
        };
      }
    }

    return () => {
      isMountedRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore -- recognition may not have been started
      }
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fallbackTTS -> playResponse -> handleAskQuestion -> startListening is declared
  // in dependency order -- each is a useCallback listing the previous one as a
  // dependency, so each must already be initialized by the time the next one's
  // dependency array is evaluated. Reordering would produce a "used before
  // initialization" error.
  const fallbackTTS = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.onend = () => setAssistantState('idle');
    window.speechSynthesis.speak(utterance);
  }, []);

  const playResponse = useCallback(
    async (text: string) => {
      setAssistantState('speaking');

      if (isDeepgramEnabled()) {
        try {
          const blob = await deepgramTTS(text);
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            setAssistantState('idle');
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            fallbackTTS(text);
          };
          await audio.play();
          return;
        } catch {
          // ignore -- fall through to the SpeechSynthesis fallback below
        }
      }
      fallbackTTS(text);
    },
    [fallbackTTS]
  );

  // Sends a question to the AI -- only ever called from the explicit Send button
  // (see handleSendTranscript), never automatically after transcription.
  const handleAskQuestion = useCallback(
    async (query: string) => {
      setAssistantState('thinking');
      setMessages((prev) => [...prev, { role: 'user', text: query }]);

      try {
        // Generated lessons are standalone HTML documents with a large embedded
        // <style> block (often 5-8k+ chars) ahead of the actual content -- stripping
        // only tags (not style/script bodies) left the truncated context window
        // entirely full of raw CSS, with zero real lesson prose ever reaching the AI.
        const strippedHtml = lessonContentHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]*>?/gm, '')
          .replace(/\s+/g, ' ')
          .trim();
        const responseText = await lmsService.askVoiceAssistant({
          message: query,
          contextTitle: lessonTitle,
          contextText: strippedHtml.slice(0, 2000),
        });

        setMessages((prev) => [...prev, { role: 'assistant', text: responseText }]);
        await playResponse(responseText);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setAssistantState('idle');
      }
    },
    [lessonTitle, lessonContentHtml, playResponse]
  );

  const startListening = useCallback(async () => {
    setError(null);
    // Stop any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setPendingTranscript('');
    setAssistantState('listening');

    if (isDeepgramEnabled()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMountedRef.current || assistantStateRef.current !== 'listening') {
          // Either unmounted, or the user already clicked stop (or the recovery
          // path in stopListening already gave up and went to 'idle') while this
          // permission prompt was still pending -- don't wire up a recorder for a
          // session that's no longer wanted.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        audioChunksRef.current = [];

        mr.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setAssistantState('transcribing');
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const text = await deepgramSTT(blob);
            if (text.trim()) {
              setPendingTranscript(text.trim());
              setAssistantState('reviewing');
            } else {
              setError('No speech detected -- try again.');
              setAssistantState('idle');
            }
          } catch (e: unknown) {
            setError(`Transcription failed: ${e instanceof Error ? e.message : String(e)}`);
            setAssistantState('idle');
          }
        };
        mr.start();
      } catch (err: unknown) {
        setError(`Microphone access denied: ${err instanceof Error ? err.message : String(err)}`);
        setAssistantState('idle');
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        setAssistantState('idle');
      }
    } else {
      setError('Speech recognition not supported in this browser.');
      setAssistantState('idle');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (isDeepgramEnabled()) {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        setAssistantState('transcribing');
      } else {
        // Nothing was actually recording -- most likely the mic permission
        // prompt was still pending (or was denied without a clean rejection) --
        // so there's no onstop coming. Recover instead of leaving the UI stuck
        // showing "Transcribing" forever with nothing backing it.
        setError('Recording never started -- please try again.');
        setAssistantState('idle');
      }
    } else {
      recognitionRef.current?.stop();
      setAssistantState('transcribing');
    }
  }, []);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setAssistantState('idle');
  };

  const handleSendTranscript = useCallback(() => {
    const text = pendingTranscript.trim();
    if (!text) return;
    setPendingTranscript('');
    handleAskQuestion(text);
  }, [pendingTranscript, handleAskQuestion]);

  const handleDiscardTranscript = useCallback(() => {
    setPendingTranscript('');
    setError(null);
    setAssistantState('idle');
  }, []);

  const handleOrbClick = () => {
    if (assistantState === 'speaking') {
      stopSpeaking();
      return;
    }
    if (assistantState === 'listening') {
      stopListening();
      return;
    }
    // transcribing/thinking: a request is already in flight, nothing to do yet.
    // reviewing: use the Send/Discard buttons below, not the orb, so a stray tap
    // can't send (or lose) a transcript the user hasn't confirmed.
    if (
      assistantState === 'transcribing' ||
      assistantState === 'thinking' ||
      assistantState === 'reviewing'
    )
      return;

    if (!isOpen) setIsOpen(true);
    startListening();
  };

  const accent = STATE_ACCENT[assistantState];
  const isBusy = assistantState === 'transcribing' || assistantState === 'thinking';

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3">
      {/* Chat Panel */}
      {isOpen && (
        <div
          className="w-[340px] max-h-[480px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'rgba(15,23,42,0.97)',
            border: '1px solid rgba(99,102,241,0.3)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Panel Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(51,65,85,0.8)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #818cf8, #6366f1)' }}
              >
                <Icon name="MicrophoneIcon" size={14} className="text-white" />
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-none">Voice Assistant</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-none truncate max-w-[180px]">
                  {lessonTitle}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* State indicator */}
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: `rgba(${accent},0.15)`, color: STATE_HEX[assistantState] }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'currentColor',
                    animation: assistantState !== 'idle' ? 'pulse 1s infinite' : 'none',
                  }}
                />
                {STATE_BADGE_TEXT[assistantState]}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
          </div>

          {/* Waveform (listening/speaking) or processing dots (transcribing) */}
          {(assistantState === 'speaking' || assistantState === 'listening') && (
            <div
              className="flex items-center justify-center gap-[3px] px-4 py-2 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(51,65,85,0.5)' }}
            >
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: '3px',
                    background: assistantState === 'speaking' ? '#34d399' : '#ef4444',
                    height: `${8 + Math.random() * 20}px`,
                    animation: `waveBar ${0.4 + Math.random() * 0.6}s ease-in-out ${i * 0.05}s infinite alternate`,
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
          )}
          {assistantState === 'transcribing' && (
            <div
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(51,65,85,0.5)' }}
            >
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: STATE_HEX.transcribing,
                    animation: `bounce 1s ${delay}ms infinite`,
                  }}
                />
              ))}
              <span className="text-[11px] text-slate-400 ml-1">Transcribing your question...</span>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[120px] max-h-[280px]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-4 gap-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.2)',
                  }}
                >
                  <Icon name="MicrophoneIcon" size={18} className="text-indigo-400" />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
                  Tap the orb below to ask a voice question about{' '}
                  <strong className="text-slate-300">{lessonTitle}</strong>
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] text-xs leading-relaxed px-3 py-2 rounded-xl ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm text-white'
                        : 'rounded-tl-sm text-slate-200'
                    }`}
                    style={{
                      background:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #6366f1, #818cf8)'
                          : 'rgba(30,41,59,0.9)',
                      border: msg.role === 'assistant' ? '1px solid rgba(51,65,85,0.6)' : 'none',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}

            {assistantState === 'thinking' && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl rounded-tl-sm"
                  style={{
                    background: 'rgba(30,41,59,0.9)',
                    border: '1px solid rgba(51,65,85,0.6)',
                  }}
                >
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                      style={{ animation: `bounce 1s ${delay}ms infinite` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div
                className="text-[11px] text-red-400 px-3 py-2 rounded-lg flex items-start gap-2"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <Icon name="ExclamationTriangleIcon" size={12} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Review & Send (replaces the normal action bar while a transcript awaits confirmation) */}
          {assistantState === 'reviewing' ? (
            <div
              className="px-3 py-2.5 flex-shrink-0 space-y-2"
              style={{
                borderTop: '1px solid rgba(51,65,85,0.6)',
                background: 'rgba(139,92,246,0.06)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  name="InformationCircleIcon"
                  size={13}
                  style={{ color: STATE_HEX.reviewing }}
                />
                <div className="text-[11px] font-semibold" style={{ color: STATE_HEX.reviewing }}>
                  Nothing sent yet -- tap <span className="underline">Send to Assistant</span> below
                  when ready
                </div>
              </div>
              <textarea
                value={pendingTranscript}
                onChange={(e) => setPendingTranscript(e.target.value)}
                rows={2}
                autoFocus
                className="w-full rounded-lg px-3 py-2 text-xs text-white resize-none focus:outline-none focus:ring-2"
                style={{
                  background: 'rgba(15,23,42,0.8)',
                  border: `1px solid rgba(${STATE_ACCENT.reviewing},0.35)`,
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscardTranscript}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors"
                  style={{ border: '1px solid rgba(51,65,85,0.8)' }}
                >
                  Discard
                </button>
                <button
                  onClick={handleSendTranscript}
                  disabled={!pendingTranscript.trim()}
                  className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold text-white transition-opacity disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                    boxShadow: pendingTranscript.trim()
                      ? '0 0 0 3px rgba(167,139,250,0.25), 0 2px 12px rgba(124,58,237,0.5)'
                      : 'none',
                    animation: pendingTranscript.trim()
                      ? 'sendPulse 1.6s ease-in-out infinite'
                      : 'none',
                  }}
                >
                  <Icon name="PaperAirplaneIcon" size={13} />
                  Send to Assistant
                </button>
              </div>
            </div>
          ) : (
            /* Bottom Action Bar */
            <div
              className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(51,65,85,0.6)' }}
            >
              <button
                onClick={() => {
                  if (assistantState === 'listening') {
                    stopListening();
                    return;
                  }
                  if (assistantState === 'speaking') {
                    stopSpeaking();
                    return;
                  }
                  if (isBusy) return;
                  startListening();
                }}
                disabled={isBusy}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: `rgba(${accent},0.15)`,
                  color: STATE_HEX[assistantState],
                  border: `1px solid rgba(${accent},0.3)`,
                }}
              >
                <Icon name={STATE_ORB_ICON[assistantState]} size={14} />
                <span>{STATE_BUTTON_TEXT[assistantState]}</span>
              </button>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                  title="Clear conversation"
                >
                  <Icon name="TrashIcon" size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Orb Button */}
      <div className="flex flex-col items-center gap-1.5">
        {/* Tooltip label */}
        {!isOpen && (
          <div
            className="text-[11px] font-semibold text-center leading-none px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(51,65,85,0.8)',
              color: '#94a3b8',
            }}
          >
            Voice AI
          </div>
        )}

        {/* Pulsing ring */}
        <div className="relative flex items-center justify-center">
          {assistantState !== 'idle' && (
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '72px',
                height: '72px',
                background: `rgba(${accent},0.25)`,
                animation: 'orbRing 1.5s ease-out infinite',
              }}
            />
          )}
          <button
            onClick={handleOrbClick}
            title={STATE_ORB_TITLE[assistantState]}
            className="relative flex items-center justify-center rounded-full transition-all select-none"
            style={{
              width: '56px',
              height: '56px',
              background: STATE_ORB_BG[assistantState],
              boxShadow: `0 0 ${assistantState === 'idle' ? 20 : 26}px rgba(${accent},0.5), 0 4px 16px rgba(0,0,0,0.4)`,
              transform: `scale(${orbScale})`,
              transition: 'box-shadow 0.3s ease, background 0.4s ease',
              cursor: isBusy ? 'wait' : 'pointer',
            }}
          >
            <Icon
              name={STATE_ORB_ICON[assistantState]}
              size={22}
              className={`text-white ${assistantState === 'transcribing' ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Open/close panel toggle (when orb is idle) */}
        {assistantState === 'idle' && (
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
          >
            {isOpen ? 'hide panel' : 'show panel'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes orbRing {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes waveBar {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes sendPulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(167,139,250,0.25), 0 2px 12px rgba(124,58,237,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(167,139,250,0.12), 0 2px 16px rgba(124,58,237,0.7); }
        }
      `}</style>
    </div>
  );
}
