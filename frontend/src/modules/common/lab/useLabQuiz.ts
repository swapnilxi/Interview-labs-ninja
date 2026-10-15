'use client';

import { useEffect, useRef, useState } from 'react';
import {
  fetchSavedQuiz,
  generateQuiz,
  type LabName,
  type LabPage,
  type QuizQuestion,
} from '@/lib/services/labSectionsService';

interface QuizState {
  key: string;
  questions: QuizQuestion[];
  generating: boolean;
  /** Set only when the first batch fails — a failed "generate more" is reported to the caller instead. */
  error: string | null;
}

const empty = (key: string): QuizState => ({ key, questions: [], generating: false, error: null });

/**
 * AI quiz for a lab topic page: questions about the topic and the concepts around it, saved
 * server-side, with `generate` appending another batch each time it is called. Saved questions are
 * loaded back whenever the topic/subtopic changes.
 *
 * The context fields (`category`, `prerequisites`, `relatedTopics`) are read when generating, so they
 * can be built inline on every render.
 */
export function useLabQuiz({
  lab,
  topic,
  subtopic,
  category,
  prerequisites,
  relatedTopics,
}: {
  lab: LabName;
  topic: LabPage | null;
  subtopic: LabPage | null;
  category: string;
  prerequisites: string[];
  relatedTopics: string[];
}) {
  const topicId = topic?.id ?? '';
  const subtopicId = subtopic?.id ?? '';
  const key = topicId ? `${topicId}|${subtopicId}` : '';

  // State is stored with the page it belongs to so the first render after navigating can't show the
  // previous page's questions.
  const [store, setStore] = useState<QuizState>(() => empty(key));
  const view = store.key === key ? store : empty(key);
  const inFlightKey = useRef<string | null>(null);

  useEffect(() => {
    setStore(empty(key));
    if (!topicId) return;
    let cancelled = false;
    fetchSavedQuiz(lab, topicId, subtopicId)
      .then((saved) => {
        if (cancelled || saved.length === 0) return;
        setStore((prev) =>
          prev.key !== key || prev.questions.length > 0 ? prev : { ...prev, questions: saved }
        );
      })
      // Saved questions are an extra: if they can't be loaded the Generate button still works.
      .catch((e) => console.error('lab quiz:', e));
    return () => {
      cancelled = true;
    };
  }, [lab, key, topicId, subtopicId]);

  /** Appends a batch. Rejects with a readable message if generation fails. */
  const generate = async () => {
    if (!topic || inFlightKey.current === key) return;
    const forKey = key;
    inFlightKey.current = forKey;
    setStore((prev) => (prev.key !== forKey ? prev : { ...prev, generating: true, error: null }));
    try {
      const added = await generateQuiz({
        lab,
        topic,
        subtopic,
        category,
        prerequisites,
        relatedTopics,
      });
      setStore((prev) =>
        prev.key !== forKey
          ? prev
          : { ...prev, generating: false, questions: [...prev.questions, ...added] }
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Quiz generation failed. Try again.';
      setStore((prev) =>
        prev.key !== forKey
          ? prev
          : { ...prev, generating: false, error: prev.questions.length === 0 ? message : null }
      );
      throw e;
    } finally {
      inFlightKey.current = null;
    }
  };

  /** For the section's Generate button, which has nowhere to surface a rejection (the error lands in state). */
  const generateFirst = () => {
    generate().catch(() => {});
  };

  return {
    questions: view.questions,
    generating: view.generating,
    error: view.error,
    generate,
    generateFirst,
  };
}
