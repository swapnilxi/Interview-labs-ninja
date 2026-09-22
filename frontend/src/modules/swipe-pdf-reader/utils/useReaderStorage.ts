'use client';

/**
 * useReaderStorage — React hook adapter for the Swipe PDF Reader storage layer.
 *
 * PUBLIC API IS IDENTICAL to the previous version.
 * All components (PdfDeckReaderView, SwipePdfReaderModule) call this hook
 * without knowing about the storage backend.
 *
 * Implementation: delegates all persistence to readerDb.ts → swipePdfDb.ts
 * (labninja-swipe-pdf IndexedDB).
 * Falls back gracefully if IndexedDB is unavailable (SSR, private browsing).
 *
 * Migration: triggers a one-time migration of legacy localStorage data and
 * old labninja-guest reader_* store data into labninja-swipe-pdf on first use.
 */

import { useCallback, useEffect, useRef } from 'react';
import * as readerDb from './readerDb';
import type {
  CleanupPolicy,
  ReaderDocMeta,
  StorageEstimate,
} from './readerDb';
import type { PdfDocument } from '../types';

// ── Re-export types that consumers import from this file ──────────────────────
export type { CleanupPolicy, ReaderDocMeta, StorageEstimate };

// Bookmark / ProgressEntry kept as named exports for backward compat
export type Bookmark = readerDb.Bookmark;
export type ProgressEntry = readerDb.ProgressEntry;
export type BookmarkInput = readerDb.BookmarkInput;
export { QuotaError } from './readerDb';

// ── Legacy type alias kept for backward compat ────────────────────────────────
/** @deprecated Use ReaderDocMeta from readerDb instead */
export type RecentDoc = ReaderDocMeta;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useReaderStorage() {
  // Run legacy migration once on mount
  useEffect(() => {
    readerDb.migrateFromLocalStorage().catch(() => {/* non-fatal */});
  }, []);

  // ── Progress ───────────────────────────────────────────────────────────────

  const saveProgress = useCallback(
    (docId: string, chunkIndex: number, totalChunks: number, currentPage?: number): void => {
      readerDb.saveProgress(docId, chunkIndex, totalChunks, currentPage).catch(() => {});
    },
    [],
  );

  const getProgressAsync = useCallback(
    (docId: string): Promise<ProgressEntry | null> => readerDb.getProgress(docId),
    [],
  );

  /** @deprecated Prefer getProgressAsync */
  const getProgress = useCallback(
    (_docId: string): ProgressEntry | null => null,
    [],
  );

  const clearProgress = useCallback((docId: string): void => {
    readerDb.clearProgress(docId).catch(() => {});
  }, []);

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  /** Sync shim — returns [] immediately; use getBookmarksAsync for real data */
  const getBookmarks = useCallback((): Bookmark[] => [], []);

  const getBookmarksAsync = useCallback(
    (docId?: string): Promise<Bookmark[]> => readerDb.getBookmarks(docId),
    [],
  );

  const saveBookmark = useCallback(
    (bookmark: BookmarkInput): Bookmark => {
      // Optimistic: return immediately, persist in background
      const docId = bookmark.docId || bookmark.documentId || '';
      const now = new Date().toISOString();
      const optimistic: Bookmark = {
        id: `bm-${docId}-${bookmark.chunkIndex}-${Date.now()}`,
        documentId: docId,
        docId,
        chunkId: bookmark.chunkId || `${docId}-chunk-${bookmark.chunkIndex}`,
        chunkIndex: bookmark.chunkIndex,
        totalChunks: bookmark.totalChunks,
        pageNumber: bookmark.pageNumber,
        chunkTitle: bookmark.chunkTitle,
        chunkContent: bookmark.chunkContent,
        docTitle: bookmark.docTitle || 'Document',
        sourceType: bookmark.sourceType || 'pdf',
        createdAt: bookmark.createdAt || now,
        savedAt: bookmark.savedAt || now,
      };
      readerDb.saveBookmark(bookmark).catch(() => {});
      return optimistic;
    },
    [],
  );

  const saveBookmarkAsync = useCallback(
    (bookmark: BookmarkInput): Promise<Bookmark> => readerDb.saveBookmark(bookmark),
    [],
  );

  const removeBookmark = useCallback((bookmarkId: string): void => {
    readerDb.removeBookmark(bookmarkId).catch(() => {});
  }, []);

  /** Sync shim — always returns false; use isBookmarkedAsync for real data */
  const isBookmarked = useCallback(
    (_docId: string, _chunkIndex: number): boolean => false,
    [],
  );

  const isBookmarkedAsync = useCallback(
    (docId: string, chunkIndex: number): Promise<boolean> =>
      readerDb.isBookmarked(docId, chunkIndex),
    [],
  );

  // ── Documents ──────────────────────────────────────────────────────────────

  /** Save document metadata only (backward compat). */
  const saveRecentDoc = useCallback((doc: PdfDocument): void => {
    readerDb.saveDocument(doc).catch(() => {});
  }, []);

  /**
   * Save a document AND its chunks.
   * Call this after processing a PDF/paste to persist everything needed to
   * re-open without re-uploading.
   */
  const saveFullDocument = useCallback(
    (
      doc: PdfDocument,
      blob?: Blob,
      source: 'cloud' | 'local' = 'local',
    ): void => {
      // Map DocumentChunk[] to the StoredChunk shape (add text alias)
      const mappedChunks = doc.chunks.map((c) => ({
        ...c,
        text: c.content || c.text || '',
        content: c.content || c.text || '',
      }));
      readerDb
        .saveDocument(doc, blob, source)
        .then(() => readerDb.saveChunks(mappedChunks))
        .catch(() => {});
    },
    [],
  );

  /** @deprecated Use getRecentDocsAsync */
  const getRecentDocs = useCallback((): RecentDoc[] => [], []);

  const getRecentDocsAsync = useCallback(
    (): Promise<ReaderDocMeta[]> => readerDb.getAllDocumentMeta(),
    [],
  );

  const getFullDocumentAsync = useCallback(
    (docId: string) => readerDb.getDocument(docId),
    [],
  );

  const deleteDocument = useCallback(
    (docId: string): Promise<void> => readerDb.deleteDocument(docId),
    [],
  );

  return {
    // Progress
    saveProgress,
    getProgress,
    getProgressAsync,
    clearProgress,

    // Bookmarks
    getBookmarks,
    getBookmarksAsync,
    saveBookmark,
    saveBookmarkAsync,
    removeBookmark,
    isBookmarked,
    isBookmarkedAsync,

    // Documents
    saveRecentDoc,
    saveFullDocument,
    getRecentDocs,
    getRecentDocsAsync,
    getFullDocumentAsync,
    deleteDocument,

    // Storage management (pass-through)
    getStorageEstimate: readerDb.getStorageEstimate,
    requestPersistentStorage: readerDb.requestPersistentStorage,
    isPersisted: readerDb.isPersisted,
    clearAllReaderData: readerDb.clearAllReaderData,
    estimateDocumentSize: readerDb.estimateDocumentSize,
    getCleanupPolicy: readerDb.getCleanupPolicy,
    setCleanupPolicy: readerDb.setCleanupPolicy,
    getSuggestedCleanupDocs: readerDb.getSuggestedCleanupDocs,
  };
}
