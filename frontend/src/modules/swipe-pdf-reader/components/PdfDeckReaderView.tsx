'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { PdfDocument, DocumentChunk } from '../types';
import PdfChunkCardItem from './PdfChunkCardItem';
import { useReaderStorage, Bookmark } from '../utils/useReaderStorage';
import ChunkSearchPanel from './ChunkSearchPanel';

interface PdfDeckReaderViewProps {
  document: PdfDocument;
  onBackToInput: () => void;
}

export default function PdfDeckReaderView({
  document,
  onBackToInput,
}: PdfDeckReaderViewProps) {
  const storage = useReaderStorage();
  const chunks = document.chunks;

  // ── Core state ─────────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [resumeBanner, setResumeBanner] = useState<{ chunkIndex: number } | null>(null);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [bookmarkedFlash, setBookmarkedFlash] = useState(false);
  const [sharedFlash, setSharedFlash] = useState(false);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showJumpInput, setShowJumpInput] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  const currentChunk: DocumentChunk | undefined = chunks[currentIndex];
  const nextChunk: DocumentChunk | undefined = chunks[currentIndex + 1];
  const isFinished = currentIndex >= chunks.length;
  const progressPct = Math.round((Math.min(currentIndex + 1, chunks.length) / chunks.length) * 100);

  const hasInitializedRef = useRef(false);

  // ── On mount: load saved progress & bookmarks (async from IndexedDB) ────────────
  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      const [saved, bms] = await Promise.all([
        storage.getProgressAsync(document.id),
        storage.getBookmarksAsync(document.id),
      ]);
      if (cancelled) return;
      if (saved && saved.chunkIndex > 0 && saved.chunkIndex < chunks.length) {
        setCurrentIndex(saved.chunkIndex);
        setResumeBanner({ chunkIndex: saved.chunkIndex });
      }
      setBookmarks(bms);
      hasInitializedRef.current = true;
    }
    loadState();
    return () => { cancelled = true; };
  }, [document.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save progress on chunk change ────────────────────────────────────
  useEffect(() => {
    if (!hasInitializedRef.current) return;
    if (!isFinished && currentIndex >= 0) {
      const currentPage = chunks[currentIndex]?.pageNumber || 1;
      storage.saveProgress(document.id, currentIndex, chunks.length, currentPage);
    }
  }, [currentIndex, document.id, chunks, isFinished, storage]);

  // ── Reset card animation state when switching chunks ─────────────────────
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
    setExitDirection(null);
  }, [currentIndex]);

  // ── Focus jump input when shown ───────────────────────────────────────────
  useEffect(() => {
    if (showJumpInput) {
      setTimeout(() => jumpInputRef.current?.focus(), 50);
    }
  }, [showJumpInput]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goToIndex = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, chunks.length - 1));
    setCurrentIndex(clamped);
  }, [chunks.length]);

  const handleNext = useCallback(() => {
    if (currentIndex < chunks.length - 1) {
      setExitDirection('right');
      setTimeout(() => setCurrentIndex((p) => p + 1), 200);
    } else if (currentIndex === chunks.length - 1) {
      setExitDirection('right');
      setTimeout(() => setCurrentIndex(chunks.length), 200);
    }
  }, [currentIndex, chunks.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setExitDirection('left');
      setTimeout(() => setCurrentIndex((p) => p - 1), 200);
    }
  }, [currentIndex]);

  // ── Jump navigation ───────────────────────────────────────────────────────
  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpValue, 10);
    if (!isNaN(num) && num >= 1 && num <= chunks.length) {
      goToIndex(num - 1);
    }
    setShowJumpInput(false);
    setJumpValue('');
  };

  // ── Card actions ──────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!currentChunk) return;
    try {
      await navigator.clipboard.writeText(currentChunk.content);
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 2000);
    } catch {
      // Clipboard denied — no-op
    }
  }, [currentChunk]);

  const handleBookmark = useCallback(async () => {
    if (!currentChunk) return;
    await storage.saveBookmarkAsync({
      documentId: document.id,
      docId: document.id,
      chunkId: currentChunk.id,
      docTitle: document.name,
      sourceType: document.sourceType,
      chunkIndex: currentChunk.chunkIndex,
      totalChunks: currentChunk.totalChunks,
      pageNumber: currentChunk.pageNumber,
      chunkTitle: currentChunk.title,
      chunkContent: currentChunk.content.slice(0, 220),
    });
    // Refresh bookmarks list from IDB to stay in sync
    const updated = await storage.getBookmarksAsync(document.id);
    setBookmarks(updated);
    setBookmarkedFlash(true);
    setTimeout(() => setBookmarkedFlash(false), 2000);
  }, [currentChunk, document.id, document.name, document.sourceType, storage]);

  const handleShare = useCallback(async () => {
    if (!currentChunk || !navigator.share) return;
    try {
      await navigator.share({
        title: currentChunk.title,
        text: currentChunk.content,
      });
      setSharedFlash(true);
      setTimeout(() => setSharedFlash(false), 2000);
    } catch {
      // share cancelled or unsupported
    }
  }, [currentChunk]);

  const handleRemoveBookmark = async (id: string) => {
    storage.removeBookmark(id);
    // Refresh from IDB
    const updated = await storage.getBookmarksAsync(document.id);
    setBookmarks(updated);
  };

  const handleJumpToBookmark = (bm: Bookmark) => {
    goToIndex(bm.chunkIndex - 1);
    setShowBookmarksPanel(false);
  };

  // ── Swipe gestures ────────────────────────────────────────────────────────
  // Guard: don't swipe when any overlay panel is open
  const panelOpen = showBookmarksPanel || showSearchPanel;

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isFinished || panelOpen) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startPosRef.current = { x: clientX, y: clientY };
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || isFinished || panelOpen) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: clientX - startPosRef.current.x,
      y: clientY - startPosRef.current.y,
    });
  };

  const handleTouchEnd = () => {
    if (!isDragging || isFinished || panelOpen) return;
    setIsDragging(false);
    const threshold = 70;
    if (dragOffset.x > threshold) {
      handleNext();
    } else if (dragOffset.x < -threshold) {
      if (currentIndex > 0) handlePrev();
      else setDragOffset({ x: 0, y: 0 });
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Don't intercept when search panel open (it handles its own keys)
      if (showSearchPanel) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); handleNext(); break;
        case 'ArrowLeft':  e.preventDefault(); handlePrev(); break;
        case 'ArrowUp':    e.preventDefault(); handleBookmark(); break;
        case 'c':
        case 'C':          e.preventDefault(); handleCopy(); break;
        case 's':
        case 'S':          e.preventDefault(); setShowSearchPanel(true); break;
        case 'Escape':
          setShowBookmarksPanel(false);
          setShowJumpInput(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNext, handlePrev, handleBookmark, handleCopy, showSearchPanel]);

  // ── Current doc bookmarks & bookmark check ────────────────────────────────
  const docBookmarks = bookmarks.filter((b) => b.docId === document.id);
  // isCurrentBookmarked derived from in-memory bookmarks state (already async-loaded)
  const isCurrentBookmarked = currentChunk
    ? docBookmarks.some(b => b.chunkIndex === currentChunk.chunkIndex)
    : false;

  const hasShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="w-full max-w-lg mx-auto px-3 sm:px-4 py-2 sm:py-3 flex flex-col items-center min-h-[calc(100vh-64px)] sm:min-h-[calc(100vh-80px)] justify-between relative">

      {/* ── Search Panel ─────────────────────────────────────────────────── */}
      {showSearchPanel && (
        <ChunkSearchPanel
          document={document}
          onJumpToChunk={(idx) => { goToIndex(idx); }}
          onClose={() => setShowSearchPanel(false)}
        />
      )}

      {/* ── Resume Banner ─────────────────────────────────────────────────── */}
      {resumeBanner && (
        <div className="fixed top-[60px] left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-3 animate-slideInUp">
          <div className="flex items-center gap-3 bg-card border border-blue-500/30 shadow-xl rounded-2xl px-4 py-3">
            <Icon name="ClockIcon" size={16} className="text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Resumed at Chunk {resumeBanner.chunkIndex + 1}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Loaded saved position from local storage
              </p>
            </div>
            <button
              type="button"
              onClick={() => { goToIndex(0); setResumeBanner(null); }}
              className="px-2.5 py-1 rounded-lg border border-border text-foreground text-xs font-medium hover:bg-muted transition-all"
            >
              Start Over
            </button>
            <button
              type="button"
              onClick={() => setResumeBanner(null)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-all"
            >
              <Icon name="XMarkIcon" size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ───────────────────────────────────────────── */}
      {copiedFlash && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg animate-fadeIn flex items-center gap-1.5">
          <Icon name="CheckIcon" size={14} /> Copied!
        </div>
      )}
      {bookmarkedFlash && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-full shadow-lg animate-fadeIn flex items-center gap-1.5">
          <Icon name="BookmarkIcon" size={14} /> Bookmarked!
        </div>
      )}
      {sharedFlash && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-full shadow-lg animate-fadeIn flex items-center gap-1.5">
          <Icon name="ShareIcon" size={14} /> Shared!
        </div>
      )}

      {/* ── Bookmarks Panel (slide-in overlay) ───────────────────────────── */}
      {showBookmarksPanel && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowBookmarksPanel(false)}
          />
          {/* Panel */}
          <div className="w-full max-w-xs bg-card border-l border-border flex flex-col shadow-2xl animate-slideInRight overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="BookmarkIcon" size={18} className="text-blue-500" />
                <h3 className="text-sm font-bold text-foreground">Bookmarks</h3>
                {docBookmarks.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                    {docBookmarks.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowBookmarksPanel(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {docBookmarks.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Icon name="BookmarkIcon" size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">No bookmarks yet.</p>
                  <p className="text-[11px] mt-1">Press ↑ or the bookmark icon to save a chunk.</p>
                </div>
              ) : (
                docBookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="group relative p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-all cursor-pointer"
                    onClick={() => handleJumpToBookmark(bm)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            Chunk {bm.chunkIndex}
                          </span>
                          {bm.pageNumber && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              · Page {bm.pageNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-foreground truncate">{bm.chunkTitle}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {bm.chunkContent}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(bm.id); }}
                        className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove bookmark"
                      >
                        <Icon name="TrashIcon" size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {docBookmarks.length > 0 && (
              <div className="px-3 py-2 border-t border-border shrink-0">
                <p className="text-[10px] text-muted-foreground text-center">
                  Click a bookmark to jump to that chunk
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <div className="w-full flex items-center justify-between gap-2 py-2 border-b border-border/60">
        <button
          type="button"
          onClick={onBackToInput}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <Icon name="ArrowLeftIcon" size={15} />
          <span className="hidden sm:inline">Back</span>
        </button>

        {/* Center: doc title + chunk/page info (clickable to jump) */}
        <div className="text-center min-w-0 flex-1 px-1">
          <h2 className="text-xs font-bold text-foreground truncate">{document.name}</h2>
          {showJumpInput ? (
            <form onSubmit={handleJumpSubmit} className="flex items-center justify-center gap-1 mt-0.5">
              <input
                ref={jumpInputRef}
                type="number"
                min={1}
                max={chunks.length}
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
                placeholder={`1–${chunks.length}`}
                className="w-20 text-center text-xs px-2 py-0.5 rounded-lg border border-blue-500/50 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button type="submit" className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                Go
              </button>
              <button type="button" onClick={() => setShowJumpInput(false)} className="text-[10px] text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowJumpInput(true)}
              className="flex items-center justify-center gap-1.5 mt-0.5 mx-auto hover:opacity-80 transition-opacity"
              title="Click to jump to a chunk"
            >
              <span className="text-[10px] text-muted-foreground font-semibold">
                {isFinished ? 'Finished' : `Chunk ${currentIndex + 1} / ${chunks.length}`}
              </span>
              {currentChunk?.pageNumber && !isFinished && (
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 rounded">
                  Page {currentChunk.pageNumber}
                </span>
              )}
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {isFinished ? '100%' : `${progressPct}%`}
              </span>
            </button>
          )}
        </div>

        {/* Right: search + bookmarks + prev/next */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowSearchPanel(true)}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-all"
            title="Search chunks (S)"
          >
            <Icon name="MagnifyingGlassIcon" size={15} />
          </button>
          <button
            type="button"
            onClick={() => setShowBookmarksPanel(true)}
            className={`p-2 rounded-xl border transition-all ${
              docBookmarks.length > 0
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
            title="Bookmarks"
          >
            <Icon name="BookmarkIcon" size={15} />
          </button>
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
            title="Previous (←)"
          >
            <Icon name="ChevronLeftIcon" size={15} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isFinished}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
            title="Next (→)"
          >
            <Icon name="ChevronRightIcon" size={15} />
          </button>
        </div>
      </div>

      {/* ── Overall Progress Bar ──────────────────────────────────────────── */}
      <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden -mt-1 mb-1">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${isFinished ? 100 : progressPct}%` }}
        />
      </div>

      {/* ── Main Deck ─────────────────────────────────────────────────────── */}
      <div className="w-full flex-1 flex items-center justify-center my-2 sm:my-3 relative min-h-[360px] sm:min-h-[440px]">
        {isFinished ? (
          /* Finished Screen */
          <div className="w-full p-8 rounded-3xl bg-card border border-border shadow-xl text-center space-y-5 animate-fadeIn">
            <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/10">
              <Icon name="SparklesIcon" size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground font-heading">Reading Complete! 🎉</h3>
              <p className="text-xs text-muted-foreground mt-1">
                You swiped through all {chunks.length} chunks of &quot;{document.name}&quot;.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-around">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Chunks</span>
                <p className="text-lg font-bold text-foreground">{chunks.length}</p>
              </div>
              {document.totalPages && (
                <>
                  <div className="h-8 w-px bg-border/80" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Pages</span>
                    <p className="text-lg font-bold text-blue-500">{document.totalPages}</p>
                  </div>
                </>
              )}
              {docBookmarks.length > 0 && (
                <>
                  <div className="h-8 w-px bg-border/80" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Bookmarks</span>
                    <p className="text-lg font-bold text-amber-500">{docBookmarks.length}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCurrentIndex(0)}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-md shadow-blue-500/20"
              >
                Re-read Document
              </button>
              {docBookmarks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBookmarksPanel(true)}
                  className="w-full py-2.5 px-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-500/15 transition-all"
                >
                  Review {docBookmarks.length} Saved Bookmarks
                </button>
              )}
              <button
                type="button"
                onClick={onBackToInput}
                className="w-full py-2.5 px-4 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-all"
              >
                Upload Different Document
              </button>
            </div>
          </div>
        ) : (
          /* Card Stack */
          <div className="w-full h-full max-w-sm sm:max-w-md relative flex items-center justify-center">
            {/* Background preview card */}
            {nextChunk && (
              <div className="absolute inset-0 transform scale-95 translate-y-3 opacity-55 pointer-events-none transition-all">
                <PdfChunkCardItem
                  chunk={nextChunk}
                  documentTitle={document.name}
                  sourceType={document.sourceType}
                />
              </div>
            )}

            {/* Front interactive card */}
            {currentChunk && (
              <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseMove={handleTouchMove}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                style={{
                  transform: exitDirection
                    ? `translateX(${exitDirection === 'right' ? 500 : -500}px) rotate(${exitDirection === 'right' ? 15 : -15}deg)`
                    : `translateX(${dragOffset.x}px) translateY(${dragOffset.y * 0.15}px) rotate(${dragOffset.x * 0.04}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.22s ease-out',
                }}
                className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing touch-none z-10"
              >
                <PdfChunkCardItem
                  chunk={currentChunk}
                  documentTitle={document.name}
                  sourceType={document.sourceType}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Card Actions Toolbar ──────────────────────────────────────────── */}
      {!isFinished && currentChunk && (
        <div className="w-full flex items-center justify-center gap-2 pb-2">
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy text (C)"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all shadow-sm active:scale-95 ${
              copiedFlash
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Icon name={copiedFlash ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={15} />
            <span className="hidden sm:inline">{copiedFlash ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Prev chunk */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            title="Previous chunk (←)"
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-35 transition-all shadow-sm active:scale-95"
          >
            <Icon name="ArrowLeftIcon" size={15} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Next chunk */}
          <button
            type="button"
            onClick={handleNext}
            title="Next chunk (→)"
            className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <span className="hidden sm:inline">Next</span>
            <Icon name="ArrowRightIcon" size={15} />
          </button>

          {/* Bookmark */}
          <button
            type="button"
            onClick={handleBookmark}
            title="Bookmark chunk (↑)"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition-all shadow-sm active:scale-95 ${
              isCurrentBookmarked || bookmarkedFlash
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-border bg-card text-muted-foreground hover:text-blue-500 hover:border-blue-500/30'
            }`}
          >
            <Icon name="BookmarkIcon" size={15} />
            <span className="hidden sm:inline">{isCurrentBookmarked ? 'Saved' : 'Save'}</span>
          </button>

          {/* Share (only if navigator.share available) */}
          {hasShare && (
            <button
              type="button"
              onClick={handleShare}
              title="Share chunk"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all shadow-sm active:scale-95"
            >
              <Icon name="ShareIcon" size={15} />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
        </div>
      )}

      {/* ── Keyboard hint (desktop only) ─────────────────────────────────── */}
      <div className="hidden sm:flex items-center gap-3 pb-1 text-[10px] text-muted-foreground/50 font-medium">
        <span>← → navigate</span>
        <span>↑ bookmark</span>
        <span>C copy</span>
        <span>S search</span>
      </div>
    </div>
  );
}
