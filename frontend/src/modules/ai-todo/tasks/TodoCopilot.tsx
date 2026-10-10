'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { todoService } from '@/lib/services/todoService';
import { onTopTaskCompleted } from '@/lib/services/paretoService';
import ParetoSidebar from '../pareto/ParetoSidebar';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

interface TodoCopilotProps {
  model: 'ollama' | 'gemini';
  onModelChange: (model: 'ollama' | 'gemini') => void;
  onCollapse?: () => void;
}

const QUICK_PROMPTS = [
  { emoji: '⭐', text: 'What is my highest leverage task right now?' },
  { emoji: '📉', text: 'What tasks am I doing that have low impact?' },
  { emoji: '🎯', text: 'If I only had 1 hour, what should I do?' },
  { emoji: '🔍', text: 'Which of my projects will give the biggest return?' },
  { emoji: '💬', text: 'I have 30 mins, what can I do?' },
  { emoji: '📅', text: 'What should I focus on this weekend?' },
  { emoji: '✂️', text: 'How can I chunk my biggest task?' },
];

export default function TodoCopilot({ model, onModelChange, onCollapse }: TodoCopilotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      content: "I'm your productivity copilot. I can see all your tasks, priorities, and deadlines. Ask me anything about your workload, or tap a quick prompt below!",
    },
  ]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generating]);

  // Proactive nudge whenever a Top 20% task is completed anywhere in the app.
  useEffect(() => {
    return onTopTaskCompleted((title) => {
      setMessages(prev => [...prev, {
        id: `top20-${Date.now()}`,
        role: 'ai',
        content: `⭐ You just completed a high-leverage task: **${title}**. Great work! Want me to identify your next top 20% task?`,
      }]);
    });
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || generating) return;

    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setGenerating(true);

    try {
      const answer = await todoService.askCopilot(text.trim(), model);
      const aiMsg: Message = { id: `a${Date.now()}`, role: 'ai', content: answer };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = {
        id: `e${Date.now()}`,
        role: 'ai',
        content: 'Sorry, something went wrong. Please make sure the backend is running and try again.',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setGenerating(false);
    }
  };

  // Simple markdown-like rendering (bold, inline code)
  const renderContent = (content: string) => {
    return content.split('\n').map((line, lineIdx) => (
      <p key={lineIdx} className={lineIdx > 0 ? 'mt-1.5' : ''}>
        {line.split(/(\*\*.*?\*\*|`.*?`)/).map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="text-[10px] bg-muted px-1 py-0.5 rounded font-code">{part.slice(1, -1)}</code>;
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    ));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Icon name="SparklesIcon" size={13} className="text-primary" variant="solid" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-heading text-xs font-semibold text-foreground">Task Copilot</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
              AI-powered productivity assistant
            </p>
          </div>
          {onCollapse && (
            <button onClick={onCollapse} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse">
              <Icon name="ChevronRightIcon" size={13} />
            </button>
          )}
        </div>

        {/* Model toggle */}
        <div className="flex items-center gap-1 mt-2 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => onModelChange('ollama')}
            className={`flex-1 text-[10px] py-1 rounded-md transition-smooth font-medium ${
              model === 'ollama' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            🖥️ Local
          </button>
          <button
            onClick={() => onModelChange('gemini')}
            className={`flex-1 text-[10px] py-1 rounded-md transition-smooth font-medium ${
              model === 'gemini' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            ☁️ Online
          </button>
        </div>
      </div>

      {/* 80/20 Sidebar Panel */}
      <ParetoSidebar model={model} />

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-clean">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-tr-none'
                : 'bg-muted border border-border text-foreground rounded-tl-none'
            }`}>
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {generating && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border px-3 py-2 rounded-lg rounded-tl-none flex gap-1">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border bg-card p-3">
        {/* Quick prompts */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {QUICK_PROMPTS.slice(0, 6).map(p => (
            <button
              key={p.text}
              onClick={() => sendMessage(p.text)}
              disabled={generating}
              className="text-[10px] px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-smooth disabled:opacity-50 text-left leading-tight"
            >
              <span className="mr-1">{p.emoji}</span>{p.text}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 relative">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={generating}
            placeholder="Ask about your tasks..."
            className="flex-1 bg-input border border-border rounded-full py-2 pl-3 pr-9 text-xs focus-ring placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!input.trim() || generating}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-smooth disabled:opacity-50"
          >
            <Icon name="PaperAirplaneIcon" size={12} variant="solid" />
          </button>
        </form>
      </div>
    </div>
  );
}
