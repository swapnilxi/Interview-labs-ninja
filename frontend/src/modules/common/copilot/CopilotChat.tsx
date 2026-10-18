'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  /** The reply is a failure notice (not an answer). Set by the chat, only used by the `quiet` variant. */
  error?: boolean;
  /** For a failure notice: the question that can be asked again. */
  retry?: string;
}

export interface CopilotPrompt {
  /** Heroicons outline name. */
  icon: string;
  /** What is sent when the suggestion is picked. */
  text: string;
  /** A short label for the compact suggestion rows (`quiet` variant); `text` is still what is sent. */
  label?: string;
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
  /** Accessible name / tooltip of the collapse button (default "Collapse"). */
  collapseLabel?: string;
  /** Rendered under the title (e.g. a model toggle). */
  headerExtra?: ReactNode;
  /** Rendered between the header and the messages (e.g. a pinned panel). */
  topSlot?: ReactNode;
  /** Subscribe to proactive AI messages; return an unsubscribe fn. */
  subscribe?: (push: (content: string) => void) => () => void;
  errorMessage?: string;
  /**
   * `default`: header band with an icon badge, outlined bubbles and suggestion chips (AI LMS).
   * `quiet` (the To-Do panel): a plain one-line header, replies as plain text beside a thin rule, your own messages as
   * a soft tint, a short list of suggestions that folds away once a conversation starts, and a soft composer.
   */
  variant?: 'default' | 'quiet';
  /** `quiet`: how many suggestions show before "More". */
  initialSuggestions?: number;
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

/** The warning sign (U+26A0 + emoji selector) that todoService.askCopilot puts in front of a failed question's message. */
const FAILURE_MARK = '\u26A0\uFE0F';

export default function CopilotChat({
  title,
  subtitle,
  welcome,
  placeholder,
  prompts,
  onAsk,
  onCollapse,
  collapseLabel = 'Collapse',
  headerExtra,
  topSlot,
  subscribe,
  errorMessage = 'Sorry, something went wrong. Please make sure the backend is running and try again.',
  variant = 'default',
  initialSuggestions = 3,
}: CopilotChatProps) {
  const quiet = variant === 'quiet';
  const [messages, setMessages] = useState<CopilotMessage[]>([{ id: 'welcome', role: 'ai', content: welcome }]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  // `null` = follow the default: suggestions are open until a conversation starts, then folded away.
  const [suggestOpen, setSuggestOpen] = useState<boolean | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(false);

  const started = messages.some((m) => m.role === 'user');
  const suggestionsOpen = suggestOpen ?? !started;

  useEffect(() => {
    // Not on the first render (nothing has been said yet), and only the message list scrolls, never the page around it.
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (quiet && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    } else {
      endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [messages, generating, quiet]);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((content) =>
      setMessages((prev) => [...prev, { id: `push-${Date.now()}`, role: 'ai', content }])
    );
  }, [subscribe]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    // The ref (not just `generating`) blocks a second Enter / tap that lands before the re-render.
    if (!question || generating || sendingRef.current) return;
    sendingRef.current = true;
    const history = messages.filter((m) => m.id !== 'welcome' && !m.error);
    setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: 'user', content: question }]);
    setInput('');
    setGenerating(true);
    try {
      const answer = await onAsk(question, history);
      if (!answer.trim()) {
        // The model came back with nothing: say so (and, in the To-Do panel, offer to ask again) rather than draw an empty bubble.
        setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: 'ai', content: "I didn't get an answer back. Try asking again, or word the question differently.", error: quiet, retry: quiet ? question : undefined }]);
      } else if (quiet && answer.startsWith(FAILURE_MARK)) {
        setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: 'ai', content: answer.slice(FAILURE_MARK.length).trim(), error: true, retry: question }]);
      } else {
        setMessages((prev) => [...prev, { id: `a${Date.now()}`, role: 'ai', content: answer }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: `e${Date.now()}`, role: 'ai', content: errorMessage, error: quiet, retry: quiet ? question : undefined }]);
    } finally {
      sendingRef.current = false;
      setGenerating(false);
    }
  };

  const canSend = input.trim().length > 0 && !generating;
  const lastId = messages[messages.length - 1]?.id;

  // ── quiet variant ───────────────────────────────────────────────────────
  if (quiet) {
    const visiblePrompts = showAllSuggestions ? prompts.slice(0, 6) : prompts.slice(0, initialSuggestions);
    const hasMore = prompts.slice(0, 6).length > initialSuggestions;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 pb-2 pt-4">
          <div className="flex items-center gap-2.5">
            <Icon name="SparklesIcon" size={16} variant="solid" className="flex-shrink-0 text-primary" aria-hidden="true" />
            <h2 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-foreground">{title}</h2>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                className="todo-focus -mr-1.5 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:mix-bg-foreground/[0.07] hover:text-foreground"
                title={collapseLabel}
                aria-label={`${collapseLabel} ${title}`}
              >
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            )}
          </div>
          {headerExtra && <div className="mt-3">{headerExtra}</div>}
        </div>

        {topSlot}

        <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 scrollbar-clean" role="log" aria-live="polite" aria-label={`${title} conversation`}>
          {/* Only until the first question: a line of text, not a bubble, and not repeated once a conversation exists. */}
          {!started && <p className="text-xs leading-relaxed text-muted-foreground">{welcome}</p>}

          {messages
            .filter((msg) => msg.id !== 'welcome')
            .map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end animate-fade-in">
                  <div className="copilot-msg-user-quiet max-w-[92%] px-3 py-2 text-xs leading-relaxed">{renderContent(msg.content)}</div>
                </div>
              ) : msg.error ? (
                <div key={msg.id} role="alert" className="flex animate-fade-in items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Icon name="ExclamationTriangleIcon" size={14} className="mt-px flex-shrink-0 text-warning" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-foreground">{renderContent(msg.content)}</div>
                    {msg.retry && msg.id === lastId && !generating && (
                      <button
                        type="button"
                        onClick={() => sendMessage(msg.retry as string)}
                        className="todo-focus mt-1.5 rounded font-medium text-primary hover:underline"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="copilot-msg-ai-quiet animate-fade-in pl-3 text-xs leading-relaxed text-foreground">
                  {renderContent(msg.content)}
                </div>
              )
            )}

          {generating && (
            <div className="copilot-msg-ai-quiet flex items-center gap-1 pl-3" role="status" aria-label="Copilot is thinking">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-4 pb-4 pt-1">
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setSuggestOpen(!suggestionsOpen)}
              aria-expanded={suggestionsOpen}
              aria-controls="copilot-suggestions"
              className="todo-focus -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Suggestions
              <Icon name="ChevronDownIcon" size={12} className={`transition-transform motion-reduce:transition-none ${suggestionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {suggestionsOpen && (
              <div id="copilot-suggestions" className="mt-0.5 flex flex-col gap-0.5">
                {visiblePrompts.map((p) => (
                  <button
                    key={p.text}
                    type="button"
                    onClick={() => sendMessage(p.text)}
                    disabled={generating}
                    title={p.text}
                    className="copilot-chip-quiet todo-focus"
                  >
                    <Icon name={p.icon} size={13} className="mt-px flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span>{p.label ?? p.text}</span>
                  </button>
                ))}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                    className="todo-focus -ml-0 w-fit rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showAllSuggestions ? 'Fewer' : 'More suggestions'}
                  </button>
                )}
              </div>
            )}
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
              // Read-only (not disabled) while an answer is coming: the question can't change under the request and focus stays put.
              readOnly={generating}
              aria-busy={generating}
              placeholder={placeholder}
              aria-label={placeholder}
              autoComplete="off"
              enterKeyHint="send"
              className="copilot-input-quiet"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              className={`todo-focus absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors disabled:cursor-default ${
                canSend ? 'bg-primary text-primary-foreground' : 'text-muted-foreground opacity-60'
              }`}
            >
              <Icon name="PaperAirplaneIcon" size={12} variant="solid" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── default variant (AI LMS): unchanged ─────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="copilot-icon">
            <Icon name="SparklesIcon" size={15} variant="solid" />
          </span>
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
                msg.role === 'user' ? 'copilot-bubble-user' : 'copilot-bubble-ai'
              }`}
            >
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {generating && (
          <div className="flex justify-start" role="status" aria-label="Copilot is thinking">
            <div className="copilot-bubble-ai flex gap-1 px-3.5 py-3">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 border-t border-border bg-card p-4">
        <div className="mb-4 grid grid-cols-2 gap-2">
          {prompts.slice(0, 6).map((p) => (
            <button
              key={p.text}
              type="button"
              onClick={() => sendMessage(p.text)}
              disabled={generating}
              className="copilot-chip"
            >
              <Icon name={p.icon} size={13} className="mt-px flex-shrink-0 text-primary" />
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
