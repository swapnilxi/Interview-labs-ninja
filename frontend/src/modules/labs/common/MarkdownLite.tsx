'use client';

import Markdown from '@/modules/labs/common/Markdown';

/** Kept for existing imports (labs, GenerateQuestionsPanel); renders full markdown via `Markdown`. */
export default function MarkdownLite({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return <Markdown content={content} className={className} />;
}
