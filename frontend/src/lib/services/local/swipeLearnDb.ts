'use client';

/**
 * swipeLearnDb.ts — Dedicated IndexedDB layer for SwipeLearn.
 *
 * Database : labninja-swipe-learn  (fully isolated from labninja-guest and
 *            labninja-swipe-pdf)
 *
 * Stores
 * ──────
 *   cards          — All ContentCards (default seed + user-generated)
 *   savedCardIds   — Which card IDs the user has saved/bookmarked
 *   customTopics   — User-created custom topic definitions
 *   feedState      — Per-topic card index, activeSubTab, quizMode, learnMode
 *
 * Design goals
 * ─────────────
 * • Fully async — no UI blocking.
 * • putMany uses a single transaction for bulk seed/generated card writes.
 * • One-time migration from the three legacy localStorage keys
 *   (swipelearn_saved_card_ids_v3 / swipelearn_user_cards_v3 /
 *    swipelearn_custom_topics_v3) into IDB, then clears those keys.
 * • hydrateLearnState() loads all four stores in parallel for a fast boot.
 * • isIdbAvailable() gates every write — graceful degradation.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_NAME = 'labninja-swipe-learn';
const DB_VERSION = 1;

type LearnStoreName = 'cards' | 'savedCardIds' | 'customTopics' | 'feedState';

// ── Legacy localStorage keys (migration source) ───────────────────────────────

const LS_SAVED_IDS    = 'swipelearn_saved_card_ids_v3';
const LS_USER_CARDS   = 'swipelearn_user_cards_v3';
const LS_TOPICS       = 'swipelearn_custom_topics_v3';
const MIGRATION_FLAG  = 'swipelearn:idb-migrated-v1';

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

      // ── cards ──────────────────────────────────────────────────────────────
      // Stores all ContentCards (seed + generated). Indexed by topic and source
      // so we can quickly filter by feed mode without loading everything.
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('topic', 'topic', { unique: false });
        cards.createIndex('source', 'source', { unique: false });
      }

      // ── savedCardIds ───────────────────────────────────────────────────────
      // Each row: { cardId: string, savedAt: string }
      if (!db.objectStoreNames.contains('savedCardIds')) {
        db.createObjectStore('savedCardIds', { keyPath: 'cardId' });
      }

      // ── customTopics ───────────────────────────────────────────────────────
      // Each row mirrors the TopicMeta interface from types.ts
      if (!db.objectStoreNames.contains('customTopics')) {
        db.createObjectStore('customTopics', { keyPath: 'id' });
      }

      // ── feedState ──────────────────────────────────────────────────────────
      // A key-value bag; each row: { key: string, value: unknown }
      // Keys used: 'cardIndices', 'activeSubTab', 'quizMode', 'learnMode'
      if (!db.objectStoreNames.contains('feedState')) {
        db.createObjectStore('feedState', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };
  });

  return _dbPromise;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

async function withStore<T>(
  storeName: LearnStoreName,
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

async function dbGet<T>(storeName: LearnStoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

async function dbGetAll<T>(storeName: LearnStoreName): Promise<T[]> {
  return withStore<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

async function dbGetAllByIndex<T>(storeName: LearnStoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(storeName: LearnStoreName, value: T): Promise<T> {
  await withStore(storeName, 'readwrite', (s) => s.put(value));
  return value;
}

async function dbPutMany<T>(storeName: LearnStoreName, items: T[]): Promise<void> {
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

async function dbDelete(storeName: LearnStoreName, key: IDBValidKey): Promise<void> {
  await withStore(storeName, 'readwrite', (s) => s.delete(key));
}

async function dbClear(storeName: LearnStoreName): Promise<void> {
  await withStore(storeName, 'readwrite', (s) => s.clear());
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Matches ContentCard in types.ts — stored verbatim. */
export interface StoredCard {
  id: string;
  topic: string;
  source: 'seed' | 'generated';
  [key: string]: unknown; // all other ContentCard fields pass through
}

export interface StoredSavedCardId {
  cardId: string;
  savedAt: string; // ISO string
}

/** Matches TopicMeta in types.ts — stored verbatim. */
export interface StoredCustomTopic {
  id: string;
  [key: string]: unknown;
}

export interface StoredFeedStateEntry {
  key: string;
  value: unknown;
}

// ── Hydration (all stores in one shot for fast app boot) ──────────────────────

export interface HydratedLearnState {
  /** All generated/user cards from IDB (does NOT include default seed cards) */
  userCards: StoredCard[];
  /** Card IDs the user has saved, sorted newest-first */
  savedCardIds: string[];
  /** User-created custom topics */
  customTopics: StoredCustomTopic[];
  /** Card index per feed mode (Record<feedMode, number>) */
  cardIndices: Record<string, number>;
}

export async function hydrateLearnState(): Promise<HydratedLearnState> {
  if (!isIdbAvailable()) {
    return { userCards: [], savedCardIds: [], customTopics: [], cardIndices: {} };
  }
  try {
    const [allCards, savedRows, topicsRows, indicesEntry] = await Promise.all([
      dbGetAll<StoredCard>('cards'),
      dbGetAll<StoredSavedCardId>('savedCardIds'),
      dbGetAll<StoredCustomTopic>('customTopics'),
      dbGet<StoredFeedStateEntry>('feedState', 'cardIndices'),
    ]);

    // We only store generated cards (source === 'generated') in IDB to avoid
    // bloating the DB with seed cards that are already bundled in the code.
    const userCards = allCards.filter((c) => c.source === 'generated');

    const savedCardIds = savedRows
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((r) => r.cardId);

    const cardIndices = (indicesEntry?.value as Record<string, number>) ?? {};

    return { userCards, savedCardIds, customTopics: topicsRows, cardIndices };
  } catch {
    return { userCards: [], savedCardIds: [], customTopics: [], cardIndices: {} };
  }
}

