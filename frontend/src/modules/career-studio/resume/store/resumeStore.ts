'use client';

/**
 * Zustand store for the resume builder's CLIENT/UI/draft state.
 *
 * Server data is fetched via careerService; this store owns the optimistic
 * working copy, the autosave lifecycle (debounced PATCH per section), and a
 * session-local undo/redo stack. Simple pages (dashboard) don't use this —
 * only the builder, where plain useState would get unwieldy.
 */

import { create } from 'zustand';
import { careerService } from '@/lib/services/careerService';
import type { Resume, ResumeSection, ResumeVersion } from '../../shared/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Module-scoped (non-serializable) timers so re-renders don't reset them.
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let savedFlashTimer: ReturnType<typeof setTimeout> | undefined;
let lastHistory = { key: '', at: 0 };

const DEBOUNCE_MS = 1500;
const HISTORY_COALESCE_MS = 700;

interface ResumeStore {
  resume: Resume | null;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  past: ResumeSection[][];
  future: ResumeSection[][];

  load: (masterId: string) => Promise<void>;
  reset: () => void;

  setTitle: (title: string) => void;
  setTemplate: (templateKey: string) => Promise<void>;
  editSection: (sectionId: string, patch: Partial<Pick<ResumeSection, 'content' | 'title' | 'is_hidden'>>) => void;
  addSection: (sectionType: string, title?: string) => Promise<void>;
  insertSectionAt: (index: number, sectionType: string, title?: string) => Promise<void>;
  duplicateSection: (sectionId: string) => Promise<void>;
  removeSection: (sectionId: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;

  snapshot: (label?: string) => Promise<ResumeVersion | null>;
  restore: (versionId: string) => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  discardPendingSaves: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const deepCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useResumeStore = create<ResumeStore>((set, get) => {
  const flashSaved = () => {
    set({ saveStatus: 'saved' });
    if (savedFlashTimer) clearTimeout(savedFlashTimer);
    savedFlashTimer = setTimeout(() => {
      if (get().saveStatus === 'saved') set({ saveStatus: 'idle' });
    }, 1600);
  };

  const pushHistory = (key: string) => {
    const now = Date.now();
    if (lastHistory.key === key && now - lastHistory.at < HISTORY_COALESCE_MS) {
      lastHistory.at = now;
      return;
    }
    lastHistory = { key, at: now };
    const { resume, past } = get();
    if (!resume) return;
    set({ past: [...past.slice(-49), deepCopy(resume.sections)], future: [] });
  };

  const scheduleSectionSave = (sectionId: string) => {
    set({ saveStatus: 'saving' });
    if (saveTimers[sectionId]) clearTimeout(saveTimers[sectionId]);
    saveTimers[sectionId] = setTimeout(async () => {
      const { resume } = get();
      const section = resume?.sections.find((s) => s.id === sectionId);
      if (!resume || !section) return;
      try {
        await careerService.updateSection(resume.id, sectionId, {
          content: section.content,
          title: section.title,
          is_hidden: section.is_hidden,
        });
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    }, DEBOUNCE_MS);
  };

  // Undo/redo only tracks operations that keep the section id set stable
  // (content/title/hidden edits and reorders). Structural changes — add,
  // duplicate, remove, restore, import-apply — change which section ids exist
  // server-side, which would make a later undo PATCH/recreate stale ids and
  // desync from the server. So those ops clear the history instead.
  const clearHistory = () => {
    lastHistory = { key: '', at: 0 };
    set({ past: [], future: [] });
  };

  // Persist the entire current section set (used after undo/redo, where many
  // sections may change at once). Small N (a resume), so a fan-out is fine.
  // Safe because history is cleared on any op that changes the id set, so the
  // ids here always still exist server-side.
  const persistAllSections = async () => {
    const { resume } = get();
    if (!resume) return;
    set({ saveStatus: 'saving' });
    try {
      await Promise.all(
        resume.sections.map((s) =>
          careerService.updateSection(resume.id, s.id, { content: s.content, title: s.title, is_hidden: s.is_hidden }),
        ),
      );
      await careerService.reorderSections(resume.id, resume.sections.map((s) => s.id));
      flashSaved();
    } catch {
      set({ saveStatus: 'error' });
    }
  };

  return {
    resume: null,
    loading: false,
    error: null,
    saveStatus: 'idle',
    past: [],
    future: [],

    async load(masterId) {
      set({ loading: true, error: null, past: [], future: [] });
      try {
        const resume = await careerService.getResume(masterId);
        set({ resume, loading: false });
      } catch (e: any) {
        set({ error: e?.message || 'Failed to load resume', loading: false });
      }
    },

    reset() {
      set({ resume: null, past: [], future: [], saveStatus: 'idle', error: null });
    },

    setTitle(title) {
      const { resume } = get();
      if (!resume) return;
      set({ resume: { ...resume, title }, saveStatus: 'saving' });
      if (saveTimers['__title__']) clearTimeout(saveTimers['__title__']);
      saveTimers['__title__'] = setTimeout(async () => {
        try {
          await careerService.updateResume(resume.id, get().resume?.title || title);
          flashSaved();
        } catch {
          set({ saveStatus: 'error' });
        }
      }, DEBOUNCE_MS);
    },

    async setTemplate(templateKey) {
      const { resume } = get();
      if (!resume) return;
      // Optimistic — the export always sends the chosen key explicitly anyway.
      set({ resume: { ...resume, template_key: templateKey } });
      try {
        await careerService.setTemplate(resume.id, templateKey);
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    editSection(sectionId, patch) {
      const { resume } = get();
      if (!resume) return;
      pushHistory(sectionId);
      set({
        resume: {
          ...resume,
          sections: resume.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
        },
      });
      scheduleSectionSave(sectionId);
    },

    async addSection(sectionType, title) {
      const { resume } = get();
      if (!resume) return;
      try {
        const section = await careerService.addSection(resume.id, sectionType, title);
        set({ resume: { ...get().resume!, sections: [...get().resume!.sections, section] } });
        clearHistory();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to add section' });
      }
    },

    // The backend only supports appending (sort_order = max+1) — inserting at
    // an arbitrary position (the "+" between two sections in the list) is
    // composed client-side: append, then reuse the existing reorder/persist
    // path to move the new section to where the user actually clicked.
    async insertSectionAt(index, sectionType, title) {
      await get().addSection(sectionType, title);
      const resume = get().resume;
      if (!resume) return;
      const ids = resume.sections.map((s) => s.id);
      const newId = ids[ids.length - 1];
      const rest = ids.slice(0, -1);
      const clamped = Math.max(0, Math.min(index, rest.length));
      rest.splice(clamped, 0, newId);
      await get().reorder(rest);
    },

    async duplicateSection(sectionId) {
      const { resume } = get();
      const src = resume?.sections.find((s) => s.id === sectionId);
      if (!resume || !src) return;
      try {
        const section = await careerService.addSection(resume.id, src.section_type, `${src.title || ''} (copy)`, src.content);
        set({ resume: { ...get().resume!, sections: [...get().resume!.sections, section] } });
        clearHistory();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to duplicate' });
      }
    },

    async removeSection(sectionId) {
      const { resume } = get();
      if (!resume) return;
      set({ resume: { ...resume, sections: resume.sections.filter((s) => s.id !== sectionId) } });
      clearHistory();
      try {
        await careerService.deleteSection(resume.id, sectionId);
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    async reorder(orderedIds) {
      const { resume } = get();
      if (!resume) return;
      pushHistory('reorder');
      const byId = new Map(resume.sections.map((s) => [s.id, s]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is ResumeSection => Boolean(s))
        .map((s, i) => ({ ...s, sort_order: i }));
      set({ resume: { ...resume, sections: reordered }, saveStatus: 'saving' });
      try {
        await careerService.reorderSections(resume.id, orderedIds);
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    async snapshot(label) {
      const { resume } = get();
      if (!resume) return null;
      try {
        const version = await careerService.snapshotVersion(resume.id, label);
        // Refresh so current_version_id reflects the new checkpoint.
        set({ resume: { ...get().resume!, current_version_id: version.id } });
        return version;
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to save version' });
        return null;
      }
    },

    async restore(versionId) {
      const { resume } = get();
      if (!resume) return;
      try {
        const restored = await careerService.restoreVersion(resume.id, versionId);
        set({ resume: restored });
        clearHistory();
        flashSaved();
      } catch (e: any) {
        set({ saveStatus: 'error', error: e?.message || 'Failed to restore' });
      }
    },

    async flushPendingSaves() {
      // Cancel every pending debounce timer so a stale timeout callback doesn't fire
      // LATER against a DIFFERENT profile's data (this store is a single global
      // instance — navigating to another profile reassigns `resume` in place).
      Object.keys(saveTimers).forEach((k) => {
        clearTimeout(saveTimers[k]);
        delete saveTimers[k];
      });
      const { resume } = get();
      if (!resume) return;
      set({ saveStatus: 'saving' });
      try {
        await Promise.all([
          careerService.updateResume(resume.id, resume.title),
          ...resume.sections.map((s) =>
            careerService.updateSection(resume.id, s.id, {
              content: s.content,
              title: s.title,
              is_hidden: s.is_hidden,
            }),
          ),
        ]);
        flashSaved();
      } catch {
        set({ saveStatus: 'error' });
      }
    },

    discardPendingSaves() {
      Object.keys(saveTimers).forEach((k) => {
        clearTimeout(saveTimers[k]);
        delete saveTimers[k];
      });
      set({ saveStatus: 'idle' });
    },

    undo() {
      const { past, future, resume } = get();
      if (!resume || past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [deepCopy(resume.sections), ...future].slice(0, 50),
        resume: { ...resume, sections: deepCopy(previous) },
      });
      void persistAllSections();
    },

    redo() {
      const { past, future, resume } = get();
      if (!resume || future.length === 0) return;
      const next = future[0];
      set({
        future: future.slice(1),
        past: [...past, deepCopy(resume.sections)].slice(-50),
        resume: { ...resume, sections: deepCopy(next) },
      });
      void persistAllSections();
    },

    canUndo() {
      return get().past.length > 0;
    },
    canRedo() {
      return get().future.length > 0;
    },
  };
});
