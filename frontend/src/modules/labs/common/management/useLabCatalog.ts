'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  addGroup,
  deleteGroup,
  deleteTopic,
  fetchGroups,
  fetchTopics,
  saveTopic,
} from './labCatalogApi';
import type { LabGroupRow, LabManagementConfig, ManagedTopic } from './types';

/**
 * A lab's topics and patterns, and the changes a person can make to them. One hook for every lab's management page; what a
 * lab cannot do is simply not called (the panels check `config.can`).
 *
 * Every change is sent first and shown after it worked, so the screen never shows something that was not saved; a failure
 * lands in `error` with the server's wording.
 */
export function useLabCatalog<T extends ManagedTopic = ManagedTopic>(config: LabManagementConfig) {
  const { isAdmin } = useAuth();
  const { apiBase, fallbackTopics } = config;
  const [topics, setTopics] = useState<T[]>([]);
  const [groups, setGroups] = useState<LabGroupRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, g] = await Promise.allSettled([fetchTopics<T>(apiBase), fetchGroups(apiBase)]);
    setTopics(
      t.status === 'fulfilled' && t.value.length ? t.value : ((fallbackTopics ?? []) as T[])
    );
    if (g.status === 'fulfilled') setGroups(g.value);
    setReady(true);
  }, [apiBase, fallbackTopics]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one change; true when it worked. */
  const run = useCallback(async (change: () => Promise<void>): Promise<boolean> => {
    setError(null);
    try {
      await change();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
  }, []);

  const patterns = Array.from(
    new Set([...groups.map((g) => g.name), ...topics.map((t) => t.category)])
  );
  const customPatterns = groups.filter((g) => g.isCustom).map((g) => g.name);

  return {
    ready,
    topics,
    patterns,
    customPatterns,
    isAdmin,
    error,
    clearError: () => setError(null),
    reload: load,
    topicById: (id: string | null | undefined) => topics.find((t) => t.id === id) ?? null,
    /** A custom topic can be removed by its owner, or by an admin (see backend delete_dsa_topic). */
    canRemove: (t: T) => config.can.remove && Boolean(t.isCustom) && (!t.isShared || isAdmin),

    moveTopic: (topic: T, category: string) =>
      run(async () => {
        await saveTopic(apiBase, { ...topic, category });
        setTopics((prev) =>
          prev.map((t) =>
            t.id === topic.id ? { ...t, category, isModified: t.isShared ? true : t.isModified } : t
          )
        );
      }),
    shareTopic: (topic: T) =>
      run(async () => {
        await saveTopic(apiBase, topic, true);
        setTopics((prev) =>
          prev.map((t) => (t.id === topic.id ? { ...t, isShared: true, isModified: false } : t))
        );
      }),
    removeTopic: (topic: T) =>
      run(async () => {
        await deleteTopic(apiBase, topic.id);
        setTopics((prev) => prev.filter((t) => t.id !== topic.id));
      }),
    /** Drops the person's own version of a shared topic. */
    resetTopic: (topic: T) =>
      run(async () => {
        await deleteTopic(apiBase, topic.id);
        await load();
      }),
    addGroup: (name: string) =>
      run(async () => {
        await addGroup(apiBase, name);
        setGroups((prev) =>
          prev.some((g) => g.name === name) ? prev : [...prev, { name, isCustom: true }]
        );
      }),
    removeGroup: (name: string) =>
      run(async () => {
        await deleteGroup(apiBase, name);
        setGroups((prev) => prev.filter((g) => g.name !== name));
      }),
  };
}

export type LabCatalog<T extends ManagedTopic = ManagedTopic> = ReturnType<typeof useLabCatalog<T>>;
