'use client';

import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Full markdown renderer for AI-generated lab content (headings, **bold**, `code`, fenced code, lists,
 * tables, blockquotes, links). Raw HTML in the source is NOT rendered — react-markdown escapes it.
 *
 * Styling uses theme tokens via the `mix-*` utilities (a plain opacity modifier on a theme colour compiles to
 * nothing here) and rem-safe spacing (the 6/12/18/24... keys are redefined in px in this app: see CLAUDE.md).
 */

/** Turns a fenced block's source into coloured spans (Guided Practice passes a Python one); without it blocks stay plain. */
export type CodeHighlighter = (code: string, lang: string) => React.ReactNode;

function CodeBlock({ lang, code, highlight }: { lang: string; code: string; highlight?: CodeHighlighter }) {
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
    <div className="my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 mix-bg-muted/80 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{lang || 'text'}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="todo-focus rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 bg-elevated overflow-x-auto leading-relaxed">
        <code className="text-[13px] font-code text-foreground leading-relaxed whitespace-pre">
          {highlight ? highlight(code, lang) : code}
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
      className="lab-ink underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-primary">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1.5 marker:text-primary marker:font-semibold">
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
  code: codeRenderer(),
};

type CodeProps = React.ComponentProps<'code'> & { node?: unknown };

function codeRenderer(highlight?: CodeHighlighter) {
  return function MdCode({ className, children }: CodeProps) {
    const lang = /language-([\w+#-]+)/.exec(className ?? '')?.[1];
    const text = String(children ?? '');
    // Block code: has a language class, or spans multiple lines (a fence without a language).
    if (lang || text.includes('\n'))
      return <CodeBlock lang={lang ?? ''} code={text.replace(/\n$/, '')} highlight={highlight} />;
    return (
      <code className="px-1.5 py-0.5 rounded mix-bg-muted/70 font-code text-[0.85em] text-foreground">
        {children}
      </code>
    );
  };
}

/** The shared map with fenced blocks highlighted; built once per highlighter (pass a module-level function). */
const highlightedComponents = new WeakMap<CodeHighlighter, Components>();
function componentsFor(highlight?: CodeHighlighter): Components {
  if (!highlight) return components;
  let map = highlightedComponents.get(highlight);
  if (!map) {
    map = { ...components, code: codeRenderer(highlight) };
    highlightedComponents.set(highlight, map);
  }
  return map;
}

function MdHeading({ size, children }: { size: string; children?: React.ReactNode }) {
  return (
    <h4
      className={`md-heading font-semibold text-foreground mt-5 mb-2 flex items-center gap-2 ${size}`}
    >
      <span className="w-1 h-4 rounded-full mix-bg-primary/60 flex-shrink-0" />
      <span>{children}</span>
    </h4>
  );
}

export default function Markdown({
  content,
  className = '',
  highlight,
}: {
  content: string;
  className?: string;
  /** Colours fenced code (Guided Practice passes a Python highlighter). Use a stable, module-level function. */
  highlight?: CodeHighlighter;
}) {
  return (
    <div className={`text-[14px] leading-7 text-foreground space-y-2 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsFor(highlight)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
