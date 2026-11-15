import React from 'react';

/** Inline **bold** and `code` only; everything else is plain text (no HTML injection). */
function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyBase}${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={`${keyBase}${i}`} className="bs-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyBase}${i}`}>{part}</React.Fragment>;
  });
}

/** Tiny markdown subset renderer: fenced code, headings, bullet/numbered lists, paragraphs. */
export default function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const segments = text.split(/```/);
  segments.forEach((seg, si) => {
    if (si % 2 === 1) {
      const nl = seg.indexOf('\n');
      const lang = nl > -1 ? seg.slice(0, nl).trim() : '';
      const code = (nl > -1 ? seg.slice(nl + 1) : seg).replace(/\n$/, '');
      blocks.push(
        <div key={`c${si}`} className="bs-codeblock">
          {lang && <div className="bs-codeblock-lang">{lang}</div>}
          <pre>{code}</pre>
        </div>
      );
      return;
    }
    const lines = seg.split('\n');
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = (k: string) => {
      if (!list) return;
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it, `${k}-${i}-`)}</li>
          ))}
        </Tag>
      );
      list = null;
    };
    lines.forEach((line, li) => {
      const k = `${si}-${li}`;
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const head = line.match(/^\s*#{1,4}\s+(.*)$/);
      if (bullet || num) {
        const ordered = !!num;
        if (list && list.ordered !== ordered) flush(`l${k}`);
        list = list ?? { ordered, items: [] };
        list.items.push((bullet || num)![1]);
        return;
      }
      flush(`l${k}`);
      if (head)
        blocks.push(
          <h4 key={k} className="pt-1 font-semibold">
            {inline(head[1], k)}
          </h4>
        );
      else if (line.trim()) blocks.push(<p key={k}>{inline(line, k)}</p>);
    });
    flush(`lend${si}`);
  });
  return <div className={`space-y-2 text-sm leading-relaxed ${className}`}>{blocks}</div>;
}
