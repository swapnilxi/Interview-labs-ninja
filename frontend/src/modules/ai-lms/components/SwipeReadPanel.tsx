'use client';

import React, { useMemo } from 'react';
import PdfDeckReaderView from '@/modules/swipe-pdf-reader/components/PdfDeckReaderView';
import { processDocumentChunks } from '@/modules/swipe-pdf-reader/utils/pdfProcessor';
import { extractReadableParagraphs } from '../utils/htmlToPlainText';
import type { LmsLesson } from '../types';

interface SwipeReadPanelProps {
  lesson: LmsLesson;
  onExit: () => void;
}

/** Reuses the Swipe PDF Reader's card-deck view to turn this lesson's own content
 * into swipeable micro-learning cards -- same chunking, bookmarks, and progress
 * tracking as the Swipe PDF Reader module, keyed off a per-lesson document id. */
export default function SwipeReadPanel({ lesson, onExit }: SwipeReadPanelProps) {
  const document = useMemo(() => {
    const paragraphs = extractReadableParagraphs(lesson.generated_html || '');
    const text =
      paragraphs.length > 0
        ? paragraphs.join('\n\n')
        : lesson.summary || lesson.title;
    return processDocumentChunks(`lms-lesson-${lesson.id}`, lesson.title, 'paste', [
      { pageNumber: 1, text },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, lesson.generated_html]);

  return (
    <div className="flex-1 w-full flex flex-col min-h-[620px]">
      <PdfDeckReaderView document={document} onBackToInput={onExit} />
    </div>
  );
}
