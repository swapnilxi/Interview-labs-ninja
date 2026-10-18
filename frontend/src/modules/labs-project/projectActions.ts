import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import { deleteProject, updateProject, type LabProject } from '@/lib/services/labProjectsService';
import {
  removeProject,
  selectProject,
  upsertProject,
} from '@/modules/common/lab/project/projectStore';

function failure(action: string, e: unknown) {
  toast.error(e instanceof Error ? e.message : `Could not ${action}. Try again.`);
}

/** Archive hides a project from the labs' selectors and stops new saves into it; nothing is deleted. */
export async function setArchived(
  project: LabProject,
  archived: boolean
): Promise<LabProject | null> {
  try {
    const updated = await updateProject(project.id, { status: archived ? 'archived' : 'active' });
    upsertProject(updated);
    toast.success(archived ? `Archived “${project.name}”.` : `Restored “${project.name}”.`);
    return updated;
  } catch (e) {
    failure(archived ? 'archive the project' : 'restore the project', e);
    return null;
  }
}

/**
 * Deletes after an explicit confirmation that says what goes with it. Policy: the project, its context
 * AND every section saved to it are deleted for good; the lab pages themselves are not affected.
 */
export async function deleteWithConfirm(project: LabProject): Promise<boolean> {
  const n = project.sectionCount;
  const ok = await confirmDialog({
    title: `Delete “${project.name}”?`,
    message:
      n > 0
        ? `This permanently deletes the project, its context and its ${n} saved section${n === 1 ? '' : 's'}. This can't be undone.`
        : "This permanently deletes the project and its context. This can't be undone.",
    note: 'Want to keep the sections? Archive the project instead: it disappears from the labs but nothing is lost.',
    confirmLabel: 'Delete project',
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await deleteProject(project.id);
    removeProject(project.id);
    toast.success(`Deleted “${project.name}”.`);
    return true;
  } catch (e) {
    failure('delete the project', e);
    return false;
  }
}

/** Use (or stop using) a project in the labs: the same selection the labs' own selectors set. */
export function toggleUseInLabs(project: LabProject, currentlySelected: boolean): void {
  if (currentlySelected) {
    selectProject(null);
    toast.info('Labs will give general answers again.');
  } else {
    selectProject(project.id);
    toast.success(`Labs will now generate for “${project.name}”.`);
  }
}
