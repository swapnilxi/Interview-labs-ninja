'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { PdfDocument, DocumentChunk } from '../types';

interface ChunkSearchResult {
  chunk: DocumentChunk;
  matchSnippet: string; // excerpt showing the match in context
  matchCount: number;
}

interface ChunkSearchPanelProps {
  document: PdfDocument;
  onJumpToChunk: (index: number) => void;
  onClose: () => void;
}

function highlightMatch(text: string, query: string): string {
  // Returns plain excerpt of ~120 chars around first match
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  const start = Math.max(0, idx - 45);
  const end = Math.min(text.length, idx + query.length + 75);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function countMatches(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let pos = 0;
  const lower = text.toLowerCase();
  const lowerQ = query.toLowerCase();
  while ((pos = lower.indexOf(lowerQ, pos)) !== -1) {
    count++;
    pos += lowerQ.length;
  }
  return count;
}

export default function ChunkSearchPanel({
  document,
  onJumpToChunk,
  onClose,
}: ChunkSearchPanelProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo<ChunkSearchResult[]>(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const lowerQ = q.toLowerCase();
    return document.chunks
      .filter((chunk) => {
        const haystack = (chunk.title + ' ' + chunk.content + ' ' + (chunk.keyTakeaway ?? '')).toLowerCase();
        return haystack.includes(lowerQ);
      })
      .map((chunk) => ({
        chunk,
        matchSnippet: highlightMatch(chunk.content, q),
        matchCount: countMatches(chunk.title + ' ' + chunk.content, q),
      }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 30);
  }, [query, document.chunks]);

  const queryTrimmed = query.trim();
  const isEmpty = queryTrimmed.length >= 2 && results.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 px-3 pb-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideInUp max-h-[80vh]">

        {/* Header / Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Icon name="MagnifyingGlassIcon" size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chunks, keywords, topics…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="XMarkIcon" size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            title="Close (Esc)"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Status bar */}
        {queryTrimmed.length >= 2 && (
          <div className="px-4 py-1.5 border-b border-border/50 bg-muted/20 shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground">
              {isEmpty
                ? `No results for "${queryTrimmed}"`
                : `${results.length} chunk${results.length === 1 ? '' : 's'} matching "${queryTrimmed}"`}
            </p>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto scrollbar-clean">
          {queryTrimmed.length < 2 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Icon name="MagnifyingGlassIcon" size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs font-medium">Type at least 2 characters to search</p>
              <p className="text-[11px] mt-1 text-muted-foreground/70">Searches titles, content, and key takeaways</p>
            </div>
          ) : isEmpty ? (
            <div className="text-center py-10 text-muted-foreground">
              <Icon name="DocumentMagnifyingGlassIcon" size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs font-medium">No matching chunks found</p>
              <p className="text-[11px] mt-1 text-muted-foreground/70">Try different keywords</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {results.map(({ chunk, matchSnippet, matchCount }) => (
                <button
                  key={chunk.id}
                  type="button"
                  onClick={() => {
                    onJumpToChunk(chunk.chunkIndex - 1);
                    onClose();
                  }}
                  className="w-full text-left group p-3 rounded-xl border border-transparent hover:border-blue-500/20 hover:bg-blue-500/5 transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Chunk {chunk.chunkIndex}
                      </span>
                      {chunk.pageNumber && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
                          Page {chunk.pageNumber}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                        {chunk.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed" style={{ wordBreak: 'break-word' }}>
                        {matchSnippet}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                      <span>{matchCount}×</span>
                      <Icon name="ChevronRightIcon" size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/50 bg-muted/20 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px] font-mono">Esc</kbd> to close
          </p>
          <p className="text-[10px] text-muted-foreground">{document.totalChunks} chunks in document</p>
        </div>
      </div>
    </div>
  );
}