// ── Cards ─────────────────────────────────────────────────────────────────────

/** Persist a single generated card (seed cards are never written to IDB). */
export async function saveCard(card: StoredCard): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbPut<StoredCard>('cards', card);
  } catch (err) {
    console.error('[swipeLearnDb] Error saving card:', err);
  }
}

/** Persist multiple generated cards in a single transaction. */
export async function saveCards(cards: StoredCard[]): Promise<void> {
  if (!isIdbAvailable() || cards.length === 0) return;
  try {
    await dbPutMany<StoredCard>('cards', cards);
  } catch (err) {
    console.error('[swipeLearnDb] Error saving cards (batch):', err);
  }
}

/** Load all generated cards for a given topic. */
export async function getCardsByTopic(topic: string): Promise<StoredCard[]> {
  if (!isIdbAvailable()) return [];
  try {
    return await dbGetAllByIndex<StoredCard>('cards', 'topic', topic);
  } catch {
    return [];
  }
}

/** Load all generated cards (all topics). */
export async function getAllCards(): Promise<StoredCard[]> {
  if (!isIdbAvailable()) return [];
  try {
    return await dbGetAll<StoredCard>('cards');
  } catch {
    return [];
  }
}

export async function deleteCard(cardId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbDelete('cards', cardId);
  } catch (err) {
    console.error('[swipeLearnDb] Error deleting card:', err);
  }
}

// ── Saved card IDs ────────────────────────────────────────────────────────────

export async function addSavedCardId(cardId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    const row: StoredSavedCardId = { cardId, savedAt: new Date().toISOString() };
    await dbPut<StoredSavedCardId>('savedCardIds', row);
  } catch (err) {
    console.error('[swipeLearnDb] Error saving card ID:', err);
  }
}

export async function removeSavedCardId(cardId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbDelete('savedCardIds', cardId);
  } catch (err) {
    console.error('[swipeLearnDb] Error removing saved card ID:', err);
  }
}

export async function getSavedCardIds(): Promise<string[]> {
  if (!isIdbAvailable()) return [];
  try {
    const rows = await dbGetAll<StoredSavedCardId>('savedCardIds');
    return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((r) => r.cardId);
  } catch {
    return [];
  }
}

// ── Custom topics ─────────────────────────────────────────────────────────────

export async function saveCustomTopic(topic: StoredCustomTopic): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbPut<StoredCustomTopic>('customTopics', topic);
  } catch (err) {
    console.error('[swipeLearnDb] Error saving custom topic:', err);
  }
}

export async function removeCustomTopic(topicId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbDelete('customTopics', topicId);
  } catch (err) {
    console.error('[swipeLearnDb] Error removing custom topic:', err);
  }
}

export async function getCustomTopics(): Promise<StoredCustomTopic[]> {
  if (!isIdbAvailable()) return [];
  try {
    return await dbGetAll<StoredCustomTopic>('customTopics');
  } catch {
    return [];
  }
}

// ── Feed state ────────────────────────────────────────────────────────────────

export async function saveFeedStateEntry(key: string, value: unknown): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    await dbPut<StoredFeedStateEntry>('feedState', { key, value });
  } catch (err) {
    console.error('[swipeLearnDb] Error saving feed state:', err);
  }
}

export async function getFeedStateEntry<T>(key: string): Promise<T | undefined> {
  if (!isIdbAvailable()) return undefined;
  try {
    const row = await dbGet<StoredFeedStateEntry>('feedState', key);
    return row?.value as T | undefined;
  } catch {
    return undefined;
  }
}

// ── Clear all SwipeLearn data ─────────────────────────────────────────────────

export async function clearAllLearnData(): Promise<void> {
  if (!isIdbAvailable()) return;
  await Promise.all([
    dbClear('cards'),
    dbClear('savedCardIds'),
    dbClear('customTopics'),
    dbClear('feedState'),
  ]);
}

// ── One-time migration: localStorage → IDB ────────────────────────────────────

/**
 * Migrates data from the three legacy localStorage keys into IDB.
 * Safe to call on every app load — checks a flag before running.
 * Cleans up localStorage keys after successful migration.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (!isIdbAvailable() || typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    // ── 1. Saved card IDs ──────────────────────────────────────────────────
    const rawIds = localStorage.getItem(LS_SAVED_IDS);
    if (rawIds) {
      const ids: string[] = JSON.parse(rawIds);
      const now = new Date().toISOString();
      const rows: StoredSavedCardId[] = ids.map((cardId) => ({ cardId, savedAt: now }));
      if (rows.length > 0) await dbPutMany<StoredSavedCardId>('savedCardIds', rows);
      localStorage.removeItem(LS_SAVED_IDS);
    }

    // ── 2. User-generated cards ────────────────────────────────────────────
    const rawCards = localStorage.getItem(LS_USER_CARDS);
    if (rawCards) {
      const cards: StoredCard[] = JSON.parse(rawCards);
      // Only migrate generated cards
      const generated = cards.filter((c) => c.source === 'generated' || !c.source);
      if (generated.length > 0) await dbPutMany<StoredCard>('cards', generated);
      localStorage.removeItem(LS_USER_CARDS);
    }

    // ── 3. Custom topics ───────────────────────────────────────────────────
    const rawTopics = localStorage.getItem(LS_TOPICS);
    if (rawTopics) {
      const topics: StoredCustomTopic[] = JSON.parse(rawTopics);
      if (topics.length > 0) await dbPutMany<StoredCustomTopic>('customTopics', topics);
      localStorage.removeItem(LS_TOPICS);
    }

    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Non-fatal — legacy data remains in localStorage as fallback
  }
}
