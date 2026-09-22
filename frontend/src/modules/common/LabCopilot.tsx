'use client';

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface Message { id: string; role: 'user' | 'ai'; content: string; }

interface LabCopilotProps {
  context: string;
  labType?: 'dsa' | 'cv' | 'system-design';
  onCollapse?: () => void;
}

const HINT_LEVELS: Record<string, string[]> = {
  default: [
    "Level 1 🟢 — Think about what data structure gives you O(1) lookups. What property of the problem can you exploit to avoid brute force?",
    "Level 2 🟡 — The key insight is reducing the problem to a complement search. For every element you see, ask: 'Have I seen what I need to pair with this before?'",
    "Level 3 🔴 — Use a hash map to store {value: index} as you iterate. For each element, check if (target - element) is already in the map. Return the pair if found.",
  ],
  dsa: [
    "Level 1 🟢 — Read the problem constraints carefully. The input size and value range usually tell you the expected time complexity (e.g., n ≤ 10⁵ → O(n log n) max).",
    "Level 2 🟡 — Identify the pattern family: Is this a search problem? A range query? A graph traversal? Matching the problem to a known pattern is the skill.",
    "Level 3 🔴 — Look for the invariant: what property holds true as you move through the array/tree/graph? Most optimal solutions maintain a small invariant over a larger state space.",
  ],
  cv: [
    "Level 1 🟢 — Start from first principles: what is the mathematical objective this algorithm is optimizing? Understanding the loss function unlocks the architecture.",
    "Level 2 🟡 — Think about what inductive biases the model has. CNNs assume local correlation and translation invariance — is that assumption valid for your data?",
    "Level 3 🔴 — The practical bottleneck is almost never the model architecture. Look at your data pipeline, augmentation strategy, and learning rate schedule first.",
  ],
  'system-design': [
    "Level 1 🟢 — Start with clarifying requirements. Ambiguity is intentional — interviewers want to see if you ask the right questions before designing.",
    "Level 2 🟡 — Do back-of-envelope math first. If you need 100k QPS, a single MySQL instance won't work — that shapes every decision downstream.",
    "Level 3 🔴 — Think in failure modes: what happens if this service goes down? What if the database is slow? Your design is only as strong as its weakest link.",
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
  default: `🐣 **Explain Like I'm 5:**

Imagine you have a big box of LEGO pieces. You want to find two pieces that fit together perfectly.

The slow way: pick up every piece, try it with every other piece. That takes FOREVER if you have 1,000 pieces!

The smart way: when you pick up a piece, put a sticky note on it saying what kind of piece it is. Now when you pick up a new piece, just check your sticky notes — if the matching piece is already noted, you found your pair immediately!

That's what the hash map does — it's your sticky note collection. Instead of checking everything again, you just look it up. 🎯`,
  'system-design': `🐣 **Explain Like I'm 5:**

Imagine you have a very popular lemonade stand. At first, you serve everyone yourself — easy!

But then 10,000 people show up. You can't serve everyone! So you:

1. **Get more helpers** (horizontal scaling)
2. **Put up a sign** saying which line to join based on your first letter (load balancing + sharding)
3. **Pre-pour popular drinks** so you don't make them fresh every time (caching)
4. **Have a backup stand** in case yours breaks (replication + failover)

That's distributed systems! Big lemonade stand problems, solved with big lemonade stand solutions. 🍋`,
};

type CopilotTab = 'hint' | 'deeper' | 'eli5' | 'chat';

export default function LabCopilot({ context, labType = 'dsa', onCollapse }: LabCopilotProps) {
  const [activeTab, setActiveTab] = useState<CopilotTab>('chat');
  const [hintLevel, setHintLevel] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [deeperShown, setDeeperShown] = useState(false);
  const [eli5Shown, setEli5Shown] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    { id: 'w', role: 'ai', content: `I'm your AI Copilot for **${context}**. Ask me anything — I can help you understand concepts, debug your thinking, or explore edge cases. What's on your mind?` },
  ]);
  const [input, setInput] = useState('');
  const [chatGenerating, setChatGenerating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, chatGenerating]);

  const tabs: { id: CopilotTab; label: string; icon: string }[] = [
    { id: 'chat', label: 'Chat', icon: 'ChatBubbleLeftRightIcon' },
    { id: 'hint', label: 'Hint', icon: 'LightBulbIcon' },
    { id: 'deeper', label: 'Deeper', icon: 'MagnifyingGlassIcon' },
    { id: 'eli5', label: "ELI5", icon: 'FaceSmileIcon' },
  ];

  const triggerGenerate = (cb: () => void) => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); cb(); }, 1400);
  };

  const getNextHint = () => {
    const hints = HINT_LEVELS[labType] ?? HINT_LEVELS.default;
    if (hintLevel < hints.length) {
      triggerGenerate(() => { setHintShown(true); setHintLevel(l => l + 1); });
    }
  };

  const sendChat = (text: string) => {
    if (!text.trim() || chatGenerating) return;
    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: text.trim() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setChatGenerating(true);
    setTimeout(() => {
      const reply: Message = {
        id: `a${Date.now()}`,
        role: 'ai',
        content: `Great question about **${context}**! Here's how I'd approach this: The key insight is to think about the problem constraints first — what's the input range? What's the expected time complexity? Once you know those, the algorithmic pattern often becomes clear. Want me to walk through the reasoning step by step?`,
      };
      setMessages(p => [...p, reply]);
      setChatGenerating(false);
    }, 1400);
  };

  const hints = HINT_LEVELS[labType] ?? HINT_LEVELS.default;

  return (
    <div className="flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
            <Icon name="SparklesIcon" size={13} className="text-secondary" variant="solid" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-heading text-xs font-semibold text-foreground">AI Copilot</span>
            <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5" title={context}>{context}</p>
          </div>
          {onCollapse && (
            <button onClick={onCollapse} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse">
              <Icon name="ChevronRightIcon" size={13} />
            </button>
          )}
        </div>
      </div>
      
      {/* Tab content — fills remaining space, uses flex column so children can pin bottom */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* copilot chat TAB */}
        
         {/* Tabs */}
      <div className="flex border-b border-border bg-card flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-smooth border-b-2 ${
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Icon name={tab.icon as any} size={13} />
            {tab.label}
          </button>
        ))}
      </div>
        {activeTab === 'chat' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Scrollable messages — flex-1 + min-h-0 keeps it from overflowing */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-clean">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-none'
                      : 'bg-muted border border-border text-foreground rounded-tl-none'
                  }`}>
                    {msg.content.split('**').map((part, i) =>
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
                    )}
                  </div>
                </div>
              ))}
              {chatGenerating && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border px-3 py-2 rounded-lg rounded-tl-none flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Pinned input — flex-shrink-0 keeps it fixed at the bottom */}
            <div className="flex-shrink-0 border-t border-border bg-card p-3">
              {/* Quick prompts */}
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {['Explain simply', 'Common mistakes', 'Production tips', 'Edge cases'].map(p => (
                  <button key={p} onClick={() => sendChat(p)} disabled={chatGenerating}
                    className="text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-smooth disabled:opacity-50 text-left leading-tight">
                    {p}
                  </button>
                ))}
              </div>
              <form onSubmit={e => { e.preventDefault(); sendChat(input); }} className="flex gap-2 relative">
                <input value={input} onChange={e => setInput(e.target.value)} disabled={false}
                  placeholder="Ask anything..."
                  className="flex-1 bg-input border border-border rounded-full py-2 pl-3 pr-9 text-xs focus-ring placeholder:text-muted-foreground" />
                <button type="submit" disabled={!input.trim() || chatGenerating}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-smooth disabled:opacity-50">
                  <Icon name="PaperAirplaneIcon" size={12} variant="solid" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* HINT TAB */}
        {activeTab === 'hint' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-clean">
              <div className="text-center">
                <Icon name="LightBulbIcon" size={24} variant="outline" className="text-warning mx-auto mb-2" />
                <h4 className="font-heading text-sm font-semibold text-foreground mb-4">Progressive Hints</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hints get more specific with each level. Try to solve it before going deeper.
                </p>
              </div>

              {/* Hint levels shown */}
              <div className="space-y-2">
                {hints.slice(0, hintLevel).map((hint, i) => (
                  <div key={i} className={`p-3 rounded-lg text-xs leading-relaxed border ${
                    i === 0 ? 'bg-success/5 border-success/20' :
                    i === 1 ? 'bg-warning/5 border-warning/20' : 'bg-error/5 border-error/20'
                  }`}>
                    {hint}
                  </div>
                ))}
              </div>

              {generating && activeTab === 'hint' && (
                <div className="flex justify-center py-4">
                  <span className="w-5 h-5 border-2 border-warning/30 border-t-warning rounded-full animate-spin" />
                </div>
              )}

              {/* Hint level indicators */}
              <div className="flex justify-center gap-2 pt-2">
                {hints.map((_, i) => (
                  <div key={i} className={`w-4 h-1.5 rounded-full ${i < hintLevel ? 'bg-warning' : 'bg-muted'}`} />
                ))}
              </div>
            </div>

            {/* Pinned bottom action */}
            {hintLevel < hints.length && !generating && (
              <div className="flex-shrink-0 border-t border-border bg-card p-3">
                <button onClick={getNextHint}
                  className="w-full py-2 rounded-md border border-warning text-warning text-xs font-semibold hover:bg-warning/10 transition-smooth flex items-center justify-center gap-2">
                  <Icon name="LightBulbIcon" size={14} />
                  {hintLevel === 0 ? 'Get First Hint' : `Get Level ${hintLevel + 1} Hint`}
                </button>
              </div>
            )}
            {hintLevel >= hints.length && (
              <div className="flex-shrink-0 border-t border-border bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">All hint levels revealed. Try the solution now!</p>
              </div>
            )}
          </div>
        )}

        {/* DIVE DEEPER TAB */}
        {activeTab === 'deeper' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-clean">
              <div className="text-center">
                <Icon name="MagnifyingGlassIcon" size={24} variant="outline" className="text-secondary mx-auto mb-2" />
                <h4 className="font-heading text-sm font-semibold text-foreground mb-4">Dive Deeper</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Advanced internals, production insights, and what senior engineers know that juniors miss.
                </p>
              </div>

              {generating && activeTab === 'deeper' && (
                <div className="flex justify-center py-4">
                  <span className="w-5 h-5 border-2 border-secondary/30 border-t-secondary rounded-full animate-spin" />
                </div>
              )}

              {deeperShown && (
                <div className="text-xs leading-relaxed text-foreground space-y-2 animate-fade-in">
                  {(DIVE_DEEPER[labType] ?? DIVE_DEEPER.default).split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.endsWith('**'))
                      return <h5 key={i} className="font-semibold text-foreground mt-3 mb-1">{line.replace(/\*\*/g, '')}</h5>;
                    if (/^\d+\./.test(line))
                      return <p key={i} className="text-muted-foreground">{line}</p>;
                    return line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-4" />;
                  })}
                </div>
              )}
            </div>

            {/* Pinned bottom action */}
            {!deeperShown && !generating && (
              <div className="flex-shrink-0 border-t border-border bg-card p-3">
                <button
                  onClick={() => triggerGenerate(() => setDeeperShown(true))}
                  className="w-full py-2 rounded-md bg-secondary/10 border border-secondary/30 text-secondary text-xs font-semibold hover:bg-secondary/20 transition-smooth flex items-center justify-center gap-2"
                >
                  <Icon name="SparklesIcon" size={14} />Generate Deep Insights
                </button>
              </div>
            )}
          </div>
        )}

        {/* ELI5 TAB */}
        {activeTab === 'eli5' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 scrollbar-clean">
              <div className="text-center">
                <Icon name="FaceSmileIcon" size={24} variant="outline" className="text-accent mx-auto mb-2" />
                <h4 className="font-heading text-sm font-semibold text-foreground mb-4">Explain Like I'm 5</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A simple, intuitive explanation — no jargon, no formulas.
                </p>
              </div>

              {generating && activeTab === 'eli5' && (
                <div className="flex justify-center py-4">
                  <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                </div>
              )}

              {eli5Shown && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs leading-relaxed text-foreground space-y-2 animate-fade-in">
                  {(ELI5_RESPONSES[labType] ?? ELI5_RESPONSES.default).split('\n').map((line, i) => {
                    if (line.startsWith('🐣'))
                      return <h5 key={i} className="font-semibold text-accent">{line}</h5>;
                    return line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-3" />;
                  })}
                </div>
              )}
            </div>

            {/* Pinned bottom action */}
            {!eli5Shown && !generating && (
              <div className="flex-shrink-0 border-t border-border bg-card p-3">
                <button
                  onClick={() => triggerGenerate(() => setEli5Shown(true))}
                  className="w-full py-2 rounded-md bg-accent/10 border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/20 transition-smooth flex items-center justify-center gap-2"
                >
                  <Icon name="FaceSmileIcon" size={14} />Explain Simply
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
