'use client';

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown for Assistant replies and job reports: paragraphs, lists, bold, links, small headings, code. Raw HTML in the
 * text is not rendered (react-markdown escapes it). Links open in a new tab. Styled by .agt-md (styles/assistant.css).
 */

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  img: () => null,
};

export default function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="agt-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
