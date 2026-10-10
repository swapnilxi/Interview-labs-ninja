'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

interface AILabChatProps {
  questionId: string;
  questionText: string;
}

export default function AILabChat({ questionId, questionText }: AILabChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      content: `I'm your AI Copilot! We're in Interactive Lab Mode. I can help you dive deeper into this specific question, explain optimal algorithms, or walk through a conceptual solution. What would you like to explore?`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsGenerating(true);

    // Simulate LLM delay and context-aware response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: `Here is a deeper breakdown regarding your question about "${userMsg.content}". In a senior interview setting, you should focus on minimizing latency while ensuring fault tolerance. Let's trace through the logic step-by-step together...`
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-md flex flex-col h-[600px] animate-fade-in">
      <div className="p-18 border-b border-border bg-muted/20 flex items-center gap-12">
        <div className="w-36 h-36 rounded-full bg-secondary/20 flex items-center justify-center">
          <Icon name="SparklesIcon" size={18} className="text-secondary" variant="solid" />
        </div>
        <div>
          <h3 className="font-heading text-md font-semibold text-foreground">Interactive AI Lab</h3>
          <p className="text-xs text-muted-foreground font-caption">Dive deeper into concepts</p>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-y-auto p-18 space-y-18 scrollbar-clean">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-12 rounded-lg text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-primary text-primary-foreground rounded-tr-none' 
                : 'bg-muted border border-border text-foreground rounded-tl-none font-body'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border p-12 rounded-lg rounded-tl-none flex items-center gap-6">
              <span className="w-6 h-6 rounded-full bg-secondary animate-bounce" />
              <span className="w-6 h-6 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-6 h-6 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-12 border-t border-border bg-input/50">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-12 relative"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a follow-up question..."
            className="w-full bg-card border border-border rounded-full py-9 pl-18 pr-48 text-sm focus-ring placeholder:text-muted-foreground"
            disabled={false}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isGenerating}
            className="absolute right-6 p-6 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-smooth disabled:opacity-50 disabled:pointer-events-none"
          >
            <Icon name="PaperAirplaneIcon" size={16} variant="solid" />
          </button>
        </form>
      </div>
    </div>
  );
}
