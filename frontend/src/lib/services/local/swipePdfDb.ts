'use client';

/**
 * swipePdfDb.ts — Dedicated IndexedDB layer for the Swipe PDF Reader.
 *
 * Database : labninja-swipe-pdf  (separate from the shared labninja-guest DB)
 * Stores   : documents | chunks | bookmarks | readingProgress
 *
 * Design goals
 * ─────────────
 * • Zero shared state with labninja-guest.  Reader data lives here only.
 * • All operations are async/Promise-based — never blocks the UI thread.
 * • putMany uses a single transaction for batch chunk writes.
 * • QuotaExceededError is caught early and re-thrown as QuotaError.
 * • One-time migration pulls data from the old reader_* stores in
 *   labninja-guest (v3/v4) into this DB on first load, then sets a flag.
 * • isIdbAvailable() gates every write — graceful degradation when IDB
 *   is unavailable (SSR, Firefox private browsing, etc.).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_NAME = 'labninja-swipe-pdf';
const DB_VERSION = 1;

type PdfStoreName = 'documents' | 'chunks' | 'bookmarks' | 'readingProgress';

// ── Connection management ─────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

export function isIdbAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (!isIdbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // ── documents ──────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }

      // ── chunks ─────────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: 'id' });
        chunks.createIndex('documentId', 'documentId', { unique: false });
        chunks.createIndex('chunkIndex', 'chunkIndex', { unique: false });
      }

      // ── bookmarks ──────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bm = db.createObjectStore('bookmarks', { keyPath: 'id' });
        bm.createIndex('documentId', 'documentId', { unique: false });
      }

      // ── readingProgress ────────────────────────────────────────────────────
      // Keyed directly by documentId — one row per document.
      if (!db.objectStoreNames.contains('readingProgress')) {
        db.createObjectStore('readingProgress', { keyPath: 'documentId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      _dbPromise = null; // allow retry on transient errors
      reject(req.error);
    };
  });

  return _dbPromise;
}

// ── Generic low-level helpers ─────────────────────────────────────────────────

async function withStore<T>(
  storeName: PdfStoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.onerror = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve(undefined as unknown as T);
    }
  });
}

async function dbGet<T>(storeName: PdfStoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

async function dbGetAll<T>(storeName: PdfStoreName): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

async function dbGetAllByIndex<T>(storeName: PdfStoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(storeName: PdfStoreName, value: T): Promise<T> {
  await withStore(storeName, 'readwrite', (s) => s.put(value));
  return value;
}

/** Writes many records in a single transaction — efficient for large chunk sets. */
async function dbPutMany<T>(storeName: PdfStoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const item of items) {
      store.put(item);
    }
  });
}

async function dbDelete(storeName: PdfStoreName, key: IDBValidKey): Promise<void> {
  await withStore(storeName, 'readwrite', (s) => s.delete(key));
}

async function dbDeleteMany(storeName: PdfStoreName, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const key of keys) {
      store.delete(key);
    }
  });
}

async function dbClear(storeName: PdfStoreName): Promise<void> {
  await withStore(storeName, 'readwrite', (s) => s.clear());
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface StoredDocument {
  id: string;
  name: string;
  type: 'pdf' | 'paste';
  sourceType: 'pdf' | 'paste';
  source: 'cloud' | 'local';
  syncStatus: 'local-only' | 'synced' | 'cached';
  totalPages?: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  extractedText: string;
  hasBlob: boolean;
  file?: Blob;
  blob?: Blob;
  fileSize?: number;
  keepOffline?: boolean;
}

export interface StoredChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunks: number;
  pageNumber?: number;
  title: string;
  content: string;
  text?: string; // alias for content; populated at write time
  keyTakeaway?: string;
  highlightTerms?: string[];
}

export interface StoredBookmark {
  id: string;
  documentId: string;
  docId: string;       // alias for documentId
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  pageNumber?: number;
  chunkTitle: string;
  chunkContent: string;
  docTitle: string;
  sourceType: 'pdf' | 'paste';
  createdAt: string;
  savedAt: string;     // alias for createdAt
}

