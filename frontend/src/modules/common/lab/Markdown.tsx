'use client';

import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Full markdown renderer for AI-generated lab content (headings, **bold**, `code`, fenced code, lists,
 * tables, blockquotes, links). Raw HTML in the source is NOT rendered — react-markdown escapes it.
 *
 * Styling uses theme tokens via the `mix-*` utilities (a plain `bg-primary/60` compiles to nothing here)
 * and explicit-pixel-safe spacing (no `px-6`/`py-12`: those keys are redefined in px in this app).
 */

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch {
      /* clipboard unavailable (insecure context) — ignore */
    }
  };
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 mix-bg-muted/80 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
          </div>
          <span className="text-xs text-muted-foreground ml-1">{lang || 'text'}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 bg-elevated overflow-x-auto leading-relaxed">
        <code className="text-[13px] font-code text-foreground leading-relaxed whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}

const components: Components = {
  h1: ({ children }) => <MdHeading size="text-[17px]">{children}</MdHeading>,
  h2: ({ children }) => <MdHeading size="text-[16px]">{children}</MdHeading>,
  h3: ({ children }) => <MdHeading size="text-[15px]">{children}</MdHeading>,
  h4: ({ children }) => <MdHeading size="text-[15px]">{children}</MdHeading>,
  h5: ({ children }) => <MdHeading size="text-[14px]">{children}</MdHeading>,
  h6: ({ children }) => <MdHeading size="text-[14px]">{children}</MdHeading>,
  // pre-line keeps single newlines inside a paragraph (the old line-based renderer did too), so
  // unfenced multi-line snippets such as ASCII flow diagrams don't collapse into one line.
  // A paragraph that is only **bold** is a section title in the lab content (`**Pitfalls**`), so give it
  // the heading treatment the old renderer did.
  p: ({ node, children }) => {
    const only = node?.children.length === 1 ? node.children[0] : null;
    if (only?.type === 'element' && only.tagName === 'strong') {
      return (
        <MdHeading size="text-[15px]">
          {(children as React.ReactElement<{ children?: React.ReactNode }>).props.children}
        </MdHeading>
      );
    }
    return <p className="font-body leading-relaxed whitespace-pre-line">{children}</p>;
  },
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-primary">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1.5 marker:text-primary marker:font-bold">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="font-body leading-relaxed pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary pl-4 py-1 mix-bg-muted/40 rounded-r-lg text-muted-foreground space-y-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="mix-bg-muted/60 text-left">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 border-b border-border align-top">{children}</td>,
  // Fenced blocks arrive as <pre><code class="language-x">; inline code has no <pre> parent.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = /language-([\w+#-]+)/.exec(className ?? '')?.[1];
    const text = String(children ?? '');
    // Block code: has a language class, or spans multiple lines (a fence without a language).
    if (lang || text.includes('\n'))
      return <CodeBlock lang={lang ?? ''} code={text.replace(/\n$/, '')} />;
    return (
      <code className="px-1.5 py-0.5 rounded mix-bg-muted/70 font-code text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },
};

function MdHeading({ size, children }: { size: string; children?: React.ReactNode }) {
  return (
    <h4 className={`font-semibold text-foreground mt-5 mb-2 flex items-center gap-2 ${size}`}>
      <span className="w-1 h-4 rounded-full mix-bg-primary/60 flex-shrink-0" />
      <span>{children}</span>
    </h4>
  );
}

export default function Markdown({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`text-[14px] leading-7 text-foreground space-y-2 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
