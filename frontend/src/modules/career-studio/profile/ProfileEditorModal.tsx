'use client';

/**
 * Hosts the Profile Editor as a full-screen modal (see profileEditorStore.ts).
 * Mount once per page that can trigger it (CareerStudioTabs, ViewEditor).
 * `onClosed` fires after the editor closes, so the host can refresh whatever
 * profile list it's showing — the modal never unmounts the host page, so that
 * refresh doesn't happen for free the way a route change used to give it.
 */

import { useEffect, useRef, useState } from 'react';
import ProfileEditor from './ProfileEditor';
import { getProfileEditorState, onProfileEditorChange } from './profileEditorStore';

export default function ProfileEditorModal({ onClosed }: { onClosed?: () => void }) {
  const [state, setState] = useState(getProfileEditorState());
  const wasOpen = useRef(state.open);

  useEffect(
    () =>
      onProfileEditorChange(() => {
        const next = getProfileEditorState();
        if (wasOpen.current && !next.open) onClosed?.();
        wasOpen.current = next.open;
        setState(next);
      }),
    [onClosed],
  );

  if (!state.open || !state.profileId) return null;
  return <ProfileEditor profileId={state.profileId} />;
}
