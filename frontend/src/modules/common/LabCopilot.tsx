'use client';

import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

interface LabCopilotProps {
  context: string;
  labType?: 'dsa' | 'cv' | 'system-design';
  onCollapse?: () => void;
  /** Accessible name and tooltip of the collapse button: "Collapse" in the side column, "Close" when the copilot is a phone sheet. */
  collapseLabel?: string;
}

const HINT_LEVELS: Record<string, string[]> = {
  default: [
    'Level 1 — Think about what data structure gives you O(1) lookups. What property of the problem can you exploit to avoid brute force?',
    "Level 2 — The key insight is reducing the problem to a complement search. For every element you see, ask: 'Have I seen what I need to pair with this before?'",
    'Level 3 — Use a hash map to store {value: index} as you iterate. For each element, check if (target - element) is already in the map. Return the pair if found.',
  ],
  dsa: [
    'Level 1 — Read the problem constraints carefully. The input size and value range usually tell you the expected time complexity (e.g., n ≤ 10⁵ → O(n log n) max).',
    'Level 2 — Identify the pattern family: Is this a search problem? A range query? A graph traversal? Matching the problem to a known pattern is the skill.',
    'Level 3 — Look for the invariant: what property holds true as you move through the array/tree/graph? Most optimal solutions maintain a small invariant over a larger state space.',
  ],
  cv: [
    'Level 1 — Start from first principles: what is the mathematical objective this algorithm is optimizing? Understanding the loss function unlocks the architecture.',
    'Level 2 — Think about what inductive biases the model has. CNNs assume local correlation and translation invariance — is that assumption valid for your data?',
    'Level 3 — The practical bottleneck is almost never the model architecture. Look at your data pipeline, augmentation strategy, and learning rate schedule first.',
  ],
  'system-design': [
    'Level 1 — Start with clarifying requirements. Ambiguity is intentional — interviewers want to see if you ask the right questions before designing.',
    "Level 2 — Do back-of-envelope math first. If you need 100k QPS, a single MySQL instance won't work — that shapes every decision downstream.",
    'Level 3 — Think in failure modes: what happens if this service goes down? What if the database is slow? Your design is only as strong as its weakest link.',
  ],
};

const DIVE_DEEPER: Record<string, string> = {
  default: `**What senior engineers know that juniors miss:**

1. **The hidden constant factor** — Big-O hides constant factors. A O(n log n) algorithm with large constants can lose to O(n²) for small n. Always benchmark.

2. **Cache behaviour matters** — Array iteration is ~10x faster than linked list traversal on modern hardware due to cache lines. The algorithm analysis doesn't capture this.

3. **Memory allocation is not free** — Creating millions of small objects (Python dicts, lists) triggers GC pressure. In production, pre-allocate or reuse buffers.

4. **The interviewer's real question** — They're not testing if you know the algorithm. They're testing how you reason under uncertainty, handle ambiguity, and communicate trade-offs.

5. **Edge cases that break systems in production** — Integer overflow (use Python's arbitrary-precision ints), empty input, single-element input, all-same elements, already-sorted input.`,
  'system-design': `**What happens at production scale that interviews miss:**

1. **Network partitions are more common than you think** — Between services, ~0.1% of requests will have network issues. Your retry logic and circuit breakers matter enormously.

2. **Database hotspots kill systems** — A "popular tweet" accessed 1M times/sec will destroy your DB if you don't cache aggressively. Celebrity problem is real.

3. **Consistency is a spectrum, not binary** — You're not choosing between "consistent" and "not consistent". You're choosing which invariants to relax under which conditions.

4. **Operational complexity is a real cost** — Every microservice you add is another thing that can fail, needs monitoring, deployment pipelines, and on-call coverage.

5. **Read your SLA carefully** — 99.9% uptime = 8.7 hours/year downtime. 99.99% = 52 minutes/year. The engineering cost to go from 3 nines to 4 nines is enormous.`,
};

