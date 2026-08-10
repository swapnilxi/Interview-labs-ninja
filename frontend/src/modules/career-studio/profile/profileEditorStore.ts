/**
 * Plain (non-React) store that controls the Profile Editor MODAL — mirrors
 * activeProfileStore.ts's pattern: a module-level cache + listener set, so any
 * component (ProfileSelector, CareerStudioTabs, ViewEditor, VersionTimeline's
 * clone/branch) can open/switch/close the editor without prop-drilling or a
 * page navigation. Exactly one <ProfileEditorModal/> should be mounted per
 * page that needs it (CareerStudioTabs, ViewEditor) — they're mutually
 * exclusive at any given time, so there's no double-render risk.
 */

export interface ProfileEditorState {
  open: boolean;
  profileId: string | null;
}

let state: ProfileEditorState = { open: false, profileId: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

export function getProfileEditorState(): ProfileEditorState {
  return state;
}

export function openProfileEditor(profileId: string): void {
  state = { open: true, profileId };
  emit();
}

export function closeProfileEditor(): void {
  state = { ...state, open: false };
  emit();
}

export function onProfileEditorChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
