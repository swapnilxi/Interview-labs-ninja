'use client';

/**
 * Career Studio AI copilot — reuses the labs' right-hand copilot shell/markup
 * (see common/LabCopilot.tsx) but wired to the real backend (/career/copilot/ask),
 * the same way TodoCopilot wires to /todo/copilot/ask.
 */

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';

interface Message { id: string; role: 'user' | 'ai'; content: string; }

/**
 * Quick actions. `instant` presets send immediately (no missing parameter);
 * the rest just pre-fill the input and focus it so the user can finish typing
 * (e.g. "Tailor for a company" needs the actual company name) before sending.
 */
const QUICK_ACTIONS: { label: string; prompt: string; instant: boolean }[] = [
  { label: 'Improve my summary', prompt: 'Improve my professional summary — make it sharper and more compelling.', instant: true },
  { label: 'Stronger achievements', prompt: 'Rewrite my experience bullets as stronger, quantified achievements.', instant: true },
  { label: 'Reduce to one page', prompt: 'How can I cut my resume down to fit one page? Tell me exactly what to trim.', instant: true },
  { label: 'Expand my projects', prompt: 'Expand my project descriptions with more detail and impact.', instant: true },
  { label: 'Tailor for a role…', prompt: 'Tailor my resume for a ', instant: false },
  { label: 'Tailor for a company…', prompt: 'Tailor my resume for a role at ', instant: false },
  { label: "What's missing?", prompt: "What's missing from my resume?", instant: true },
  { label: 'ATS optimization tips', prompt: 'Give me ATS optimization tips for my resume.', instant: true },
];

function renderBold(content: string) {
  return content.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>));
}

export default function CareerCopilot({ masterId, onCollapse }: { masterId?: string; onCollapse?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'w', role: 'ai', content: "I'm your Career copilot. Ask about your resume, phrasing, ATS, or what to add next — I can see your current draft." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const runAction = (a: (typeof QUICK_ACTIONS)[number]) => {
    if (busy) return;
    if (a.instant) {
      void send(a.prompt);
    } else {
      setInput(a.prompt);
      // Focus + put the caret at the end so the user can finish typing the
      // company/role name right where the preset left off.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMessages((p) => [...p, { id: `u${Date.now()}`, role: 'user', content: text.trim() }]);
    setInput('');
    setBusy(true);
    try {
      const { answer } = await careerService.askCopilot(text.trim(), masterId);
      setMessages((p) => [...p, { id: `a${Date.now()}`, role: 'ai', content: answer }]);
    } catch (e: any) {
      setMessages((p) => [...p, { id: `e${Date.now()}`, role: 'ai', content: `⚠️ ${e?.message || 'Something went wrong.'}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
            <Icon name="SparklesIcon" size={13} className="text-secondary" variant="solid" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-heading text-xs font-semibold text-foreground">AI Copilot</span>
            <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">Career Studio</p>
          </div>
          {onCollapse && (
            <button onClick={onCollapse} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse">
              <Icon name="ChevronRightIcon" size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-clean">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted border border-border text-foreground rounded-tl-none'}`}>
              {renderBold(msg.content)}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-muted border border-border px-3 py-2 rounded-lg rounded-tl-none flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 border-t border-border bg-card p-3">
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.label} onClick={() => runAction(a)} disabled={busy} title={a.instant ? undefined : 'Fills the input — add the name, then send'} className="text-xs px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-smooth disabled:opacity-50 text-left leading-tight">
              {a.label}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 relative">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} placeholder="Ask anything…" className="flex-1 bg-input border border-border rounded-full py-2 pl-3 pr-9 text-xs focus-ring placeholder:text-muted-foreground" />
          <button type="submit" disabled={!input.trim() || busy} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-smooth disabled:opacity-50">
            <Icon name="PaperAirplaneIcon" size={12} variant="solid" />
          </button>
        </form>
      </div>
    </div>
  );
}