export interface StoredProgress {
  documentId: string;  // keyPath
  docId: string;       // alias
  currentChunk: number;
  chunkIndex: number;  // alias for currentChunk
  currentPage: number;
  percentage: number;
  totalChunks: number;
  updatedAt: string;
}

/** Slim metadata for "recent documents" list (no blob, no text). */
export interface ReaderDocMeta {
  id: string;
  name: string;
  type: 'pdf' | 'paste';
  sourceType: 'pdf' | 'paste';
  source: 'cloud' | 'local';
  syncStatus: 'local-only' | 'synced' | 'cached';
  totalPages?: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  hasBlob: boolean;
  fileSize?: number;
  keepOffline?: boolean;
}

/** Quota error — thrown when the browser denies a write due to storage limits. */
export class QuotaError extends Error {
  constructor(public readonly context: string) {
    super(`Storage quota exceeded while saving ${context}. Open Storage Management to free space.`);
    this.name = 'QuotaError';
  }
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function saveDocument(
  doc: {
    id: string;
    name: string;
    type?: 'pdf' | 'paste';
    sourceType: 'pdf' | 'paste';
    totalPages?: number;
    totalChunks: number;
    extractedText: string;
    createdAt: string;
    updatedAt?: string;
    lastOpenedAt?: string;
    source?: 'cloud' | 'local';
    fileSize?: number;
    keepOffline?: boolean;
    chunks?: unknown;
  },
  blob?: Blob,
  source: 'cloud' | 'local' = 'local',
): Promise<void> {
  if (!isIdbAvailable()) return;
  const now = new Date().toISOString();
  const stored: StoredDocument = {
    id: doc.id,
    name: doc.name,
    type: doc.type || doc.sourceType || 'pdf',
    sourceType: doc.sourceType || doc.type || 'pdf',
    source: (doc.source as 'cloud' | 'local') || source,
    syncStatus: source === 'cloud' ? 'synced' : 'local-only',
    totalPages: doc.totalPages,
    totalChunks: doc.totalChunks,
    createdAt: doc.createdAt || now,
    updatedAt: (doc.updatedAt as string) || now,
    lastOpenedAt: (doc.lastOpenedAt as string) || now,
    extractedText: doc.extractedText || '',
    hasBlob: !!blob,
    blob,
    file: blob,
    fileSize: blob?.size ?? (doc.fileSize as number | undefined),
    keepOffline: (doc.keepOffline as boolean | undefined) ?? true,
  };
  try {
    await dbPut<StoredDocument>('documents', stored);
  } catch (err: unknown) {
    if ((err as DOMException)?.name === 'QuotaExceededError') throw new QuotaError('document');
    throw err;
  }
}

export async function touchLastOpened(id: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    const stored = await dbGet<StoredDocument>('documents', id);
    if (stored) {
      const now = new Date().toISOString();
      stored.lastOpenedAt = now;
      stored.updatedAt = now;
      await dbPut<StoredDocument>('documents', stored);
    }
  } catch {
    // non-fatal
  }
}

export async function getDocument(id: string): Promise<{
  id: string; name: string; type?: 'pdf' | 'paste'; sourceType: 'pdf' | 'paste';
  totalPages?: number; totalChunks: number; extractedText: string;
  createdAt: string; updatedAt?: string; lastOpenedAt?: string;
  chunks: StoredChunk[];
} | null> {
  if (!isIdbAvailable()) return null;
  try {
    const stored = await dbGet<StoredDocument>('documents', id);
    if (!stored) return null;
    const chunks = await getChunks(id);
    const docType = (stored.type || stored.sourceType) as 'pdf' | 'paste';
    return {
      id: stored.id,
      name: stored.name,
      type: docType,
      sourceType: stored.sourceType || stored.type,
      totalPages: stored.totalPages,
      totalChunks: stored.totalChunks,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      lastOpenedAt: stored.lastOpenedAt,
      extractedText: stored.extractedText,
      chunks,
    };
  } catch {
    return null;
  }
}

