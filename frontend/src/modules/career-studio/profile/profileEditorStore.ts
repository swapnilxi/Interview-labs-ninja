/**
 * Entry points for the Profile Editor — a full-screen editor that opens from anywhere
 * (ProfileSelector, CareerStudioTabs, ViewEditor, VersionTimeline's clone/branch) without a page
 * navigation of its own. Plain (non-React) functions, mirroring activeProfileStore.ts, so any component
 * can call them without prop-drilling. Exactly one <ProfileEditorModal/> should be mounted per page that
 * needs it (CareerStudioTabs, ViewEditor) — they're mutually exclusive, so there's no double-render risk.
 *
 * WHICH profile is open lives in the URL (`?profile=<id>`), so the editor has an address and the
 * browser's Back button closes it. The mounted ProfileEditorModal registers a navigator below that turns
 * these calls into URL changes and renders whatever the URL names. Only when no host is mounted do the
 * calls fall back to the old in-memory state (getProfileEditorState / onProfileEditorChange).
 */

export interface ProfileEditorState {
  open: boolean;
  profileId: string | null;
}

/** What the mounted ProfileEditorModal does for open/close; it knows the router and the current URL. */
export interface ProfileEditorNavigator {
  open(profileId: string): void;
  /** `replace`: leave no history entry (the URL named a profile that cannot be opened). */
  close(options?: { replace?: boolean }): void;
}

let state: ProfileEditorState = { open: false, profileId: null };
let navigator_: ProfileEditorNavigator | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

export function registerProfileEditorNavigator(next: ProfileEditorNavigator | null): void {
  navigator_ = next;
}

export function getProfileEditorState(): ProfileEditorState {
  return state;
}

export function openProfileEditor(profileId: string): void {
  if (navigator_) {
    navigator_.open(profileId);
    return;
  }
  state = { open: true, profileId };
  emit();
}

export function closeProfileEditor(options?: { replace?: boolean }): void {
  if (navigator_) {
    navigator_.close(options);
    return;
  }
  state = { ...state, open: false };
  emit();
}

export function onProfileEditorChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
