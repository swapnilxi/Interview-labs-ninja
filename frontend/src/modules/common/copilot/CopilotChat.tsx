'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export interface CopilotPrompt {
  /** Heroicons outline name. */
  icon: string;
  text: string;
}

export interface CopilotChatProps {
  title: string;
  subtitle: string;
  welcome: string;
  placeholder: string;
  prompts: CopilotPrompt[];
  /** Resolve an answer; `history` is the conversation so far (excluding the new question). */
  onAsk: (question: string, history: CopilotMessage[]) => Promise<string>;
  onCollapse?: () => void;
  /** Rendered under the title (e.g. a model toggle). */
  headerExtra?: ReactNode;
  /** Rendered between the header and the messages (e.g. a pinned panel). */
  topSlot?: ReactNode;
  /** Subscribe to proactive AI messages; return an unsubscribe fn. */
  subscribe?: (push: (content: string) => void) => () => void;
  errorMessage?: string;
  /**
   * `default`: header band with an icon badge, outlined bubbles and suggestion chips (AI LMS).
   * `quiet` (the To-Do panel): a plain header, bubbles without an outline, suggestions as plain rows.
   */
  variant?: 'default' | 'quiet';
}

/** Bold / inline code / "- " bullets — enough for assistant replies without a markdown dependency. */
function renderContent(content: string) {
  return content.split('\n').map((line, lineIdx) => {
    const bullet = /^\s*[-*]\s+/.test(line);
    const text = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
    return (
      <p key={lineIdx} className={`${lineIdx > 0 ? 'mt-2' : ''} ${bullet ? 'flex gap-2' : ''}`}>
        {bullet && <span aria-hidden="true" className="mt-[0.45em] h-1 w-1 flex-shrink-0 rounded-full bg-primary" />}
        <span>
          {text.split(/(\*\*.*?\*\*|`.*?`)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
              return <code key={i} className="rounded bg-muted px-1 py-0.5 font-code text-xs">{part.slice(1, -1)}</code>;
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      </p>
    );
  });
}

export default function CopilotChat({
  title,
  subtitle,
  welcome,
  placeholder,
  prompts,
  onAsk,
  onCollapse,
  headerExtra,
  topSlot,
  subscribe,
  errorMessage = 'Sorry, something went wrong. Please make sure the backend is running and try again.',
  variant = 'default',
}: CopilotChatProps) {
  const quiet = variant === 'quiet';
  const [messages, setMessages] = useState<CopilotMessage[]>([{ id: 'welcome', role: 'ai', content: welcome }]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generating]);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((content) =>
      setMessages((prev) => [...prev, { id: `push-${Date.now()}`, role: 'ai', content }])
    );
  }, [subscribe]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || generating) return;
    const history = messages.filter((m) => m.id !== 'welcome');
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: 'user', content: question }]);
    setInput('');
    setGenerating(true);
    try {
      const answer = await onAsk(question, history);
      setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: 'ai', content: answer }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: 'ai', content: errorMessage }]);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className={quiet ? 'flex-shrink-0 px-4 pb-3 pt-4' : 'flex-shrink-0 border-b border-border bg-surface px-4 py-4'}>
        <div className="flex items-center gap-3">
          {quiet ? (
            <Icon name="SparklesIcon" size={16} variant="solid" className="flex-shrink-0 text-primary" />
          ) : (
            <span className="copilot-icon">
              <Icon name="SparklesIcon" size={15} variant="solid" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <span className="font-heading text-sm font-semibold text-foreground">{title}</span>
            <p className="mt-0.5 text-xs leading-none text-muted-foreground">{subtitle}</p>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="todo-focus flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Collapse"
              aria-label={`Collapse ${title}`}
            >
              <Icon name="ChevronRightIcon" size={14} />
            </button>
          )}
        </div>
        {headerExtra && <div className="mt-3">{headerExtra}</div>}
      </div>

      {topSlot}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-clean" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex animate-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user' ? 'copilot-bubble-user' : quiet ? 'copilot-bubble-ai-quiet' : 'copilot-bubble-ai'
              }`}
            >
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {generating && (
          <div className="flex justify-start" role="status" aria-label="Copilot is thinking">
            <div className={`${quiet ? 'copilot-bubble-ai-quiet' : 'copilot-bubble-ai'} flex gap-1 px-3.5 py-3`}>
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={quiet ? 'flex-shrink-0 px-4 pb-4 pt-2' : 'flex-shrink-0 border-t border-border bg-card p-4'}>
        <div className={quiet ? 'mb-3 flex flex-col gap-0.5' : 'mb-4 grid grid-cols-2 gap-2'}>
          {prompts.slice(0, 6).map((p) => (
            <button
              key={p.text}
              type="button"
              onClick={() => sendMessage(p.text)}
              disabled={generating}
              className={quiet ? 'copilot-chip-quiet' : 'copilot-chip'}
            >
              <Icon name={p.icon} size={13} className={`mt-px flex-shrink-0 ${quiet ? 'text-muted-foreground' : 'text-primary'}`} />
              <span>{p.text}</span>
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="relative"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={generating}
            placeholder={placeholder}
            aria-label={placeholder}
            className="copilot-input"
          />
          <button
            type="submit"
            disabled={!input.trim() || generating}
            aria-label="Send"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-primary p-2 text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Icon name="PaperAirplaneIcon" size={12} variant="solid" />
          </button>
        </form>
      </div>
    </div>
  );
}