export async function getAllDocumentMeta(): Promise<ReaderDocMeta[]> {
  if (!isIdbAvailable()) return [];
  try {
    const rows = await dbGetAll<StoredDocument>('documents');
    return rows
      .map(({ id, name, type, sourceType, source, syncStatus, totalPages, totalChunks, createdAt, updatedAt, lastOpenedAt, hasBlob, fileSize, keepOffline }) => ({
        id,
        name,
        type: type || sourceType,
        sourceType: sourceType || type,
        source: source || 'local',
        syncStatus: syncStatus || 'local-only',
        totalPages,
        totalChunks,
        createdAt,
        updatedAt: updatedAt || createdAt,
        lastOpenedAt,
        hasBlob,
        fileSize,
        keepOffline,
      }))
      .sort((a, b) =>
        (b.lastOpenedAt || b.updatedAt || b.createdAt).localeCompare(
          a.lastOpenedAt || a.updatedAt || a.createdAt,
        ),
      );
  } catch {
    return [];
  }
}

export async function getDocumentBlob(id: string): Promise<Blob | null> {
  if (!isIdbAvailable()) return null;
  try {
    const stored = await dbGet<StoredDocument>('documents', id);
    return stored?.blob || stored?.file || null;
  } catch {
    return null;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    const [chunks, bms] = await Promise.all([getChunks(id), getBookmarks(id)]);
    await Promise.all([
      dbDelete('documents', id),
      dbDelete('readingProgress', id),
    ]);
    if (chunks.length > 0) await dbDeleteMany('chunks', chunks.map((c) => c.id));
    if (bms.length > 0) await dbDeleteMany('bookmarks', bms.map((b) => b.id));
  } catch (err) {
    console.error('[swipePdfDb] Failed to delete document:', err);
  }
}

// ── Chunks ────────────────────────────────────────────────────────────────────

export async function saveChunks(chunks: StoredChunk[]): Promise<void> {
  if (!isIdbAvailable() || chunks.length === 0) return;
  const records = chunks.map((c) => ({
    ...c,
    text: c.content || c.text || '',
    content: c.content || c.text || '',
  }));
  try {
    await dbPutMany<StoredChunk>('chunks', records);
  } catch (err: unknown) {
    if ((err as DOMException)?.name === 'QuotaExceededError') {
      console.warn('[swipePdfDb] Quota exceeded while saving chunks.');
    } else {
      console.error('[swipePdfDb] Error saving chunks:', err);
    }
  }
}

