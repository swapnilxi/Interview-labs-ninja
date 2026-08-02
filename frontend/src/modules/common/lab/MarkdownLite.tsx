'use client';

/** Minimal line-based markdown renderer for AI-generated lab content — headers, bullets, numbered lists, plain text. */
export default function MarkdownLite({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`text-[14px] leading-7 text-foreground space-y-2 ${className}`}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('```')) return null;

        const headerMatch = line.match(/^#{1,6}\s+(.*)$/);
        if (headerMatch) {
          return (
            <h4 key={i} className="font-semibold text-foreground mt-5 mb-2 text-[15px] flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-primary/60 flex-shrink-0" />
              {headerMatch[1]}
            </h4>
          );
        }

        if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
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
  );
}
