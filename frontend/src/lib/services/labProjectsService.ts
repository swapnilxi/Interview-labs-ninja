import { apiFetch, parseApiError } from '@/lib/http/apiClient';

/**
 * Labs Projects: named projects the labs generate against, and the sections the user saved to them.
 * Served by `backend/modules/lab_projects` (fastapi mode) and its twin `fe-apis/labProjects`
 * (nextjs-api mode) at `/lab-projects/*`; both need a login, so this goes through `apiFetch`.
 */

export type ProjectStatus = 'active' | 'archived';

export interface LabProject {
  id: number;
  name: string;
  description: string;
  /** Background, objectives, requirements, constraints and decisions: sent to the labs when generating. */
  context: string;
  status: ProjectStatus;
  /** Server time (UTC, "YYYY-MM-DD HH:MM:SS"). */
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
}

export interface ProjectSection {
  id: number;
  projectId: number;
  title: string;
  sourceLabId: string;
  /** The lab it was generated in, as shown to the user ("DSA Lab"). */
  sourceLabName: string;
  /** 'lab|topic|subtopic|section@generated-at' of the lab page it was saved from, when there is one. */
  sourceGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  /** The first words of the text, for list views. */
  excerpt: string;
  /** Only on a single-section fetch (the list leaves it out). */
  content?: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  context?: string;
}

export interface SaveSectionInput {
  title: string;
  content: string;
  sourceLabId: string;
  sourceLabName: string;
  sourceGenerationId?: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function fetchProjects(status: ProjectStatus | 'all' = 'all'): Promise<LabProject[]> {
  const res = await apiFetch(`/lab-projects?${new URLSearchParams({ status })}`);
  return (await json<{ projects: LabProject[] }>(res)).projects ?? [];
}

export async function fetchProject(id: number): Promise<LabProject> {
  return json(await apiFetch(`/lab-projects/${id}`));
}

export async function createProject(input: ProjectInput): Promise<LabProject> {
  return json(await apiFetch('/lab-projects', send('POST', input)));
}

/** Changes only the fields given. Saved sections are never touched by a project edit. */
export async function updateProject(
  id: number,
  changes: Partial<ProjectInput & { status: ProjectStatus }>
): Promise<LabProject> {
  return json(await apiFetch(`/lab-projects/${id}`, send('PATCH', changes)));
}

/** Deletes the project AND every section saved to it. */
export async function deleteProject(id: number): Promise<{ deletedSections: number }> {
  return json(await apiFetch(`/lab-projects/${id}`, send('DELETE')));
}

export async function fetchSections(
  projectId: number,
  filters: { q?: string; lab?: string } = {}
): Promise<ProjectSection[]> {
  const qs = new URLSearchParams();
  if (filters.q?.trim()) qs.set('q', filters.q.trim());
  if (filters.lab) qs.set('lab', filters.lab);
  const res = await apiFetch(`/lab-projects/${projectId}/sections${qs.size ? `?${qs}` : ''}`);
  return (await json<{ sections: ProjectSection[] }>(res)).sections ?? [];
}

export async function fetchSection(projectId: number, sectionId: number): Promise<ProjectSection> {
  return json(await apiFetch(`/lab-projects/${projectId}/sections/${sectionId}`));
}

/** Saves a response as a NEW section; it never overwrites an existing one. */
export async function saveSection(
  projectId: number,
  input: SaveSectionInput
): Promise<ProjectSection> {
  return json(
    await apiFetch(
      `/lab-projects/${projectId}/sections`,
      send('POST', {
        title: input.title,
        content: input.content,
        source_lab_id: input.sourceLabId,
        source_lab_name: input.sourceLabName,
        source_generation_id: input.sourceGenerationId ?? null,
      })
    )
  );
}

export async function updateSection(
  projectId: number,
  sectionId: number,
  changes: { title?: string; content?: string }
): Promise<ProjectSection> {
  return json(
    await apiFetch(`/lab-projects/${projectId}/sections/${sectionId}`, send('PATCH', changes))
  );
}

export async function deleteSection(projectId: number, sectionId: number): Promise<void> {
  await json(await apiFetch(`/lab-projects/${projectId}/sections/${sectionId}`, send('DELETE')));
}

/** "2026-10-18 07:38:11" (server, UTC) → a Date. */
export function parseServerTime(serverTime: string): Date {
  return new Date(serverTime.replace(' ', 'T') + 'Z');
}

/** "18 Oct 2026" in the viewer's locale; '' if the value isn't a date. */
export function formatServerDate(serverTime: string | null | undefined): string {
  if (!serverTime) return '';
  const d = parseServerTime(serverTime);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Where a saved section opens in Labs Project. */
export function sectionHref(projectId: number, sectionId: number): string {
  return `/labs-project?project=${projectId}&tab=sections&section=${sectionId}`;
}

export function projectHref(projectId: number, tab: 'context' | 'sections' = 'sections'): string {
  return `/labs-project?project=${projectId}&tab=${tab}`;
}

/**
 * Identifies one lab page-section and, with `generatedAt`, one generation of it: 'lab|topic|subtopic|section@time'.
 * The server builds the same prefix (`lab_projects.knowledge.generation_ref`) to keep a page's own earlier copy
 * out of the knowledge it regenerates from.
 */
export function buildGenerationRef(
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  generatedAt?: string | null
): string {
  return `${lab}|${topicId}|${subtopicId}|${sectionId}@${generatedAt ?? 'template'}`;
}