export async function getChunks(documentId: string): Promise<StoredChunk[]> {
  if (!isIdbAvailable()) return [];
  try {
    const rows = await dbGetAllByIndex<StoredChunk>('chunks', 'documentId', documentId);
    return rows
      .map((r) => ({
        ...r,
        content: r.content || r.text || '',
        text: r.text || r.content || '',
      }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  } catch {
    return [];
  }
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function saveBookmark(bm: {
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
}): Promise<StoredBookmark> {
  const documentId = bm.documentId || bm.docId || '';
  const chunkId = bm.chunkId || `${documentId}-chunk-${bm.chunkIndex}`;
  const now = new Date().toISOString();

  const newBm: StoredBookmark = {
    id: `bm-${documentId}-${bm.chunkIndex}-${Date.now()}`,
    documentId,
    docId: documentId,
    chunkId,
    chunkIndex: bm.chunkIndex,
    totalChunks: bm.totalChunks,
    pageNumber: bm.pageNumber,
    chunkTitle: bm.chunkTitle,
    chunkContent: bm.chunkContent,
    docTitle: bm.docTitle || 'Document',
    sourceType: bm.sourceType || 'pdf',
    createdAt: bm.createdAt || now,
    savedAt: bm.savedAt || now,
  };

  if (!isIdbAvailable()) return newBm;

  try {
    // Deduplicate by documentId + chunkIndex
    const existing = await getBookmarks(documentId);
    const dup = existing.find((b) => b.chunkIndex === bm.chunkIndex);
    if (dup) await dbDelete('bookmarks', dup.id);
    await dbPut<StoredBookmark>('bookmarks', newBm);
  } catch (err) {
    console.error('[swipePdfDb] Error saving bookmark:', err);
  }

  return newBm;
}

export async function getBookmarks(docId?: string): Promise<StoredBookmark[]> {
  if (!isIdbAvailable()) return [];
  try {
    let rows: StoredBookmark[];
    if (docId) {
      rows = await dbGetAllByIndex<StoredBookmark>('bookmarks', 'documentId', docId);
    } else {
      rows = await dbGetAll<StoredBookmark>('bookmarks');
    }
    return rows
      .map((r) => ({
        ...r,
        documentId: r.documentId || r.docId,
        docId: r.docId || r.documentId,
        createdAt: r.createdAt || r.savedAt,
        savedAt: r.savedAt || r.createdAt,
      }))
      .sort((a, b) => (b.createdAt || b.savedAt).localeCompare(a.createdAt || a.savedAt));
  } catch {
    return [];
  }
}

export async function removeBookmark(id: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbDelete('bookmarks', id);
  } catch (err) {
    console.error('[swipePdfDb] Error removing bookmark:', err);
  }
}

export async function isBookmarked(documentId: string, chunkIndex: number): Promise<boolean> {
  if (!isIdbAvailable()) return false;
  try {
    const bms = await getBookmarks(documentId);
    return bms.some((b) => b.chunkIndex === chunkIndex);
  } catch {
    return false;
  }
}

// ── Reading Progress ──────────────────────────────────────────────────────────

export async function saveProgress(
  documentId: string,
  currentChunk: number,
  totalChunks: number,
  currentPage = 1,
): Promise<void> {
  if (!isIdbAvailable()) return;
  const percentage = totalChunks > 0 ? Math.round(((currentChunk + 1) / totalChunks) * 100) : 0;
  const entry: StoredProgress = {
    documentId,
    docId: documentId,
    currentChunk,
    chunkIndex: currentChunk,
    currentPage,
    percentage,
    totalChunks,
    updatedAt: new Date().toISOString(),
  };
  try {
    await dbPut<StoredProgress>('readingProgress', entry);
  } catch (err) {
    console.error('[swipePdfDb] Error saving progress:', err);
  }
}

export async function getProgress(documentId: string): Promise<StoredProgress | null> {
  if (!isIdbAvailable()) return null;
  try {
    const raw = await dbGet<StoredProgress>('readingProgress', documentId);
    if (!raw) return null;
    const currentChunk = raw.currentChunk !== undefined ? raw.currentChunk : (raw.chunkIndex ?? 0);
    return {
      ...raw,
      documentId: raw.documentId || raw.docId,
      docId: raw.docId || raw.documentId,
      currentChunk,
      chunkIndex: currentChunk,
      currentPage: raw.currentPage || 1,
      percentage:
        raw.percentage !== undefined
          ? raw.percentage
          : raw.totalChunks > 0
          ? Math.round(((currentChunk + 1) / raw.totalChunks) * 100)
          : 0,
    };
  } catch {
    return null;
  }
}

export async function clearProgress(documentId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbDelete('readingProgress', documentId);
  } catch (err) {
    console.error('[swipePdfDb] Error clearing progress:', err);
  }
}

// ── Storage management ────────────────────────────────────────────────────────

export interface StorageEstimate {
  used: number;
  quota: number;
  percent: number;
  available: boolean;
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { used: 0, quota: 0, percent: 0, available: false };
  }
  try {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const quota = est.quota ?? 0;
    const percent = quota > 0 ? Math.round((used / quota) * 100) : 0;
    return { used, quota, percent, available: true };
  } catch {
    return { used: 0, quota: 0, percent: 0, available: false };
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function clearAllReaderData(): Promise<void> {
  if (!isIdbAvailable()) return;
  await Promise.all([
    dbClear('documents'),
    dbClear('chunks'),
    dbClear('bookmarks'),
    dbClear('readingProgress'),
  ]);
}

export async function estimateDocumentSize(docId: string): Promise<number> {
  if (!isIdbAvailable()) return 0;
  try {
    const [doc, chunks] = await Promise.all([
      dbGet<StoredDocument>('documents', docId),
      getChunks(docId),
    ]);
    if (!doc) return 0;
    const blobSize = doc.blob?.size || doc.file?.size || 0;
    const textSize = new Blob([doc.extractedText || '']).size;
    const chunkSize = chunks.reduce((acc, c) => acc + new Blob([c.content || c.text || '']).size, 0);
    return blobSize + textSize + chunkSize;
  } catch {
    return 0;
  }
}

// ── Cleanup policy (localStorage preference, not stored in IDB) ───────────────

export type CleanupPolicy = 'never' | '30days' | '90days';

const CLEANUP_POLICY_KEY = 'swipe-reader:cleanup-policy';

export function getCleanupPolicy(): CleanupPolicy {
  if (typeof window === 'undefined') return 'never';
  return (localStorage.getItem(CLEANUP_POLICY_KEY) as CleanupPolicy) || 'never';
}

export function setCleanupPolicy(policy: CleanupPolicy): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLEANUP_POLICY_KEY, policy);
}

