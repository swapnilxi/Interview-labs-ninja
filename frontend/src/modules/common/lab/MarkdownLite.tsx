'use client';

import Markdown from '@/modules/common/lab/Markdown';

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