const ELI5_RESPONSES: Record<string, string> = {
  default: `**Explain Like I'm 5:**

Imagine you have a big box of LEGO pieces. You want to find two pieces that fit together perfectly.

The slow way: pick up every piece, try it with every other piece. That takes FOREVER if you have 1,000 pieces!

The smart way: when you pick up a piece, put a sticky note on it saying what kind of piece it is. Now when you pick up a new piece, just check your sticky notes — if the matching piece is already noted, you found your pair immediately!

That's what the hash map does — it's your sticky note collection. Instead of checking everything again, you just look it up.`,
  'system-design': `**Explain Like I'm 5:**

Imagine you have a very popular lemonade stand. At first, you serve everyone yourself — easy!

But then 10,000 people show up. You can't serve everyone! So you:

1. **Get more helpers** (horizontal scaling)
2. **Put up a sign** saying which line to join based on your first letter (load balancing + sharding)
3. **Pre-pour popular drinks** so you don't make them fresh every time (caching)
4. **Have a backup stand** in case yours breaks (replication + failover)

That's distributed systems! Big lemonade stand problems, solved with big lemonade stand solutions.`,
};

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
  const [hintLevel, setHintLevel] = useState(0);
  const [deeperShown, setDeeperShown] = useState(false);
  const [eli5Shown, setEli5Shown] = useState(false);
  // The tab whose canned answer is being "generated"; only one can run at a time (every CTA is disabled meanwhile).
  const [generating, setGenerating] = useState<CopilotTab | null>(null);

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

  const triggerGenerate = (tab: CopilotTab, cb: () => void) => {
    if (busy) return;
    setGenerating(tab);
    setTimeout(() => {
      setGenerating(null);
      cb();
    }, 1400);
  };

  const hints = HINT_LEVELS[labType] ?? HINT_LEVELS.default;
  const getNextHint = () => {
    if (hintLevel < hints.length) triggerGenerate('hint', () => setHintLevel((l) => l + 1));
  };

  const sendChat = (text: string) => {
    if (!text.trim() || chatGenerating) return;
    setMessages((p) => [...p, { id: `u${Date.now()}`, role: 'user', content: text.trim() }]);
    setInput('');
    setChatGenerating(true);
    setTimeout(() => {
      setMessages((p) => [
        ...p,
        {
          id: `a${Date.now()}`,
          role: 'ai',
          content: `Great question about **${context}**! Here's how I'd approach this: The key insight is to think about the problem constraints first — what's the input range? What's the expected time complexity? Once you know those, the algorithmic pattern often becomes clear. Want me to walk through the reasoning step by step?`,
        },
      ]);
      setChatGenerating(false);
    }, 1400);
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
                  className="copilot-msg-ai-quiet animate-fade-in pl-3 text-xs leading-relaxed text-foreground"
                >
                  {renderInline(msg.content)}
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
              {hints.slice(0, hintLevel).map((hint, i) => (
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
            <div
              role="img"
              aria-label={`${hintLevel} of ${hints.length} hints revealed`}
              className="flex gap-1.5"
            >
              {hints.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-4 rounded-full ${i < hintLevel ? 'bg-primary' : 'mix-bg-foreground/15'}`}
                />
              ))}
            </div>
          </div>
          {hintLevel < hints.length ? (
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
            {deeperShown && (
              <div className="copilot-msg-ai-quiet animate-fade-in space-y-3 pl-3 text-xs leading-relaxed text-foreground">
                {renderLines(DIVE_DEEPER[labType] ?? DIVE_DEEPER.default)}
              </div>
            )}
          </div>
          {!deeperShown && (
            <div className={footer}>
              <button
                type="button"
                onClick={() => triggerGenerate('deeper', () => setDeeperShown(true))}
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
            {eli5Shown && (
              <div className="copilot-msg-ai-quiet animate-fade-in space-y-3 pl-3 text-xs leading-relaxed text-foreground">
                {renderLines(ELI5_RESPONSES[labType] ?? ELI5_RESPONSES.default)}
              </div>
            )}
          </div>
          {!eli5Shown && (
            <div className={footer}>
              <button
                type="button"
                onClick={() => triggerGenerate('eli5', () => setEli5Shown(true))}
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