export async function getSuggestedCleanupDocs(): Promise<ReaderDocMeta[]> {
  const policy = getCleanupPolicy();
  if (policy === 'never') return [];
  const docs = await getAllDocumentMeta();
  const thresholdMs = (policy === '30days' ? 30 : 90) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return docs.filter((doc) => {
    const lastSeen = doc.lastOpenedAt || doc.updatedAt || doc.createdAt;
    return now - new Date(lastSeen).getTime() > thresholdMs;
  });
}

// ── Sync extension point (stub) ───────────────────────────────────────────────

export type SyncOperationType = 'progress' | 'bookmark' | 'document_meta';

export interface SyncOperation {
  type: SyncOperationType;
  docId: string;
  payload: unknown;
  queuedAt: string;
}

/**
 * No-op stub. When server-side sync is needed:
 * 1. Add a reader_sync_queue store to this DB
 * 2. Wire a background flush via apiFetch/apiJson here
 * Components and hooks never need to change.
 */
export async function queueSync(_op: SyncOperation): Promise<void> {
  // No-op until server sync is implemented
}

// ── One-time migration: labninja-guest reader_* → labninja-swipe-pdf ──────────

const MIGRATION_FLAG_IDB = 'swipe-reader:pdf-db-migrated-v1';
const LS_PREFIX = 'swipe-reader:';

/**
 * Migrates data from two legacy sources into labninja-swipe-pdf:
 *  1. Old localStorage keys (pre-IDB era)
 *  2. The reader_* stores in the shared labninja-guest DB (v3/v4 era)
 *
 * Safe to call on every app load — checks a flag before running.
 * Non-destructive: old data remains in labninja-guest (we don't delete stores
 * there, only copy rows here).
 */
