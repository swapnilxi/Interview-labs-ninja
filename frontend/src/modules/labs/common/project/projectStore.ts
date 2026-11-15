/**
 * The Labs Projects the signed-in user has, and which one is selected, shared by every lab, the
 * selector, the Save to Project dialog and the Labs Project page (a plain module like `lib/ui/toast.ts`,
 * read through `useSyncExternalStore` in `useLabProjects`).
 *
 * The project LIST is server data and is cached here only to avoid refetching on every lab page. The
 * SELECTION is a per-viewer convenience kept in localStorage, one entry per user so that two accounts
 * on the same browser never see each other's selection. A selection that no longer points at an active
 * project (deleted, archived, or from another device) is dropped as soon as the list is known.
 */

import { fetchProjects, type LabProject } from '@/lib/services/labProjectsService';

export interface ProjectStoreState {
  userId: number | null;
  /** Every project, active and archived, most recently updated first. */
  projects: LabProject[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  selectedId: number | null;
}

const EMPTY: ProjectStoreState = {
  userId: null,
  projects: [],
  loaded: false,
  loading: false,
  error: null,
  selectedId: null,
};

const KEY_PREFIX = 'labninja.lab_project.selected.v1.';

let state: ProjectStoreState = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function set(patch: Partial<ProjectStoreState>) {
  state = { ...state, ...patch };
  emit();
}

function readSelected(userId: number | null): number | null {
  if (userId === null || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeSelected(userId: number | null, id: number | null) {
  if (userId === null || typeof window === 'undefined') return;
  try {
    if (id === null) window.localStorage.removeItem(KEY_PREFIX + userId);
    else window.localStorage.setItem(KEY_PREFIX + userId, String(id));
  } catch {
    // storage blocked: the selection just won't survive a refresh
  }
}

/** Keeps `selectedId` pointing at an active project, or null. */
function reconcile(projects: LabProject[], selectedId: number | null): number | null {
  if (selectedId === null) return null;
  return projects.some((p) => p.id === selectedId && p.status === 'active') ? selectedId : null;
}

export function subscribeProjects(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProjectsSnapshot(): ProjectStoreState {
  return state;
}

export function getServerProjectsSnapshot(): ProjectStoreState {
  return EMPTY;
}

/** Called when the signed-in user changes (login, logout, switching accounts): starts from a clean slate. */
export function bindProjectUser(userId: number | null): void {
  if (state.userId === userId) return;
  inflight = null;
  state = { ...EMPTY, userId, selectedId: readSelected(userId) };
  emit();
}

/** Loads the project list (once, unless `force`). Never rejects: a failure is kept in `error`. */
export function loadProjects(force = false): Promise<void> {
  const userId = state.userId;
  if (userId === null) return Promise.resolve();
  if (inflight && !force) return inflight;
  if (state.loaded && !force) return Promise.resolve();
  set({ loading: true, error: null });
  const request = fetchProjects('all')
    .then((projects) => {
      if (state.userId !== userId) return; // the account changed while this was in flight
      const selectedId = reconcile(projects, state.selectedId);
      if (selectedId !== state.selectedId) writeSelected(userId, selectedId);
      set({ projects, loaded: true, loading: false, error: null, selectedId });
    })
    .catch((e) => {
      if (state.userId !== userId) return;
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Could not load your projects.',
      });
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

/** Selects a project for the labs (null = "No project"). An id that isn't an active project becomes null. */
export function selectProject(id: number | null): void {
  const next = reconcile(state.projects, id);
  writeSelected(state.userId, next);
  set({ selectedId: next });
}

/** Adds or replaces one project after the server accepted a change, so every open selector updates at once. */
export function upsertProject(project: LabProject): void {
  const rest = state.projects.filter((p) => p.id !== project.id);
  const projects = [project, ...rest].sort((a, b) =>
    a.updatedAt === b.updatedAt ? b.id - a.id : a.updatedAt < b.updatedAt ? 1 : -1
  );
  const selectedId = reconcile(projects, state.selectedId);
  if (selectedId !== state.selectedId) writeSelected(state.userId, selectedId);
  set({ projects, selectedId });
}

export function removeProject(id: number): void {
  const projects = state.projects.filter((p) => p.id !== id);
  const selectedId = reconcile(projects, state.selectedId);
  if (selectedId !== state.selectedId) writeSelected(state.userId, selectedId);
  set({ projects, selectedId });
}

/**
 * The project to generate against: waits for the list to load, so a click on Generate right after the
 * page opens still honours the stored selection. Null means "No project".
 */
export async function resolveSelectedProject(): Promise<LabProject | null> {
  if (state.userId !== null && !state.loaded) await loadProjects();
  return state.projects.find((p) => p.id === state.selectedId && p.status === 'active') ?? null;
}

// Another tab changed the selection (or signed out): follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (state.userId === null || e.key !== KEY_PREFIX + state.userId) return;
    const selectedId = reconcile(state.projects, readSelected(state.userId));
    if (selectedId !== state.selectedId) set({ selectedId });
  });
}
