'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { PlanChatTurn } from '@/lib/services/projectPlannerService';

const STARTERS = [
  'What are the biggest risks in this plan?',
  'Make the whole plan about 25% shorter',
  'Add a testing and review phase',
  'We only have two people. Adjust the plan',
  'Split the first phase into smaller steps',
];

interface PlanChatProps {
  chat: PlanChatTurn[];
  busy: boolean;
  /** Resolves true when the AI answered (the box is then cleared); false puts the message back so nothing is lost. */
  onSend: (message: string) => Promise<boolean>;
}

/** The "plan it together" panel: ask about the plan, or ask for changes, and the AI replies and edits it. */
const PlanChat = forwardRef<HTMLElement, PlanChatProps>(function PlanChat({ chat, busy, onSend }, ref) {
  const [draft, setDraft] = useState('');
  // The message being answered: shown right away, before it becomes part of the saved conversation.
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // New message or "thinking": keep the newest one in view (inside the list only; never scroll the page).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.length, busy, pending]);

  const send = async (message: string) => {
    const text = message.trim();
    if (!text || busy) return;
    setDraft('');
    setPending(text);
    const ok = await onSend(text);
    setPending(null);
    if (!ok) setDraft((current) => current || text);
  };

  return (
    <aside ref={ref} className="todo-glass flex min-h-[22rem] flex-col lg:sticky lg:top-[1rem] lg:max-h-[calc(100vh-9rem)]" aria-label="Plan with AI">
      <div className="flex items-center gap-2.5 border-b border-border px-[1.25rem] py-3">
        <span className="todo-icon-chip h-[1.75rem] w-[1.75rem]">
          <Icon name="SparklesIcon" size={14} variant="solid" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground">Plan with AI</h3>
          <p className="text-xs text-muted-foreground">Ask questions or ask for changes.</p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-[1.25rem] py-3 scrollbar-clean" role="log" aria-live="polite" aria-label="Conversation">
        {chat.length === 0 && !busy && !pending ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Try one of these, or write your own:</p>
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void send(starter)}
                className="todo-btn todo-btn-quiet justify-start whitespace-normal rounded-lg px-3 py-2 text-left font-medium"
              >
                {starter}
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {chat.map((turn, i) => (
              <li key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p
                  className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    turn.role === 'user' ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                  style={turn.role === 'user' ? undefined : { background: 'color-mix(in srgb, var(--color-foreground) 6%, transparent)' }}
                >
                  {turn.content}
                </p>
              </li>
            ))}
            {pending && chat.at(-2)?.content !== pending && (
              <li className="flex justify-end">
                <p className="max-w-[92%] whitespace-pre-wrap rounded-xl bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">{pending}</p>
              </li>
            )}
            {busy && (
              <li className="flex justify-start">
                <p className="animate-pulse rounded-xl px-3 py-2 text-sm text-muted-foreground" style={{ background: 'color-mix(in srgb, var(--color-foreground) 6%, transparent)' }}>
                  Thinking it through…
                </p>
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          aria-label="Message to the AI planner"
          placeholder="e.g. Move the launch two weeks earlier"
          className="todo-input min-h-[2.75rem] flex-1 resize-none px-3 py-2 text-sm"
        />
        <button type="submit" disabled={!draft.trim() || busy} className="todo-btn todo-btn-primary h-[2.75rem] w-[2.75rem] shrink-0 px-0" aria-label="Send">
          <Icon name="PaperAirplaneIcon" size={16} variant="solid" />
        </button>
      </form>
    </aside>
  );
});

export default PlanChat;
