'use client';

import { todoService } from '@/lib/services/todoService';
import { toast } from '@/lib/ui/toast';

const TITLE_MAX = 120;

/** The task title: the text's first non-empty line, at most 120 characters. */
export function todoTitle(text: string): string {
  const first =
    text
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .find(Boolean) ?? '';
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1).trimEnd()}…` : first;
}

/**
 * Create a To-Do task from `text` (titled by its first line). The task's note keeps the whole text and a link back to
 * the question. Confirms with a toast whose "Open" goes to the To-Do page. Resolves to whether it worked.
 */
export async function addToTodo(
  text: string,
  questionId: number,
  open: () => void
): Promise<boolean> {
  const body = text.trim();
  const title = todoTitle(body);
  if (!title) {
    toast.info('Write or select something first.');
    return false;
  }
  const link = `${typeof window === 'undefined' ? '' : window.location.origin}/question-review?id=${questionId}`;
  const context = `${body === title ? '' : `${body}\n\n`}From question review: ${link}`;
  try {
    await todoService.createTaskStrict({ title, context, priority: 'p3', status: 'backlog' });
    toast.success('Added to To-Do', { action: { label: 'Open', onClick: open } });
    return true;
  } catch (e) {
    toast.error(`Could not add it to To-Do. ${e instanceof Error ? e.message : ''}`.trim());
    return false;
  }
}
