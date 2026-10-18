'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { LabProject } from '@/lib/services/labProjectsService';
import {
  bindProjectUser,
  getProjectsSnapshot,
  getServerProjectsSnapshot,
  loadProjects,
  selectProject,
  subscribeProjects,
} from '@/modules/common/lab/project/projectStore';

/**
 * The user's Labs Projects and the selected one (see projectStore.ts). Every component that calls it
 * sees the same data; the first one to mount triggers the load.
 *
 * `selected` is only ever an ACTIVE project; `selectedId` can be set a moment before the list has
 * loaded, so generation code should use `selected` (or `resolveSelectedProject()` in event handlers).
 */
export function useLabProjects() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snap = useSyncExternalStore(
    subscribeProjects,
    getProjectsSnapshot,
    getServerProjectsSnapshot
  );

  useEffect(() => {
    bindProjectUser(userId);
  }, [userId]);

  useEffect(() => {
    // Not on error: a failing backend must not turn into a request loop. `refresh` retries.
    if (snap.userId !== null && !snap.loaded && !snap.loading && !snap.error) void loadProjects();
  }, [snap.userId, snap.loaded, snap.loading, snap.error]);

  const active = useMemo(() => snap.projects.filter((p) => p.status === 'active'), [snap.projects]);
  const selected: LabProject | null = useMemo(
    () => active.find((p) => p.id === snap.selectedId) ?? null,
    [active, snap.selectedId]
  );
  const refresh = useCallback(() => loadProjects(true), []);

  return {
    /** Active and archived. */
    allProjects: snap.projects,
    /** Active only: what the labs' selectors offer. */
    projects: active,
    selected,
    selectedId: selected?.id ?? null,
    loaded: snap.loaded,
    loading: snap.loading,
    error: snap.error,
    select: selectProject,
    refresh,
  };
}
