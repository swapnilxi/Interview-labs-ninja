'use client';

/**
 * useSwipeLearnStorage — React hook adapter for the SwipeLearn storage layer.
 *
 * Delegates all persistence to swipeLearnDb.ts (labninja-swipe-learn IDB).
 * Falls back gracefully when IDB is unavailable.
 *
 * Usage in SwipeLearnModule:
 *   const learnStorage = useSwipeLearnStorage();
 *   // On mount → learnStorage.hydrate() loads all state from IDB
 *   // On save  → learnStorage.saveCard(card)
 *   // On save  → learnStorage.addSavedId(id)
 *   // ...etc.
 */

import { useCallback, useEffect, useRef } from 'react';
import * as db from '@/lib/services/local/swipeLearnDb';
import type { HydratedLearnState, StoredCard, StoredCustomTopic } from '@/lib/services/local/swipeLearnDb';

export type { HydratedLearnState, StoredCard, StoredCustomTopic };

export interface SwipeLearnStorageApi {
  /** Load all SwipeLearn state from IDB in one parallel shot. */
  hydrate(): Promise<HydratedLearnState>;

  // Cards
  saveCard(card: StoredCard): void;
  deleteCard(cardId: string): void;

  // Saved card IDs
  addSavedId(cardId: string): void;
  removeSavedId(cardId: string): void;

  // Custom topics
  saveCustomTopic(topic: StoredCustomTopic): void;
  removeCustomTopic(topicId: string): void;

  // Feed state (card index per mode)
  saveCardIndices(indices: Record<string, number>): void;

  // Nuclear clear
  clearAll(): Promise<void>;
}

export function useSwipeLearnStorage(): SwipeLearnStorageApi {
  const migratedRef = useRef(false);

  // Run localStorage → IDB migration once on mount
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    db.migrateFromLocalStorage().catch(() => {/* non-fatal */});
  }, []);

  const hydrate = useCallback((): Promise<HydratedLearnState> => {
    return db.hydrateLearnState();
  }, []);

  const saveCard = useCallback((card: StoredCard): void => {
    db.saveCard(card).catch(() => {});
  }, []);

  const deleteCard = useCallback((cardId: string): void => {
    db.deleteCard(cardId).catch(() => {});
  }, []);

  const addSavedId = useCallback((cardId: string): void => {
    db.addSavedCardId(cardId).catch(() => {});
  }, []);

  const removeSavedId = useCallback((cardId: string): void => {
    db.removeSavedCardId(cardId).catch(() => {});
  }, []);

  const saveCustomTopic = useCallback((topic: StoredCustomTopic): void => {
    db.saveCustomTopic(topic).catch(() => {});
  }, []);

  const removeCustomTopic = useCallback((topicId: string): void => {
    db.removeCustomTopic(topicId).catch(() => {});
  }, []);

  const saveCardIndices = useCallback((indices: Record<string, number>): void => {
    db.saveFeedStateEntry('cardIndices', indices).catch(() => {});
  }, []);

  const clearAll = useCallback((): Promise<void> => {
    return db.clearAllLearnData();
  }, []);

  return {
    hydrate,
    saveCard,
    deleteCard,
    addSavedId,
    removeSavedId,
    saveCustomTopic,
    removeCustomTopic,
    saveCardIndices,
    clearAll,
  };
}
