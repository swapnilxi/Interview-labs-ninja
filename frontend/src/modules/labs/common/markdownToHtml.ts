import { createElement, type ReactElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';

/**
 * Markdown, as the labs store their AI-written sections, to a static HTML fragment (for a lesson body in AI LMS).
 *
 * It renders with the same stack as the lab pages (`Markdown.tsx`: react-markdown + GFM tables), so an imported lesson
 * shows what the lab showed. Raw HTML in the source is NOT rendered: react-markdown escapes it. The renderer is loaded
 * on demand so the class page does not carry it.
 *
 * One lab convention is kept: a paragraph that is only **bold** is a section title (`**Pitfalls**`), so it becomes a
 * heading, not a bold paragraph.
 */
const components: Components = {
  p: ({ node, children }) => {
    const only = node?.children.length === 1 ? node.children[0] : null;
    if (only?.type === 'element' && only.tagName === 'strong') {
      return createElement(
        'h3',
        { className: 'sub' },
        (children as ReactElement<{ children?: ReactNode }>).props.children
      );
    }
    return createElement('p', null, children);
  },
  a: ({ href, children }) =>
    createElement('a', { href, target: '_blank', rel: 'noopener noreferrer' }, children),
  // A wide table scrolls inside its own box instead of widening the lesson.
  table: ({ children }) =>
    createElement('div', { className: 'table-wrap' }, createElement('table', null, children)),
};

export async function markdownToHtml(markdown: string): Promise<string> {
  const [{ renderToStaticMarkup }, markdownModule, gfmModule] = await Promise.all([
    import('react-dom/server'),
    import('react-markdown'),
    import('remark-gfm'),
  ]);
  const ReactMarkdown = markdownModule.default;
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [gfmModule.default], components }, markdown)
  );
}

/**
 * The AI-written sections open with a bold title line that repeats the section name ("**Core Concepts — Decorators**").
 * A lesson already has the section as its heading, so that first line is dropped when it is bold-only and names the
 * section.
 */
export function stripLeadingTitle(markdown: string, sectionLabel: string): string {
  const lines = markdown.replace(/^\s+/, '').split('\n');
  const first = lines[0]?.trim() ?? '';
  const match = /^\*\*(.+?)\*\*$/.exec(first);
  if (match && match[1].toLowerCase().includes(sectionLabel.toLowerCase())) {
    return lines.slice(1).join('\n').replace(/^\s+/, '');
  }
  return markdown;
}