export async function migrateFromLegacySources(): Promise<void> {
  if (!isIdbAvailable() || typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_FLAG_IDB)) return;

  try {
    // ── 1. localStorage bookmarks ──────────────────────────────────────────
    const rawBms = localStorage.getItem('swipe-reader:bookmarks');
    if (rawBms) {
      const bms: unknown[] = JSON.parse(rawBms);
      for (const bm of bms as Record<string, unknown>[]) {
        const docId = (bm.docId as string) || (bm.documentId as string) || '';
        await saveBookmark({
          documentId: docId,
          docId,
          chunkId: (bm.chunkId as string) || `${docId}-chunk-${bm.chunkIndex as number}`,
          chunkIndex: bm.chunkIndex as number,
          totalChunks: (bm.totalChunks as number) || 1,
          pageNumber: bm.pageNumber as number | undefined,
          chunkTitle: (bm.chunkTitle as string) || 'Untitled Chunk',
          chunkContent: (bm.chunkContent as string) || '',
          docTitle: (bm.docTitle as string) || 'Document',
          sourceType: (bm.sourceType as 'pdf' | 'paste') || 'pdf',
        });
      }
      localStorage.removeItem('swipe-reader:bookmarks');
    }

    // ── 2. localStorage progress entries ───────────────────────────────────
    const progressKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${LS_PREFIX}progress:`)) progressKeys.push(key);
    }
    for (const key of progressKeys) {
      const docId = key.replace(`${LS_PREFIX}progress:`, '');
      const raw = localStorage.getItem(key);
      if (raw) {
        const entry = JSON.parse(raw) as {
          chunkIndex?: number; currentChunk?: number;
          totalChunks?: number; currentPage?: number;
        };
        const chunkIdx = entry.currentChunk !== undefined ? entry.currentChunk : (entry.chunkIndex ?? 0);
        await saveProgress(docId, chunkIdx, entry.totalChunks || 1, entry.currentPage || 1);
        localStorage.removeItem(key);
      }
    }

    // ── 3. Old reader_* stores in labninja-guest ───────────────────────────
    // Open labninja-guest read-only; silently skip if unavailable or old version
    try {
      await migrateFromGuestDb();
    } catch {
      // Non-fatal — guest DB may not exist or may not have reader stores
    }

    localStorage.setItem(MIGRATION_FLAG_IDB, '1');
  } catch {
    // Non-fatal — legacy data stays as fallback
  }
}

async function migrateFromGuestDb(): Promise<void> {
  const guestDb = await new Promise<IDBDatabase | null>((resolve) => {
    const req = window.indexedDB.open('labninja-guest');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // If onupgradeneeded fires it means the DB doesn't exist yet — abort
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve(null);
    };
  });
  if (!guestDb) return;

  const storeNames = Array.from(guestDb.objectStoreNames);

  // Migrate reader_documents
  if (storeNames.includes('reader_documents')) {
    try {
      const docs = await new Promise<StoredDocument[]>((res, rej) => {
        const tx = guestDb.transaction('reader_documents', 'readonly');
        const req = tx.objectStore('reader_documents').getAll();
        req.onsuccess = () => res(req.result as StoredDocument[]);
        req.onerror = () => rej(req.error);
      });
      for (const doc of docs) {
        // Only migrate if not already present in the new DB
        const existing = await dbGet<StoredDocument>('documents', doc.id);
        if (!existing) {
          await dbPut<StoredDocument>('documents', { ...doc });
        }
      }
    } catch { /* skip */ }
  }

  // Migrate reader_chunks
  if (storeNames.includes('reader_chunks')) {
    try {
      const chunks = await new Promise<StoredChunk[]>((res, rej) => {
        const tx = guestDb.transaction('reader_chunks', 'readonly');
        const req = tx.objectStore('reader_chunks').getAll();
        req.onsuccess = () => res(req.result as StoredChunk[]);
        req.onerror = () => rej(req.error);
      });
      const newChunks = await dbGetAll<StoredChunk>('chunks');
      const existingIds = new Set(newChunks.map((c) => c.id));
      const toMigrate = chunks.filter((c) => !existingIds.has(c.id));
      if (toMigrate.length > 0) await dbPutMany<StoredChunk>('chunks', toMigrate);
    } catch { /* skip */ }
  }

  // Migrate reader_bookmarks
  if (storeNames.includes('reader_bookmarks')) {
    try {
      const bms = await new Promise<StoredBookmark[]>((res, rej) => {
        const tx = guestDb.transaction('reader_bookmarks', 'readonly');
        const req = tx.objectStore('reader_bookmarks').getAll();
        req.onsuccess = () => res(req.result as StoredBookmark[]);
        req.onerror = () => rej(req.error);
      });
      const newBms = await dbGetAll<StoredBookmark>('bookmarks');
      const existingIds = new Set(newBms.map((b) => b.id));
      for (const bm of bms) {
        if (!existingIds.has(bm.id)) {
          await dbPut<StoredBookmark>('bookmarks', bm);
        }
      }
    } catch { /* skip */ }
  }

  // Migrate reader_progress
  if (storeNames.includes('reader_progress')) {
    try {
      const progEntries = await new Promise<StoredProgress[]>((res, rej) => {
        const tx = guestDb.transaction('reader_progress', 'readonly');
        const req = tx.objectStore('reader_progress').getAll();
        req.onsuccess = () => res(req.result as StoredProgress[]);
        req.onerror = () => rej(req.error);
      });
      for (const entry of progEntries) {
        const docId = entry.documentId || entry.docId;
        if (docId) {
          const existing = await dbGet<StoredProgress>('readingProgress', docId);
          if (!existing) {
            // Normalize keyPath field
            await dbPut<StoredProgress>('readingProgress', { ...entry, documentId: docId });
          }
        }
      }
    } catch { /* skip */ }
  }

  guestDb.close();
}
