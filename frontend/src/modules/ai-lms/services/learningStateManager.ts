'use client';

import { useState, useEffect, useCallback } from 'react';
import { lmsService } from './lmsService';
import type { ContinueLearningItem, LmsLesson, LmsNavigation } from '../types';

const STORAGE_KEY_RECENT = 'lms_recent_learning_items';
const STORAGE_KEY_COMPLETED = 'lms_completed_lesson_ids';
const EVENT_NAME = 'lms-learning-progress-changed';

export interface ActiveLessonParams {
  lesson: LmsLesson;
  navigation?: LmsNavigation | null;
  classSlug: string;
  className?: string;
  subjectSlug?: string;
  subjectName?: string;
}

/**
 * Helper to get completed lesson IDs from localStorage
 */
export function getStoredCompletedLessonIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COMPLETED);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Record a lesson view in both local state and backend
 */
export function recordLessonActivity({
  lesson,
  navigation,
  classSlug,
  className,
  subjectSlug,
  subjectName,
}: ActiveLessonParams): void {
  if (typeof window === 'undefined') return;

  try {
    const completedIds = getStoredCompletedLessonIds();
    const isCompleted = completedIds.has(lesson.id);

    const nextInfo = navigation?.next
      ? {
          id: navigation.next.id,
          title: navigation.next.title,
          slug: navigation.next.slug,
        }
      : null;

    const newItem: ContinueLearningItem = {
      lesson_id: lesson.id,
      lesson_title: lesson.title,
      lesson_slug: lesson.slug,
      class_id: lesson.class_id,
      class_name: className || lesson.class_name || classSlug,
      class_slug: classSlug || lesson.class_slug,
      subject_id: lesson.subject_id || null,
      subject_name: subjectName || lesson.subject_name || null,
      subject_slug: subjectSlug || lesson.subject_slug || null,
      current_index: navigation?.current_index ?? 1,
      total_lessons: navigation?.total_lessons ?? 1,
      completed: isCompleted,
      next_lesson: nextInfo,
      read_time_minutes: lesson.read_time_minutes || 5,
      last_viewed_at: new Date().toISOString(),
    };

    // Update recent items list in localStorage (up to 6 items)
    const rawRecent = localStorage.getItem(STORAGE_KEY_RECENT);
    const existingList: ContinueLearningItem[] = rawRecent ? JSON.parse(rawRecent) : [];
    const filtered = existingList.filter((item) => item.lesson_id !== lesson.id);
    const updatedList = [newItem, ...filtered].slice(0, 6);
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updatedList));

    // Notify all app listeners
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: newItem }));

    // Send to server
    lmsService.recordLessonView(lesson.id).catch(() => {});
  } catch (err) {
    console.error('Failed to record lesson activity', err);
  }
}

/**
 * Mark a lesson as completed / in-progress
 */
export function toggleLessonCompletion(
  lessonId: string,
  completed: boolean
): void {
  if (typeof window === 'undefined') return;

  try {
    const completedIds = getStoredCompletedLessonIds();
    if (completed) {
      completedIds.add(lessonId);
    } else {
      completedIds.delete(lessonId);
    }
    localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(Array.from(completedIds)));

    // Update in recent items
    const rawRecent = localStorage.getItem(STORAGE_KEY_RECENT);
    if (rawRecent) {
      const list: ContinueLearningItem[] = JSON.parse(rawRecent);
      const updated = list.map((item) =>
        item.lesson_id === lessonId ? { ...item, completed } : item
      );
      localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));
    }

    // Broadcast event
    window.dispatchEvent(new CustomEvent(EVENT_NAME));

    // Call backend
    lmsService.markLessonComplete(lessonId, completed).catch(() => {});
  } catch (err) {
    console.error('Failed to toggle completion', err);
  }
}

/**
 * React hook to synchronize learning progress across the entire app
 */
export function useLearningProgress() {
  const [continueItem, setContinueItem] = useState<ContinueLearningItem | null>(null);
  const [recentItems, setRecentItems] = useState<ContinueLearningItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(async () => {
    // 1. First read immediate local state
    if (typeof window !== 'undefined') {
      try {
        const rawRecent = localStorage.getItem(STORAGE_KEY_RECENT);
        if (rawRecent) {
          const list: ContinueLearningItem[] = JSON.parse(rawRecent);
          if (list.length > 0) {
            const completedIds = getStoredCompletedLessonIds();
            const syncedList = list.map((item) => ({
              ...item,
              completed: completedIds.has(item.lesson_id) || Boolean(item.completed),
            }));
            setContinueItem(syncedList[0]);
            setRecentItems(syncedList);
          }
        }
      } catch {
        // Continue to server fetch
      }
    }

    // 2. Fetch server authentic continue item and recent items
    try {
      const [serverItem, serverRecent] = await Promise.all([
        lmsService.getContinueLearning().catch(() => null),
        lmsService.getRecentLessons().catch(() => []),
      ]);

      if (serverItem) {
        const completedIds = getStoredCompletedLessonIds();
        const mergedItem: ContinueLearningItem = {
          ...serverItem,
          completed: completedIds.has(serverItem.lesson_id) || Boolean(serverItem.completed),
        };

        setContinueItem((prev) => {
          // If local has a more recent lesson, keep it or merge
          if (prev && prev.last_viewed_at && serverItem.last_viewed_at) {
            const localTime = new Date(prev.last_viewed_at).getTime();
            const serverTime = new Date(serverItem.last_viewed_at).getTime();
            if (localTime > serverTime) return prev;
          }
          return mergedItem;
        });
      }

      if (serverRecent && serverRecent.length > 0) {
        setRecentItems((prev) => {
          if (prev.length > 0) {
            // Merge unique lessons
            const map = new Map<string, ContinueLearningItem>();
            prev.forEach((item) => map.set(item.lesson_id, item));
            serverRecent.forEach((item) => {
              if (!map.has(item.lesson_id)) map.set(item.lesson_id, item);
            });
            return Array.from(map.values()).slice(0, 6);
          }
          return serverRecent;
        });
      }
    } catch (err) {
      console.error('Failed to load continue learning progress', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();

    const handleUpdate = () => {
      refreshState();
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [refreshState]);

  const selectActiveTrack = (item: ContinueLearningItem) => {
    setContinueItem(item);
  };

  const markComplete = (lessonId: string, completed = true) => {
    toggleLessonCompletion(lessonId, completed);
  };

  return {
    continueItem,
    recentItems,
    loading,
    selectActiveTrack,
    markComplete,
    refreshState,
  };
}
