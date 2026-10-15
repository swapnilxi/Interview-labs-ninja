'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSavedSections,
  generateSectionWithContext,
  type ContextMode,
  type LabName,
  type LabPage,
} from '@/lib/services/labSectionsService';

export interface SectionState {
  generated: boolean;
  generating: boolean;
  content: string;
  /** The learner context this content was generated from (only set for context-driven content). */
  context: string;
  /** Why the last Generate failed (AI-written sections only); cleared on the next attempt. */
  error: string | null;
}

interface SectionDef {
  id: string;
  label: string;
  subtitle?: string;
  /** Standing instructions for the AI when it writes this section (structure, depth). */
  guidance?: string;
  /** The plain Generate button asks the AI instead of filling in the lab's template. */
  aiGenerated?: boolean;
}

/**
 * On-demand section state shared by the DSA, CV and System Design labs.
 *
 * - `generate` is the plain Generate button: the lab's built-in template, or, for sections marked
 *   `aiGenerated`, an AI-written section (saved server-side like the context flow).
 * - `generateWithContext` is the pen flow: AI output from the learner's context, saved server-side.
 * - On every topic/subtopic change the sections reset, then anything previously saved for that page
 *   is loaded back in as already generated.
 */
export function useLabSections({
  lab,
  topic,
  subtopic,
  sectionDefs,
  getDefaultContent,
}: {
  lab: LabName;
  topic: LabPage | null;
  subtopic: LabPage | null;
  sectionDefs: readonly SectionDef[];
  getDefaultContent: (sectionId: string) => string;
}) {
  const topicId = topic?.id ?? '';
  const subtopicId = subtopic?.id ?? '';
  const key = topicId ? `${topicId}|${subtopicId}` : '';

  const initSections = useCallback(
    (): Record<string, SectionState> =>
      Object.fromEntries(
        sectionDefs.map((d) => [
          d.id,
          { generated: false, generating: false, content: '', context: '', error: null },
        ])
      ),
    [sectionDefs]
  );

  // Sections are stored with the page they belong to, so the first render after navigating can't
  // briefly show the previous page's content.
  const [store, setStore] = useState(() => ({ key, sections: initSections() }));
  const sections = store.key === key ? store.sections : initSections();

  const defaultRef = useRef(getDefaultContent);
  defaultRef.current = getDefaultContent;

  const patch = useCallback((forKey: string, sectionId: string, change: Partial<SectionState>) => {
    setStore((prev) =>
      prev.key !== forKey
        ? prev
        : {
            ...prev,
            sections: { ...prev.sections, [sectionId]: { ...prev.sections[sectionId], ...change } },
          }
    );
  }, []);

  useEffect(() => {
    setStore({ key, sections: initSections() });
    if (!topicId) return;
    let cancelled = false;
    fetchSavedSections(lab, topicId, subtopicId)
      .then((saved) => {
        if (cancelled) return;
        setStore((prev) => {
          if (prev.key !== key) return prev;
          const next = { ...prev.sections };
          for (const [id, s] of Object.entries(saved)) {
            if (next[id] && !next[id].generating) {
              next[id] = {
                generated: true,
                generating: false,
                content: s.content,
                context: s.context,
                error: null,
              };
            }
          }
          return { ...prev, sections: next };
        });
      })
      // Saved content is an extra: if it can't be loaded, the default Generate flow still works.
      .catch((e) => console.error('lab sections:', e));
    return () => {
      cancelled = true;
    };
  }, [lab, key, topicId, subtopicId, initSections]);

  const generate = (sectionId: string) => {
    if (!topic) return;
    const forKey = key;
    const def = sectionDefs.find((d) => d.id === sectionId);
    if (def?.aiGenerated) {
      patch(forKey, sectionId, { generating: true, error: null });
      generateSectionWithContext({
        lab,
        topic,
        subtopic,
        section: def,
        mode: 'generate',
        context: '',
        existingContent: '',
      })
        .then((saved) =>
          patch(forKey, sectionId, {
            generated: true,
            generating: false,
            content: saved.content,
            context: saved.context,
          })
        )
        .catch((e) =>
          patch(forKey, sectionId, {
            generating: false,
            error: e instanceof Error ? e.message : 'Generation failed. Try again.',
          })
        );
      return;
    }
    const content = defaultRef.current(sectionId);
    patch(forKey, sectionId, { generating: true });
    setTimeout(
      () => patch(forKey, sectionId, { generated: true, generating: false, content }),
      900 + Math.random() * 700
    );
  };

  /** Rejects with a readable message on failure; the section keeps its previous content. */
  const generateWithContext = async (sectionId: string, context: string, mode: ContextMode) => {
    const def = sectionDefs.find((d) => d.id === sectionId);
    if (!topic || !def) return;
    const forKey = key;
    patch(forKey, sectionId, { generating: true, error: null });
    try {
      const saved = await generateSectionWithContext({
        lab,
        topic,
        subtopic,
        section: def,
        mode,
        context,
        existingContent: sections[sectionId]?.content ?? '',
      });
      patch(forKey, sectionId, {
        generated: true,
        generating: false,
        content: saved.content,
        context: saved.context,
      });
    } catch (e) {
      patch(forKey, sectionId, { generating: false });
      throw e;
    }
  };

  return { sections, generate, generateWithContext };
}
