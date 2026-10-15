'use client';

/**
 * URL params for the full-screen editors of Career Studio, so each one has an address and the browser's Back
 * button closes it (the profile editor's own param, `?profile=`, is handled in profile/ProfileEditorModal.tsx).
 *
 *   ?design=<templateId>             the Template Designer, editing that template
 *   ?design=new-resume|new-portfolio the Template Designer, starting a new template of that kind
 *
 * Opening pushes a history entry; closing goes back to it (or, on a link / refresh with nothing to go back to,
 * navigates to the same page without the param).
 */

import { useCallback } from 'react';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';

export const DESIGN_PARAM = 'design';

export function useDesignerParam() {
  const { get, update, pathname, searchParams } = useUrlState();
  const goBack = useSmartBack();
  const designId = get(DESIGN_PARAM);
  /** The screen the designer was opened from: this page without `?design=`. */
  const backHref = buildUrl(pathname, searchParams, { [DESIGN_PARAM]: null });

  const openDesigner = useCallback((id: string) => update({ [DESIGN_PARAM]: id }), [update]);
  const closeDesigner = useCallback(() => goBack(backHref), [goBack, backHref]);
  /** The param names a template that does not exist: drop it without leaving a history entry. */
  const dropDesigner = useCallback(() => update({ [DESIGN_PARAM]: null }, 'replace'), [update]);

  return { designId, backHref, openDesigner, closeDesigner, dropDesigner };
}
