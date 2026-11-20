'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/http/apiClient';

export interface Snippet {
  id: number;
  shared: boolean;
  title: string;
  language: string;
  code: string;
  order_index: number;
  created_at: string;
}

interface State {
  snippets: Snippet[];
  loading: boolean;
  error: string | null;
}

export function useSnippets(
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  enabled: boolean
) {
  const [state, setState] = useState<State>({ snippets: [], loading: false, error: null });
  const loaded = useRef(false);
  const key = `${lab}|${topicId}|${subtopicId}|${sectionId}`;

  useEffect(() => {
    if (!enabled) return;
    loaded.current = false;
    setState({ snippets: [], loading: true, error: null });
    const params = new URLSearchParams({ lab, topic_id: topicId, subtopic_id: subtopicId, section_id: sectionId });
    apiFetch(`/lab-sections/snippets?${params}`)
      .then((res) => res.json())
      .then((data: { snippets: Snippet[] }) => {
        loaded.current = true;
        setState({ snippets: data.snippets ?? [], loading: false, error: null });
      })
      .catch((err: unknown) => {
        setState({ snippets: [], loading: false, error: String((err as { message?: string })?.message ?? err) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const add = useCallback(
    async (title: string, language: string, code: string, shared = false): Promise<void> => {
      const res = await apiFetch('/lab-sections/snippets', {
        method: 'POST',
        body: JSON.stringify({ lab, topic_id: topicId, subtopic_id: subtopicId, section_id: sectionId, title, language, code, shared }),
      });
      const data: Snippet = await res.json();
      setState((s) => ({ ...s, snippets: [...s.snippets, data] }));
    },
    [lab, topicId, subtopicId, sectionId]
  );

  const remove = useCallback(async (snippetId: number): Promise<void> => {
    await apiFetch(`/lab-sections/snippets/${snippetId}`, { method: 'DELETE' });
    setState((s) => ({ ...s, snippets: s.snippets.filter((x) => x.id !== snippetId) }));
  }, []);

  const update = useCallback(
    async (snippetId: number, fields: { title?: string; language?: string; code?: string }): Promise<void> => {
      const res = await apiFetch(`/lab-sections/snippets/${snippetId}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      const data: Snippet = await res.json();
      setState((s) => ({ ...s, snippets: s.snippets.map((x) => (x.id === snippetId ? data : x)) }));
    },
    []
  );

  return { ...state, add, remove, update };
}
