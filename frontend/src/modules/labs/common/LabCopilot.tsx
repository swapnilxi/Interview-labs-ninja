'use client';

import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import { askLabCopilot, type LabName } from '@/lib/services/labSectionsService';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  /** The reply is a failure notice, not an answer (left out of the history sent back). */
  error?: boolean;
}

interface LabCopilotProps {
  context: string;
  labType?: 'dsa' | 'cv' | 'system-design' | 'communication' | 'finance' | 'python' | 'genai';
  onCollapse?: () => void;
  /** Accessible name and tooltip of the collapse button: "Collapse" in the side column, "Close" when the copilot is a phone sheet. */
  collapseLabel?: string;
}

const LAB_KEY: Record<NonNullable<LabCopilotProps['labType']>, LabName> = {
  dsa: 'dsa',
  cv: 'cv',
  'system-design': 'system_design',
  communication: 'communication',
  finance: 'finance',
  python: 'python',
  genai: 'genai',
};

/** How many progressive hints there are. */
const HINT_COUNT = 3;

type CopilotTab = 'hint' | 'deeper' | 'eli5' | 'chat';

const TABS: { id: CopilotTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'hint', label: 'Hint' },
  { id: 'deeper', label: 'Deeper' },
  { id: 'eli5', label: 'ELI5' },
];

const QUICK_PROMPTS: { icon: string; text: string }[] = [
  { icon: 'FaceSmileIcon', text: 'Explain simply' },
  { icon: 'ExclamationTriangleIcon', text: 'Common mistakes' },
  { icon: 'RocketLaunchIcon', text: 'Production tips' },
  { icon: 'PuzzlePieceIcon', text: 'Edge cases' },
];

/** Left rail colour of hint level 1, 2, 3: semantic tokens (they follow light/dark, not the Settings accent). */
const HINT_RAIL = ['border-success', 'border-warning', 'border-error'];

/** The Suggestions disclosure is remembered per browser (one key for all three labs). */
const SUGGEST_KEY = 'lab-copilot-suggestions';

/** `**bold**` only. Never prints the asterisks (the Deeper / ELI5 copy used to show them). */
function renderInline(text: string): ReactNode {
  return text.split(/(\*\*.+?\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** A canned answer: a line that is one bold run is a heading, every other non-empty line is a paragraph. */
function renderLines(text: string): ReactNode[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) =>
      /^\*\*[^*]+\*\*$/.test(line) ? (
        <h4 key={i} className="text-xs font-semibold leading-snug text-foreground">
          {line.slice(2, -2)}
        </h4>
      ) : (
        <p key={i}>{renderInline(line)}</p>
      )
    );
}

/** "Level 2 — …": the label is semibold so the level reads at a glance now that the traffic-light emoji are gone. */
function HintText({ text }: { text: string }) {
  const m = /^(Level \d)( — )([\s\S]*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="font-semibold">{m[1]}</span>
      {m[2]}
      {m[3]}
    </>
  );
}

function scrollToEnd(el: HTMLElement | null, behavior: ScrollBehavior) {
  if (!el) return;
  if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior });
  else el.scrollTop = el.scrollHeight;
}

function Thinking({ label = 'Copilot is thinking' }: { label?: string }) {
  return (
    <div
      className="copilot-msg-ai-quiet flex items-center gap-1 py-1 pl-3"
      role="status"
      aria-label={label}
    >
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </div>
  );
}

function PanelIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed mix-text-foreground/[0.74]">{children}</p>
    </div>
  );
}

