'use client';

/**
 * readerDb.ts — Public API for the Swipe PDF Reader storage layer.
 *
 * All reads/writes are delegated to swipePdfDb.ts which owns the dedicated
 * `labninja-swipe-pdf` IndexedDB.  This file is kept as the public surface
 * so that existing imports in components and hooks do not need to change.
 *
 * Backward-compatible type aliases are preserved so that existing consumers
 * (PdfDeckReaderView, useReaderStorage, StorageManagerPanel, …) compile
 * without modification.
 */

// ── Re-export the entire public API from the dedicated DB module ───────────────
export {
  isIdbAvailable,
  saveDocument,
  touchLastOpened,
  getDocument,
  getAllDocumentMeta,
  getDocumentBlob,
  deleteDocument,
  saveChunks,
  getChunks,
  saveBookmark,
  getBookmarks,
  removeBookmark,
  isBookmarked,
  saveProgress,
  getProgress,
  clearProgress,
  getStorageEstimate,
  requestPersistentStorage,
  isPersisted,
  clearAllReaderData,
  estimateDocumentSize,
  getCleanupPolicy,
  setCleanupPolicy,
  getSuggestedCleanupDocs,
  queueSync,
  QuotaError,
} from '@/lib/services/local/swipePdfDb';

export type {
  ReaderDocMeta,
  StoredDocument,
  StoredChunk,
  StoredBookmark,
  StoredProgress,
  StorageEstimate,
  CleanupPolicy,
  SyncOperation,
  SyncOperationType,
} from '@/lib/services/local/swipePdfDb';

// ── Backward-compatible type aliases ─────────────────────────────────────────

import type { StoredBookmark, StoredProgress } from '@/lib/services/local/swipePdfDb';

/** @deprecated Use StoredBookmark from swipePdfDb */
export type Bookmark = StoredBookmark;

/** @deprecated Use StoredProgress from swipePdfDb */
export type ProgressEntry = StoredProgress;

// BookmarkInput kept for backward compat with useReaderStorage
export type BookmarkInput = {
  documentId?: string;
  docId?: string;
  chunkId?: string;
  chunkIndex: number;
  totalChunks: number;
  pageNumber?: number;
  chunkTitle: string;
  chunkContent: string;
  docTitle?: string;
  sourceType?: 'pdf' | 'paste';
  createdAt?: string;
  savedAt?: string;
};

// ── Migration entry point ─────────────────────────────────────────────────────

export { migrateFromLegacySources as migrateFromLocalStorage } from '@/lib/services/local/swipePdfDb';
