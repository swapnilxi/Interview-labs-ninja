'use client';

/**
 * Hosts the Profile Editor as a full-screen editor (see profileEditorStore.ts). Mount once per page that
 * can trigger it (CareerStudioTabs, ViewEditor). It is a screen of its own: which profile is open is the
 * URL's `?profile=<id>`, so a refresh or a shared link reopens it, Back/Forward open and close it, and
 * the editor's Back control returns to the page underneath.
 * `onClosed` fires after the editor closes, so the host can refresh whatever profile list it's showing —
 * the host page never unmounts, so that refresh doesn't happen for free the way a route change used to give it.
 */

import { useEffect, useRef } from 'react';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import ProfileEditor from './ProfileEditor';
import { registerProfileEditorNavigator } from './profileEditorStore';

export const PROFILE_PARAM = 'profile';

export default function ProfileEditorModal({ onClosed }: { onClosed?: () => void }) {
  const { get, update, pathname, searchParams } = useUrlState();
  const goBack = useSmartBack();
  const profileId = get(PROFILE_PARAM);
  /** The page underneath: this URL without the editor's own params (`?profile=` and its `&pane=`). */
  const backHref = buildUrl(pathname, searchParams, { [PROFILE_PARAM]: null, pane: null });

  // openProfileEditor()/closeProfileEditor() are plain functions called from event handlers all over the
  // module; give them the newest URL helpers through a ref rather than re-registering on every URL change.
  const latest = useRef({ profileId, update, goBack, backHref });
  latest.current = { profileId, update, goBack, backHref };
  useEffect(() => {
    registerProfileEditorNavigator({
      // Opening from the page pushes an entry; switching profiles inside the open editor replaces it.
      open: (id) => latest.current.update({ [PROFILE_PARAM]: id }, latest.current.profileId ? 'replace' : 'push'),
      close: (options) =>
        options?.replace
          ? latest.current.update({ [PROFILE_PARAM]: null, pane: null }, 'replace')
          : latest.current.goBack(latest.current.backHref),
    });
    return () => registerProfileEditorNavigator(null);
  }, []);

  const wasOpen = useRef(profileId);
  useEffect(() => {
    if (wasOpen.current && !profileId) onClosed?.();
    wasOpen.current = profileId;
  }, [profileId, onClosed]);

  if (!profileId) return null;
  return <ProfileEditor profileId={profileId} backHref={backHref} />;
}
