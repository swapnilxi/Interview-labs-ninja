'use client';

/**
 * Minimal IndexedDB wrapper for guest-mode data (tasks/projects/quick-tasks).
 *
 * IndexedDB (not localStorage) because this is multi-entity, tree-structured,
 * frequently-updated data — localStorage's single-blob-per-write model and
 * ~5MB ceiling don't fit; IndexedDB gives real per-row writes and indexes.
 *
 * NOTE: The reader_* stores (previously added in v3/v4) have been moved to
 * the dedicated `labninja-swipe-pdf` database (swipePdfDb.ts).  They are no
 * longer created here on new installs.  Existing installs keep the old stores
 * harmlessly; swipePdfDb.ts migrates any data from them on first load.
 */

const DB_NAME = 'labninja-guest';
const DB_VERSION = 4;

export type StoreName =
  | 'tasks'
  | 'task_notes'
  | 'inbox'
  | 'daily_plans'
  | 'quick_tasks'
  | 'projects'
  | 'project_nodes'
  | 'goal_nodes'
  | 'meta';

const STORE_INDEXES: Partial<Record<StoreName, string[]>> = {
  tasks: ['parent_id'],
  task_notes: ['task_id'],
  quick_tasks: ['date'],
  project_nodes: ['project_id', 'parent_node_id'],
  goal_nodes: ['parent_id'],
};

/** Stores that use a non-'id' keyPath. */
const CUSTOM_KEYPATH: Partial<Record<StoreName, string>> = {
  meta: 'key',
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const stores: StoreName[] = [
        'tasks', 'task_notes', 'inbox', 'daily_plans', 'quick_tasks', 'projects', 'project_nodes', 'goal_nodes', 'meta',
        // reader_* stores removed — they now live in labninja-swipe-pdf (swipePdfDb.ts)
      ];
      for (const name of stores) {
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(name)) {
          const keyPath = CUSTOM_KEYPATH[name] ?? 'id';
          store = db.createObjectStore(name, { keyPath });
        } else if (tx) {
          store = tx.objectStore(name);
        } else {
          continue;
        }
        for (const idx of STORE_INDEXES[name] || []) {
          if (!store.indexNames.contains(idx)) {
            store.createIndex(idx, idx, { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null; // allow retry on transient error
      reject(req.error);
    };
  });
  return dbPromise;
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.onerror = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve(undefined as unknown as T);
    }
  });
}

/** Mints a fresh incrementing numeric id, shared across all guest entities (mirrors server autoincrement ids being plain numbers). */
export async function nextId(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const getReq = store.get('id_counter');
    getReq.onsuccess = () => {
      const current = (getReq.result?.value as number | undefined) ?? 0;
      const next = current + 1;
      store.put({ key: 'id_counter', value: next });
      tx.oncomplete = () => resolve(next);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  return withStore(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>);
}

export async function getAllByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const idx = tx.objectStore(storeName).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function get<T>(storeName: StoreName, id: IDBValidKey): Promise<T | undefined> {
  return withStore(storeName, 'readonly', (store) => store.get(id) as IDBRequest<T | undefined>);
}

export async function put<T>(storeName: StoreName, value: T): Promise<T> {
  await withStore(storeName, 'readwrite', (store) => store.put(value));
  return value;
}

export async function putMany<T>(storeName: StoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const item of items) {
      store.put(item);
    }
  });
}

export async function remove(storeName: StoreName, id: IDBValidKey): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.delete(id));
}

export async function removeMany(storeName: StoreName, ids: IDBValidKey[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const id of ids) {
      store.delete(id);
    }
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.clear());
}

export async function clearAllGuestData(): Promise<void> {
  const stores: StoreName[] = ['tasks', 'task_notes', 'inbox', 'daily_plans', 'quick_tasks', 'projects', 'project_nodes', 'goal_nodes'];
  for (const s of stores) await clearStore(s);
}

export async function hasAnyGuestData(): Promise<boolean> {
  const stores: StoreName[] = ['tasks', 'projects', 'quick_tasks', 'inbox', 'goal_nodes'];
  for (const s of stores) {
    const rows = await getAll(s);
    if (rows.length > 0) return true;
  }
  return false;
}
