'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { DocumentChunk } from '../types';

interface PdfChunkCardItemProps {
  chunk: DocumentChunk;
  documentTitle: string;
  sourceType?: 'pdf' | 'paste';
}

export default function PdfChunkCardItem({
  chunk,
  documentTitle,
  sourceType = 'pdf',
}: PdfChunkCardItemProps) {
  return (
    <div className="w-full h-full flex flex-col bg-card border border-border rounded-3xl shadow-xl overflow-hidden select-none relative">
      {/* Header Banner */}
      <div className="px-5 pt-4 pb-3 border-b border-border/60 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Icon name={sourceType === 'pdf' ? 'DocumentIcon' : 'ClipboardDocumentTextIcon'} size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-foreground truncate max-w-[180px]" title={documentTitle}>
              {documentTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <span>Chunk {chunk.chunkIndex} / {chunk.totalChunks}</span>
              {sourceType === 'pdf' && chunk.pageNumber && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">Page {chunk.pageNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress pill & indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold">
          <span>{Math.round((chunk.chunkIndex / chunk.totalChunks) * 100)}%</span>
          <span className="text-[10px] text-muted-foreground font-normal">progress</span>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 p-5 overflow-y-auto scrollbar-clean flex flex-col justify-between space-y-4">
        <div>
          {/* Card Title */}
          <h3 className="font-heading text-lg font-bold text-foreground mb-3 leading-snug">
            {chunk.title}
          </h3>

          {/* Paragraph Content */}
          <p className="text-sm text-foreground/90 leading-relaxed space-y-2 whitespace-pre-wrap">
            {chunk.content}
          </p>
        </div>

        {/* Key Takeaway Box */}
        {chunk.keyTakeaway && (
          <div className="p-3.5 rounded-2xl bg-muted/50 border border-border/80 mt-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
              <Icon name="LightBulbIcon" size={14} />
              <span>Key Takeaway</span>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed font-medium">
              {chunk.keyTakeaway}
            </p>
          </div>
        )}

        {/* Highlight terms pills */}
        {chunk.highlightTerms && chunk.highlightTerms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chunk.highlightTerms.map((term, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px] font-medium"
              >
                #{term}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Swipe hints footer */}
      <div className="px-5 py-2.5 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground font-medium">
        <span className="flex items-center gap-1.5">
          <Icon name="ArrowLeftIcon" size={13} className="text-muted-foreground/70" /> Swipe left for prev
        </span>
        <span className="flex items-center gap-1.5">
          Swipe right for next <Icon name="ArrowRightIcon" size={13} className="text-muted-foreground/70" />
        </span>
      </div>
    </div>
  );
}