export default function LabCopilot({
  context,
  labType = 'dsa',
  onCollapse,
  collapseLabel = 'Collapse',
}: LabCopilotProps) {
  const [activeTab, setActiveTab] = useState<CopilotTab>('chat');
  // Hints, Deeper and ELI5 are written by the model for the open topic; they reset when the topic changes.
  const [hints, setHints] = useState<string[]>([]);
  const [deeperText, setDeeperText] = useState('');
  const [eli5Text, setEli5Text] = useState('');
  const [panelError, setPanelError] = useState<string | null>(null);
  // The tab whose answer is being generated; only one can run at a time (every CTA is disabled meanwhile).
  const [generating, setGenerating] = useState<CopilotTab | null>(null);
  // Bumped on a topic change so an answer that arrives late for the previous topic is dropped.
  const epochRef = useRef(0);

  // Chat state. The welcome line is not a stored message: it is rendered from the current `context`, so it never goes stale.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatGenerating, setChatGenerating] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const prevTabRef = useRef<CopilotTab>(activeTab);
  const suggestionsId = useId();

  const canSend = input.trim().length > 0 && !chatGenerating;
  const busy = generating !== null;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SUGGEST_KEY) === '0') setSuggestionsOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, []);

  const toggleSuggestions = () => {
    const next = !suggestionsOpen;
    setSuggestionsOpen(next);
    try {
      window.localStorage.setItem(SUGGEST_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked: the choice lasts for this visit only */
    }
  };

  // Follow the conversation: a new message or the typing indicator scrolls smoothly (instantly under reduced motion). Coming back
  // to Chat remounts the list at the top, so a tab change jumps to the latest message. Nothing happens on the first render.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevTabRef.current = activeTab;
      return;
    }
    const tabChanged = prevTabRef.current !== activeTab;
    prevTabRef.current = activeTab;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    scrollToEnd(listRef.current, tabChanged || reduce ? 'auto' : 'smooth');
  }, [messages, chatGenerating, activeTab]);

  // The hosts keep the copilot mounted while the pane is collapsed (display: none resets the scroll offset): when it shows again, land on the latest message.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let hidden = el.offsetHeight === 0;
    const ro = new ResizeObserver(() => {
      const nowHidden = el.offsetHeight === 0;
      if (hidden && !nowHidden) scrollToEnd(listRef.current, 'auto');
      hidden = nowHidden;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    epochRef.current += 1;
    setHints([]);
    setDeeperText('');
    setEli5Text('');
    setPanelError(null);
    setGenerating(null);
  }, [context, labType]);

  const lab = LAB_KEY[labType];
  const historyOf = (list: Message[]) => list.map((m) => ({ role: m.role, content: m.content }));

  const generatePanel = async (tab: 'hint' | 'deeper' | 'eli5') => {
    if (busy) return;
    const epoch = epochRef.current;
    setPanelError(null);
    setGenerating(tab);
    try {
      const answer = await askLabCopilot({
        lab,
        context,
        mode: tab,
        hintLevel: tab === 'hint' ? hints.length + 1 : undefined,
        history: tab === 'hint' ? hints.map((h) => ({ role: 'ai' as const, content: h })) : undefined,
      });
      if (epoch !== epochRef.current) return;
      if (tab === 'hint') setHints((h) => [...h, answer]);
      else if (tab === 'deeper') setDeeperText(answer);
      else setEli5Text(answer);
    } catch (e) {
      if (epoch === epochRef.current) setPanelError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (epoch === epochRef.current) setGenerating(null);
    }
  };

  const hintLevel = hints.length;
  const getNextHint = () => {
    if (hintLevel < HINT_COUNT) void generatePanel('hint');
  };

  const sendChat = async (text: string) => {
    const question = text.trim();
    if (!question || chatGenerating) return;
    const history = historyOf(messages.filter((m) => !m.error));
    setMessages((p) => [...p, { id: `u${Date.now()}`, role: 'user', content: question }]);
    setInput('');
    setChatGenerating(true);
    try {
      const answer = await askLabCopilot({ lab, context, mode: 'chat', question, history });
      setMessages((p) => [...p, { id: `a${Date.now()}`, role: 'ai', content: answer }]);
    } catch (e) {
      setMessages((p) => [
        ...p,
        {
          id: `e${Date.now()}`,
          role: 'ai',
          error: true,
          content: `Couldn’t answer that: ${e instanceof Error ? e.message : 'the server did not respond.'}`,
        },
      ]);
    } finally {
      setChatGenerating(false);
    }
  };

  const footer = 'flex-shrink-0 px-4 pb-4 pt-2';
  const scroller =
    'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 scrollbar-clean [overflow-wrap:anywhere]';

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col overflow-hidden font-medium">
      {/* Header: one row, no band, no border */}
      <div className="flex flex-shrink-0 items-center gap-2.5 px-4 py-3">
        <Icon
          name="SparklesIcon"
          size={16}
          variant="solid"
          className="flex-shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight tracking-tight text-foreground">
            AI Copilot
          </h2>
          {/* The context is the topic name: it wraps, it is never cut with an ellipsis */}
          <p className="mt-0.5 text-xs leading-snug mix-text-foreground/[0.74] [overflow-wrap:anywhere]">
            {context}
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="todo-btn todo-btn-ghost -mr-1.5 h-8 w-8 flex-shrink-0 px-0 max-md:w-10"
            title={`${collapseLabel} AI Copilot`}
            aria-label={`${collapseLabel} AI Copilot`}
          >
            <Icon name="ChevronRightIcon" size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mode switch: the shared quiet segmented control; the selected one follows the Settings accent (ink text on an accent tint) */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div
          role="group"
          aria-label="Copilot mode"
          className="todo-segmented todo-segmented-quiet todo-segmented-accent flex w-full"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className="todo-segment flex-1 justify-center px-1.5"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* CHAT */}
      {activeTab === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label="AI Copilot conversation"
            className={scroller}
          >
            <p className="text-xs leading-relaxed mix-text-foreground/[0.74]">
              I&apos;m your AI Copilot for{' '}
              <strong className="font-semibold text-foreground">{context}</strong>. Ask me anything
              — I can help you understand concepts, debug your thinking, or explore edge cases.
              What&apos;s on your mind?
            </p>
            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex animate-fade-in justify-end">
                  <div className="copilot-msg-user-quiet max-w-[92%] px-3 py-2 text-xs leading-relaxed">
                    {renderInline(msg.content)}
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="copilot-msg-ai-quiet animate-fade-in space-y-2 pl-3 text-xs leading-relaxed text-foreground"
                >
                  {renderLines(msg.content)}
                </div>
              )
            )}
            {chatGenerating && <Thinking />}
          </div>

          {/* Composer: anchored at the bottom, no fill, no rule */}
          <div className="flex-shrink-0 px-4 pb-4 pt-1">
            <div className="mb-2">
              <button
                type="button"
                onClick={toggleSuggestions}
                aria-expanded={suggestionsOpen}
                aria-controls={suggestionsId}
                className="todo-focus -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium mix-text-foreground/[0.74] transition-colors hover:text-foreground"
              >
                Suggestions
                <Icon
                  name="ChevronDownIcon"
                  size={12}
                  className={`transition-transform motion-reduce:transition-none ${suggestionsOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {suggestionsOpen && (
                <div id={suggestionsId} className="mt-0.5 flex flex-col gap-0.5">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p.text}
                      type="button"
                      onClick={() => sendChat(p.text)}
                      disabled={chatGenerating}
                      className="copilot-chip-quiet todo-focus rounded-md mix-text-foreground/[0.78]"
                    >
                      <Icon
                        name={p.icon}
                        size={13}
                        className="mt-px flex-shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>{p.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat(input);
              }}
              className="relative"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                aria-label="Ask the AI Copilot"
                autoComplete="off"
                enterKeyHint="send"
                className="copilot-input-quiet max-md:pr-[3rem]"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send"
                className={`todo-focus absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors disabled:cursor-default max-md:h-10 max-md:w-10 ${
                  canSend
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground opacity-60'
                }`}
              >
                <Icon name="PaperAirplaneIcon" size={12} variant="solid" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* HINT */}
      {activeTab === 'hint' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={scroller} aria-live="polite" aria-busy={generating === 'hint'}>
            <PanelIntro title="Progressive Hints">
              Hints get more specific with each level. Try to solve it before going deeper.
            </PanelIntro>
            <ol className="space-y-3">
              {hints.map((hint, i) => (
                <li
                  key={i}
                  data-semantic="hint"
                  className={`animate-fade-in border-l-2 pl-3 text-xs leading-relaxed text-foreground ${HINT_RAIL[i] ?? HINT_RAIL[2]}`}
                >
                  <HintText text={hint} />
                </li>
              ))}
            </ol>
            {generating === 'hint' && <Thinking label="Generating the next hint" />}
            {panelError && <p role="alert" className="text-xs leading-relaxed text-error">{panelError}</p>}
            <div
              role="img"
              aria-label={`${hintLevel} of ${HINT_COUNT} hints revealed`}
              className="flex gap-1.5"
            >
              {Array.from({ length: HINT_COUNT }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 w-4 rounded-full ${i < hintLevel ? 'bg-primary' : 'mix-bg-foreground/15'}`}
                />
              ))}
            </div>
          </div>
          {hintLevel < HINT_COUNT ? (
            <div className={footer}>
              <button
                type="button"
                onClick={getNextHint}
                disabled={busy}
                className="todo-btn todo-btn-primary w-full py-2"
              >
                <Icon name="LightBulbIcon" size={14} aria-hidden="true" />
                {generating === 'hint'
                  ? 'Thinking…'
                  : hintLevel === 0
                    ? 'Get First Hint'
                    : `Get Level ${hintLevel + 1} Hint`}
              </button>
            </div>
          ) : (
            <p className={`${footer} text-center text-xs mix-text-foreground/[0.74]`}>
              All hint levels revealed. Try the solution now!
            </p>
          )}
        </div>
      )}

      {/* DEEPER */}
      {activeTab === 'deeper' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={scroller} aria-live="polite" aria-busy={generating === 'deeper'}>
            <PanelIntro title="Dive Deeper">
              Advanced internals, production insights, and what senior engineers know that juniors
              miss.
            </PanelIntro>
            {generating === 'deeper' && <Thinking label="Generating deep insights" />}
            {panelError && <p role="alert" className="text-xs leading-relaxed text-error">{panelError}</p>}
            {deeperText && (
              <div className="copilot-msg-ai-quiet animate-fade-in space-y-3 pl-3 text-xs leading-relaxed text-foreground">
                {renderLines(deeperText)}
              </div>
            )}
          </div>
          {!deeperText && (
            <div className={footer}>
              <button
                type="button"
                onClick={() => generatePanel('deeper')}
                disabled={busy}
                className="todo-btn todo-btn-primary w-full py-2"
              >
                <Icon name="SparklesIcon" size={14} aria-hidden="true" />
                {generating === 'deeper' ? 'Generating…' : 'Generate Deep Insights'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ELI5 */}
      {activeTab === 'eli5' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={scroller} aria-live="polite" aria-busy={generating === 'eli5'}>
            <PanelIntro title="Explain Like I'm 5">
              A simple, intuitive explanation — no jargon, no formulas.
            </PanelIntro>
            {generating === 'eli5' && <Thinking label="Writing the explanation" />}
            {panelError && <p role="alert" className="text-xs leading-relaxed text-error">{panelError}</p>}
            {eli5Text && (
              <div className="copilot-msg-ai-quiet animate-fade-in space-y-3 pl-3 text-xs leading-relaxed text-foreground">
                {renderLines(eli5Text)}
              </div>
            )}
          </div>
          {!eli5Text && (
            <div className={footer}>
              <button
                type="button"
                onClick={() => generatePanel('eli5')}
                disabled={busy}
                className="todo-btn todo-btn-primary w-full py-2"
              >
                <Icon name="FaceSmileIcon" size={14} aria-hidden="true" />
                {generating === 'eli5' ? 'Writing…' : 'Explain Simply'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The 48px strip shown while the copilot is collapsed (replaces the three hand-copied versions in the lab modules). */
export function LabCopilotRail({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="todo-btn todo-btn-ghost h-8 w-8 px-0"
        aria-label="Show Copilot"
        title="Show Copilot"
      >
        <Icon name="ChevronLeftIcon" size={16} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="mt-1 flex h-7 w-7 items-center justify-center rounded-full text-primary mix-bg-primary/15"
      >
        <Icon name="SparklesIcon" size={12} variant="solid" />
      </span>
    </div>
  );
}
