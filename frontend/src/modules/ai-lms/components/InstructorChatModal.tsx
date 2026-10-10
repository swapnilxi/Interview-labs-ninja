'use client';

import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsInstructor } from '../types';

interface InstructorChatModalProps {
  isOpen: boolean;
  instructor: LmsInstructor | null;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'instructor';
  text: string;
  timestamp: string;
}

export default function InstructorChatModal({
  isOpen,
  instructor,
  onClose,
}: InstructorChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (instructor) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'instructor',
          text: `Hello! I am ${instructor.name}'s ${
            instructor.type === 'real' ? 'AI Digital Persona & Teaching Assistant' : 'Interactive AI Instructor'
          }. How can I assist you with ${
            instructor.assigned_classes && instructor.assigned_classes.length > 0
              ? instructor.assigned_classes.map((c) => c.name).join(', ')
              : 'your curriculum studies'
          }?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [instructor]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen || !instructor) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMsgText = inputMessage.trim();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const personaContext = instructor.ai_persona || instructor.learning_style_prompt || `Instructor ${instructor.name} (${instructor.title})`;
      const replyText = await lmsService.askVoiceAssistant({
        message: userMsgText,
        contextTitle: `${instructor.name} [Teaching Style: ${instructor.learning_style || 'Direct'}]`,
        contextText: `System persona directives: ${personaContext}. Bio: ${instructor.bio}. Expertise: ${Array.isArray(instructor.expertise) ? instructor.expertise.join(', ') : instructor.expertise}`,
      });

      const replyMsg: ChatMessage = {
        id: `inst-${Date.now()}`,
        sender: 'instructor',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      console.error('Failed to query instructor chatbot', err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'instructor',
        text: "I'm having trouble connecting to my knowledge base right now. Please try again in a moment.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl h-[600px] max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            {instructor.avatar ? (
              <img
                src={instructor.avatar}
                alt={instructor.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-primary/30"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                {instructor.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-sm font-bold text-foreground">{instructor.name}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    instructor.type === 'real'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                  }`}
                >
                  {instructor.type === 'real' ? '👤 Real Teacher AI Persona' : '🤖 AI Instructor'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{instructor.title || 'Faculty'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-clean bg-card">
          {messages.map((msg) => {
            const isInst = msg.sender === 'instructor';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isInst ? 'items-start' : 'items-end'} animate-fadeIn`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                    isInst
                      ? 'bg-muted/60 text-foreground border border-border/60 rounded-tl-xs'
                      : 'bg-primary text-white rounded-tr-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/60 px-1 mt-1">{msg.timestamp}</span>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Icon name="SparklesIcon" size={14} className="animate-spin text-primary" />
              <span>{instructor.name} AI Persona is formulating a response...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-border bg-muted/20 flex items-center gap-2">
          <input
            type="text"
            placeholder={`Ask ${instructor.name} a question about lessons or concepts...`}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !inputMessage.trim()}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Icon name="PaperAirplaneIcon" size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
