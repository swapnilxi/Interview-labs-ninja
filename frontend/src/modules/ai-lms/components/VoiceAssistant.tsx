'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { deepgramSTT, deepgramTTS, getDeepgramKey } from '../services/voiceService';

interface VoiceAssistantProps {
  lessonTitle: string;
  lessonContentHtml: string;
}

type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export default function VoiceAssistant({ lessonTitle, lessonContentHtml }: VoiceAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [orbScale, setOrbScale] = useState(1);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Animate orb while speaking
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

  // Setup Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SR();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        if (transcript.trim()) {
          handleAskQuestion(transcript.trim());
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted') {
          setError(`Mic error: ${event.error}`);
          setAssistantState('idle');
        }
      };

      recognitionRef.current.onend = () => {
        if (assistantState === 'listening') {
          setAssistantState('thinking');
        }
      };
    }

    return () => {
      try { recognitionRef.current?.abort(); } catch {}
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    // Stop any ongoing speech
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    window.speechSynthesis?.cancel();

    setAssistantState('listening');

    if (getDeepgramKey()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        audioChunksRef.current = [];

        mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          setAssistantState('thinking');
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const text = await deepgramSTT(blob);
            if (text.trim()) {
              await handleAskQuestion(text.trim());
            } else {
              setAssistantState('idle');
            }
          } catch (e: any) {
            setError(`STT failed: ${e.message}`);
            setAssistantState('idle');
          }
        };
        mr.start();
      } catch (err: any) {
        setError(`Microphone access denied: ${err.message}`);
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
    if (getDeepgramKey()) {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } else {
      recognitionRef.current?.stop();
    }
    setAssistantState('thinking');
  }, []);

  const handleAskQuestion = async (query: string) => {
    setAssistantState('thinking');
    setMessages(prev => [...prev, { role: 'user', text: query }]);

    try {
      const strippedHtml = lessonContentHtml.replace(/<[^>]*>?/gm, '');
      const res = await fetch('/api/lms/voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          contextTitle: lessonTitle,
          contextText: strippedHtml.slice(0, 2000),
        }),
      });
      if (!res.ok) throw new Error('Failed to get AI response');
      const data = await res.json();
      const responseText = data.text || '';

      setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
      await playResponse(responseText);
    } catch (err: any) {
      setError(err.message);
      setAssistantState('idle');
    }
  };

  const playResponse = async (text: string) => {
    setAssistantState('speaking');

    if (getDeepgramKey()) {
      try {
        const blob = await deepgramTTS(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { setAssistantState('idle'); URL.revokeObjectURL(url); };
        audio.onerror = () => { fallbackTTS(text); };
        await audio.play();
        return;
      } catch {}
    }
    fallbackTTS(text);
  };

  const fallbackTTS = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.onend = () => setAssistantState('idle');
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    window.speechSynthesis?.cancel();
    setAssistantState('idle');
  };

  const handleOrbClick = () => {
    if (assistantState === 'speaking') {
      stopSpeaking();
      return;
    }
    if (assistantState === 'listening') {
      stopListening();
      return;
    }
    if (assistantState === 'thinking') return;

    if (!isOpen) setIsOpen(true);
    startListening();
  };

  // Orb colors/states
  const orbConfig = {
    idle: {
      bg: 'radial-gradient(circle at 35% 35%, #818cf8, #6366f1 60%, #4338ca)',
      shadow: '0 0 20px rgba(99,102,241,0.4), 0 4px 16px rgba(0,0,0,0.4)',
      ring: 'rgba(99,102,241,0.25)',
      icon: 'MicrophoneIcon',
      label: 'Ask a question',
    },
    listening: {
      bg: 'radial-gradient(circle at 35% 35%, #f87171, #ef4444 60%, #b91c1c)',
      shadow: '0 0 28px rgba(239,68,68,0.6), 0 4px 16px rgba(0,0,0,0.4)',
      ring: 'rgba(239,68,68,0.3)',
      icon: 'StopIcon',
      label: 'Listening... tap to stop',
    },
    thinking: {
      bg: 'radial-gradient(circle at 35% 35%, #fbbf24, #f59e0b 60%, #b45309)',
      shadow: '0 0 24px rgba(251,191,36,0.5), 0 4px 16px rgba(0,0,0,0.4)',
      ring: 'rgba(251,191,36,0.25)',
      icon: 'SparklesIcon',
      label: 'Thinking...',
    },
    speaking: {
      bg: 'radial-gradient(circle at 35% 35%, #34d399, #10b981 60%, #065f46)',
      shadow: '0 0 28px rgba(52,211,153,0.6), 0 4px 16px rgba(0,0,0,0.4)',
      ring: 'rgba(52,211,153,0.3)',
      icon: 'SpeakerWaveIcon',
      label: 'Speaking... tap to stop',
    },
  };

  const cfg = orbConfig[assistantState];

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
                style={{
                  background: assistantState === 'idle' ? 'rgba(99,102,241,0.1)' :
                    assistantState === 'listening' ? 'rgba(239,68,68,0.15)' :
                    assistantState === 'thinking' ? 'rgba(251,191,36,0.15)' :
                    'rgba(52,211,153,0.15)',
                  color: assistantState === 'idle' ? '#818cf8' :
                    assistantState === 'listening' ? '#f87171' :
                    assistantState === 'thinking' ? '#fbbf24' : '#34d399',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'currentColor',
                    animation: assistantState !== 'idle' ? 'pulse 1s infinite' : 'none',
                  }}
                />
                {assistantState === 'idle' ? 'Ready' :
                 assistantState === 'listening' ? 'Listening' :
                 assistantState === 'thinking' ? 'Thinking' : 'Speaking'}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
          </div>

          {/* Waveform Visualization (only when speaking/listening) */}
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

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[120px] max-h-[280px]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-4 gap-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  <Icon name="MicrophoneIcon" size={18} className="text-indigo-400" />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
                  Tap the orb below to ask a voice question about <strong className="text-slate-300">{lessonTitle}</strong>
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
                      background: msg.role === 'user'
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
                  style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(51,65,85,0.6)' }}
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
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <Icon name="ExclamationTriangleIcon" size={12} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Action Bar */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(51,65,85,0.6)' }}
          >
            <button
              onClick={() => {
                if (assistantState === 'listening') { stopListening(); return; }
                if (assistantState === 'speaking') { stopSpeaking(); return; }
                if (assistantState === 'thinking') return;
                startListening();
              }}
              disabled={assistantState === 'thinking'}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: assistantState === 'listening' ? 'rgba(239,68,68,0.15)' :
                  assistantState === 'speaking' ? 'rgba(52,211,153,0.15)' :
                  assistantState === 'thinking' ? 'rgba(251,191,36,0.1)' :
                  'rgba(99,102,241,0.15)',
                color: assistantState === 'listening' ? '#f87171' :
                  assistantState === 'speaking' ? '#34d399' :
                  assistantState === 'thinking' ? '#fbbf24' : '#818cf8',
                border: `1px solid ${
                  assistantState === 'listening' ? 'rgba(239,68,68,0.3)' :
                  assistantState === 'speaking' ? 'rgba(52,211,153,0.3)' :
                  assistantState === 'thinking' ? 'rgba(251,191,36,0.2)' :
                  'rgba(99,102,241,0.25)'
                }`,
              }}
            >
              <Icon
                name={
                  assistantState === 'listening' ? 'StopIcon' :
                  assistantState === 'speaking' ? 'SpeakerWaveIcon' :
                  assistantState === 'thinking' ? 'SparklesIcon' : 'MicrophoneIcon'
                }
                size={14}
              />
              <span>
                {assistantState === 'listening' ? 'Stop Recording' :
                 assistantState === 'speaking' ? 'Stop Speaking' :
                 assistantState === 'thinking' ? 'Thinking...' : '🎙 Speak a Question'}
              </span>
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError(null); }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
                title="Clear conversation"
              >
                <Icon name="TrashIcon" size={14} />
              </button>
            )}
          </div>
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
                background: cfg.ring,
                animation: 'orbRing 1.5s ease-out infinite',
              }}
            />
          )}
          <button
            onClick={handleOrbClick}
            title={cfg.label}
            className="relative flex items-center justify-center rounded-full transition-all select-none"
            style={{
              width: '56px',
              height: '56px',
              background: cfg.bg,
              boxShadow: cfg.shadow,
              transform: `scale(${orbScale})`,
              transition: 'box-shadow 0.3s ease, background 0.4s ease',
              cursor: assistantState === 'thinking' ? 'wait' : 'pointer',
            }}
          >
            <Icon name={cfg.icon as any} size={22} className="text-white" />
          </button>
        </div>

        {/* Open/close panel toggle (when orb is idle) */}
        {assistantState === 'idle' && (
          <button
            onClick={() => setIsOpen(prev => !prev)}
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
      `}</style>
    </div>
  );
}
