'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface OnDemandSectionProps {
  sectionIndex: number;
  icon: string;
  title: string;
  subtitle?: string;
  content: string | null;
  isGenerating: boolean;
  isGenerated: boolean;
  onGenerate: () => void;
  children?: React.ReactNode; // for custom render (e.g. quiz)
}

export default function OnDemandSection({
  sectionIndex,
  icon,
  title,
  subtitle,
  content,
  isGenerating,
  isGenerated,
  onGenerate,
  children,
}: OnDemandSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="reading-card overflow-hidden transition-smooth mb-4 group/section">
      {/* ── Header ── */}
      <div
        className={`flex items-center justify-between px-4 py-3.5 border-b border-border transition-colors
          ${isGenerated ? 'bg-gradient-to-r from-surface to-card' : 'bg-surface/40'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Section number pill */}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold leading-none transition-colors
            ${isGenerated ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/60'}`}>
            {String(sectionIndex).padStart(2, '0')}
          </div>

          {/* Icon + title */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
            ${isGenerated ? 'bg-primary/10' : 'bg-muted/60'}`}>
            <Icon name={icon as any} size={16} className={isGenerated ? 'text-primary' : 'text-muted-foreground/50'} />
          </div>

          <div className="min-w-0">
            <h3 className={`text-sm font-semibold leading-tight transition-colors
              ${isGenerated ? 'text-foreground' : 'text-foreground/70'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {!isGenerated ? (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 hover:border-primary/40
                disabled:opacity-50 disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
                  Generating…
                </>
              ) : (
                <>
                  <Icon name="SparklesIcon" size={13} />
                  Generate
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-success flex items-center gap-1 font-medium">
                <Icon name="CheckCircleIcon" size={13} />
                Done
              </span>
              {!children && (
                <button
                  onClick={() => setCollapsed(c => !c)}
                  className="p-1.5 rounded-lg hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground"
                  title={collapsed ? 'Expand' : 'Collapse'}
                >
                  <Icon name={collapsed ? 'ChevronDownIcon' : 'ChevronUpIcon'} size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {isGenerated && !collapsed && (
        <div className="p-5 animate-fade-in">
          {children ?? (
            <div className="text-[14px] leading-7 text-foreground space-y-2">
              {(content ?? '').split('\n').map((line, i) => {
                if (line.startsWith('```')) return null;
                if (line.startsWith('**') && line.endsWith('**')) {
                  return (
                    <h4 key={i} className="font-semibold text-foreground mt-5 mb-2 text-[15px] flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-primary/60 flex-shrink-0" />
                      {line.replace(/\*\*/g, '')}
                    </h4>
                  );
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <div key={i} className="flex gap-2.5 items-start">
                      <span className="text-primary mt-1.5 flex-shrink-0 text-[8px]">●</span>
                      <span className="font-body leading-relaxed">{line.replace(/^[-•]\s/, '')}</span>
                    </div>
                  );
                }
                if (/^\d+\.\s/.test(line)) {
                  const num = line.match(/^(\d+)\./)?.[1];
                  return (
                    <div key={i} className="flex gap-2.5 items-start">
                      <span className="text-primary font-bold flex-shrink-0 w-5 text-[12px] mt-0.5">{num}.</span>
                      <span className="leading-relaxed">{line.replace(/^\d+\.\s/, '')}</span>
                    </div>
                  );
                }
                if (line.trim() === '') return <div key={i} className="h-1" />;
                return <p key={i} className="font-body leading-relaxed">{line}</p>;
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Code blocks ── */}
      {isGenerated && !collapsed && content && content.includes('```') && (
        <div className="px-5 pb-5">
          {content.split('```').filter((_, i) => i % 2 === 1).map((code, i) => {
            const lines = code.split('\n');
            const lang = lines[0].trim();
            const codeContent = lines.slice(1).join('\n');
            return (
              <div key={i} className="mt-3 rounded-xl overflow-hidden border border-border shadow-sm">
                <div className="flex items-center justify-between px-4 py-2 bg-muted/80 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400/60" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
                    </div>
                    <span className="text-xs text-muted-foreground ml-1">{lang || 'python'}</span>
                  </div>
                  <Icon name="CodeBracketIcon" size={13} className="text-muted-foreground/60" />
                </div>
                <pre className="p-4 bg-elevated overflow-x-auto">
                  <code className="text-[13px] font-code text-foreground leading-relaxed whitespace-pre">{codeContent}</code>
                </pre>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Locked state ── */}
      {!isGenerated && !isGenerating && (
        <div className="px-4 py-3 flex items-center gap-2.5 text-muted-foreground/60 bg-muted/20">
          <Icon name="LockClosedIcon" size={13} />
          <p className="text-xs">Click <span className="text-primary font-medium">Generate ✨</span> to load this section on-demand</p>
        </div>
      )}
    </div>
  );
}
