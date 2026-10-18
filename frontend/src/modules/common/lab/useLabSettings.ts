'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getToken, onAuthChange } from '@/lib/auth/tokenStore';
import {
  fetchLabSettings,
  LAB_WIDE_SECTION,
  resetLabSettings,
  saveLabSettings,
  type LabName,
  type SectionSettings,
} from '@/lib/services/labSectionsService';

/**
 * "Lab settings" for the labs (DSA, CV, System Design), one shared store per lab.
 *
 * A user can change how each section is written: replace its built-in prompt, append an add-on,
 * and give it standing context; the lab-wide row ('*') adds an add-on and context to every section.
 * The generators (`useLabSections`, `useLabQuiz`), the settings dialog and the "Custom" badges all
 * read this one store, so a save shows up everywhere at once.
 *
 * What counts as "customised" matters: a section the user changed (or any section, once the
 * lab-wide add-on/context is set) is written by the AI when its Generate button is pressed, using
 * the effective prompt below; a section left alone keeps its built-in text and needs no AI key.
 */

const EMPTY_VALUES: SectionSettings = { prompt: '', addon: '', context: '' };

interface Snapshot {
  loaded: boolean;
  byId: ReadonlyMap<string, SectionSettings>;
}
interface LabStore {
  snap: Snapshot;
  listeners: Set<() => void>;
  forToken: string | null | undefined;
}

const EMPTY: Snapshot = { loaded: false, byId: new Map() };
const stores = new Map<LabName, LabStore>();

function storeFor(lab: LabName): LabStore {
  let s = stores.get(lab);
  if (!s) {
    s = { snap: EMPTY, listeners: new Set(), forToken: undefined };
    stores.set(lab, s);
  }
  return s;
}

function setSnap(store: LabStore, next: Snapshot) {
  store.snap = next;
  store.listeners.forEach((l) => l());
}

function ensureLoaded(lab: LabName) {
  const store = storeFor(lab);
  const token = getToken();
  if (store.forToken === token) return;
  store.forToken = token;
  setSnap(store, EMPTY);
  if (!token) return;
  fetchLabSettings(lab)
    .then((all) => {
      if (store.forToken !== token) return;
      setSnap(store, { loaded: true, byId: new Map(Object.entries(all)) });
    })
    .catch((e) => {
      console.error('lab settings:', e);
      if (store.forToken !== token) return;
      store.forToken = undefined; // the next mount tries again
      setSnap(store, { loaded: true, byId: store.snap.byId });
    });
}

onAuthChange(() => stores.forEach((_, lab) => ensureLoaded(lab)));

const isEmpty = (v: SectionSettings) => !(v.prompt.trim() || v.addon.trim() || v.context.trim());

/**
 * What a generator is told for one section: the user's own prompt in place of the built-in one (if
 * they wrote one), then the lab-wide and section add-ons; plus the lab-wide and section context.
 * Used for real generations and for the live preview in the settings dialog, so the two agree.
 */
export function composeInstructions(
  defaultGuidance: string,
  section: SectionSettings,
  labWide: SectionSettings
): { guidance: string; standingContext: string } {
  const base = (section.prompt.trim() || defaultGuidance).trim();
  const addons = [labWide.addon.trim(), section.addon.trim()].filter(Boolean);
  const guidance = addons.length
    ? `${base}${base ? '\n\n' : ''}Additional instructions from the learner:\n${addons.join('\n')}`
    : base;
  const standingContext = [labWide.context.trim(), section.context.trim()]
    .filter(Boolean)
    .join('\n\n');
  return { guidance, standingContext };
}

export function useLabSettings(lab: LabName) {
  const snap = useSyncExternalStore(
    (cb) => {
      const store = storeFor(lab);
      store.listeners.add(cb);
      return () => {
        store.listeners.delete(cb);
      };
    },
    () => storeFor(lab).snap,
    () => EMPTY
  );
  useEffect(() => ensureLoaded(lab), [lab]);

  return useMemo(() => {
    const get = (sectionId: string): SectionSettings => snap.byId.get(sectionId) ?? EMPTY_VALUES;
    const labWide = get(LAB_WIDE_SECTION);
    const labWideActive = !!(labWide.addon.trim() || labWide.context.trim());

    /** The section itself has settings (a "Custom" badge). */
    const isCustomised = (sectionId: string) => !isEmpty(get(sectionId));
    /** Pressing Generate on this section asks the AI (the section, or the whole lab, is customised). */
    const usesAi = (sectionId: string) => isCustomised(sectionId) || labWideActive;

    /** What the generator is told for a section, given the saved settings (see composeInstructions). */
    const effective = (sectionId: string, defaultGuidance: string) =>
      composeInstructions(defaultGuidance, get(sectionId), labWide);

    return {
      loaded: snap.loaded,
      get,
      labWide,
      /** Anything customised anywhere in the lab (the dot on the gear). */
      hasAny: snap.byId.size > 0,
      isCustomised,
      usesAi,
      effective,
      /** Removes every customisation of the lab; rejects with a readable message and changes nothing. */
      resetAll: async () => {
        const store = storeFor(lab);
        await resetLabSettings(lab, 'all');
        setSnap(store, { loaded: true, byId: new Map() });
      },
      /** Saves a section (or '*'); rejects with a readable message and leaves the old values in place. */
      save: async (sectionId: string, values: SectionSettings) => {
        const store = storeFor(lab);
        const saved = await saveLabSettings(lab, sectionId, values);
        const byId = new Map(store.snap.byId);
        if (isEmpty(saved)) byId.delete(sectionId);
        else byId.set(sectionId, saved);
        setSnap(store, { loaded: true, byId });
      },
    };
  }, [lab, snap]);
}

export type LabSettingsApi = ReturnType<typeof useLabSettings>;
