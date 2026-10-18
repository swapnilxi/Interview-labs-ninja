/**
 * fe-apis/labProjects/handlers.ts
 *
 * Port of backend/modules/lab_projects/router.py (served at /lab-projects). Paths, status codes,
 * limits and error texts match the Python so both backends answer alike -- keep the two in sync.
 * Every route is scoped to the signed-in user: someone else's project or section is a 404, never a 403.
 */

import { HttpError, type Row } from '../todo/_shared';
import type { TodoRoute } from '../todo/router';
import {
  createProject,
  createSection,
  deleteProject,
  deleteSection,
  getProject,
  getSection,
  listProjects,
  listSections,
  updateProject,
  updateSection,
  withLabProjectsDb,
  type Project,
} from './db';
import { cpLength, pyStrip } from './text';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;
const CONTEXT_MAX = 12000;
const TITLE_MAX = 200;
const CONTENT_MAX = 60000;
const LAB_ID = /^[a-z0-9_-]{1,50}$/;
const PROJECT_STATUSES = ['active', 'archived'] as const;
const LIST_STATUSES = ['active', 'archived', 'all'] as const;

// ── Validation (Pydantic's 422s) ────────────────────────────────────────────

/** The request body must be a JSON object (Pydantic rejects anything else with a 422). */
function bodyObject(body: unknown): Row {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(422, 'Request body must be a JSON object');
  return body as Row;
}

/**
 * A string field. Length limits count code points and apply to what was sent, before any trimming.
 * `nullable` is for Pydantic's Optional fields, where a sent null means "not sent"; for the others a
 * null is a 422 like any other non-string.
 */
function strField(
  body: Row,
  key: string,
  max: number,
  opts: { required?: boolean; nullable?: boolean } = {}
): string | undefined {
  const v = body[key];
  if (v === undefined) {
    if (opts.required) throw new HttpError(422, `Field '${key}' is required`);
    return undefined;
  }
  if (v === null) {
    if (opts.nullable) return undefined;
    throw new HttpError(422, `Field '${key}' must be a string`);
  }
  if (typeof v !== 'string') throw new HttpError(422, `Field '${key}' must be a string`);
  if (cpLength(v) > max) throw new HttpError(422, `Field '${key}' is too long (max ${max})`);
  return v;
}

/** Trims, and rejects text that is empty once trimmed (Pydantic's `_clean_name`). */
function nameField(value: string, key: string): string {
  const trimmed = pyStrip(value);
  if (!trimmed) throw new HttpError(422, `Field '${key}' must not be empty`);
  return trimmed;
}

function nonBlank(value: string, key: string): string {
  if (!pyStrip(value)) throw new HttpError(422, `Field '${key}' must not be empty`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new HttpError(422, `Field '${name}' must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function queryString(query: URLSearchParams, key: string, max: number): string {
  const v = query.get(key) ?? '';
  if (cpLength(v) > max) throw new HttpError(422, `Query '${key}' is too long (max ${max})`);
  return v;
}

function projectOr404(userId: number, projectId: number): Project {
  const project = getProject(userId, projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  return project;
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  // Projects
  {
    method: 'GET',
    path: '/',
    handler: ({ userId, query }) => {
      const status = query.has('status')
        ? oneOf(query.get('status'), LIST_STATUSES, 'status')
        : 'all';
      return { projects: listProjects(userId, status) };
    },
  },
  {
    method: 'POST',
    path: '/',
    status: 201,
    handler: async ({ userId, json }) => {
      const body = bodyObject(await json());
      const name = nameField(strField(body, 'name', NAME_MAX, { required: true })!, 'name');
      const description = strField(body, 'description', DESCRIPTION_MAX) ?? '';
      const context = strField(body, 'context', CONTEXT_MAX) ?? '';
      return createProject(userId, name, pyStrip(description), pyStrip(context));
    },
  },
  {
    method: 'GET',
    path: '/:project_id',
    handler: ({ userId, intParam }) => projectOr404(userId, intParam('project_id')),
  },
  {
    method: 'PATCH',
    path: '/:project_id',
    handler: async ({ userId, json, intParam }) => {
      const projectId = intParam('project_id');
      const body = bodyObject(await json());
      // Any subset of the fields; one that isn't sent (or is sent as null) is left alone.
      const changes: Row = {};
      const name = strField(body, 'name', NAME_MAX, { nullable: true });
      if (name !== undefined) changes.name = nameField(name, 'name');
      const description = strField(body, 'description', DESCRIPTION_MAX, { nullable: true });
      if (description !== undefined) changes.description = pyStrip(description);
      const context = strField(body, 'context', CONTEXT_MAX, { nullable: true });
      if (context !== undefined) changes.context = pyStrip(context);
      if (body.status !== undefined && body.status !== null)
        changes.status = oneOf(body.status, PROJECT_STATUSES, 'status');

      if (!Object.keys(changes).length) return projectOr404(userId, projectId);
      const project = updateProject(userId, projectId, changes);
      if (!project) throw new HttpError(404, 'Project not found.');
      return project;
    },
  },
  {
    // Deletes the project AND every section saved to it (there is no undo; archive instead to keep them).
    method: 'DELETE',
    path: '/:project_id',
    handler: ({ userId, intParam }) => {
      const deleted = deleteProject(userId, intParam('project_id'));
      if (deleted === undefined) throw new HttpError(404, 'Project not found.');
      return { ok: true, deletedSections: deleted };
    },
  },

  // Sections
  {
    method: 'GET',
    path: '/:project_id/sections',
    handler: ({ userId, query, intParam }) => {
      const projectId = intParam('project_id');
      const q = queryString(query, 'q', 200);
      const lab = queryString(query, 'lab', 50);
      return withLabProjectsDb(() => {
        projectOr404(userId, projectId);
        return { sections: listSections(userId, projectId, q, lab) };
      });
    },
  },
  {
    method: 'POST',
    path: '/:project_id/sections',
    status: 201,
    handler: async ({ userId, json, intParam }) => {
      const projectId = intParam('project_id');
      const body = bodyObject(await json());
      const title = nameField(strField(body, 'title', TITLE_MAX, { required: true })!, 'title');
      const content = nonBlank(
        strField(body, 'content', CONTENT_MAX, { required: true })!,
        'content'
      );
      const sourceLabId = strField(body, 'source_lab_id', 50, { required: true })!;
      if (!LAB_ID.test(sourceLabId))
        throw new HttpError(
          422,
          "Field 'source_lab_id' must be lowercase letters, digits, '_' or '-'"
        );
      const sourceLabName = strField(body, 'source_lab_name', 100, { required: true })!;
      if (cpLength(pyStrip(sourceLabName)) < 1)
        throw new HttpError(422, "Field 'source_lab_name' must not be empty");
      const sourceGenerationId =
        strField(body, 'source_generation_id', 300, { nullable: true }) ?? null;

      return withLabProjectsDb(() => {
        const project = projectOr404(userId, projectId);
        if (project.status !== 'active')
          throw new HttpError(409, 'This project is archived. Restore it to save sections to it.');
        return createSection(
          userId,
          projectId,
          title,
          content,
          sourceLabId,
          pyStrip(sourceLabName),
          sourceGenerationId
        );
      });
    },
  },
  {
    method: 'GET',
    path: '/:project_id/sections/:section_id',
    handler: ({ userId, intParam }) => {
      const section = getSection(userId, intParam('project_id'), intParam('section_id'));
      if (!section) throw new HttpError(404, 'Section not found.');
      return section;
    },
  },
  {
    method: 'PATCH',
    path: '/:project_id/sections/:section_id',
    handler: async ({ userId, json, intParam }) => {
      const projectId = intParam('project_id');
      const sectionId = intParam('section_id');
      const body = bodyObject(await json());
      const changes: Row = {};
      const title = strField(body, 'title', TITLE_MAX, { nullable: true });
      if (title !== undefined) changes.title = nameField(title, 'title');
      const content = strField(body, 'content', CONTENT_MAX, { nullable: true });
      if (content !== undefined) changes.content = nonBlank(content, 'content');

      const section = Object.keys(changes).length
        ? updateSection(userId, projectId, sectionId, changes)
        : getSection(userId, projectId, sectionId);
      if (!section) throw new HttpError(404, 'Section not found.');
      return section;
    },
  },
  {
    method: 'DELETE',
    path: '/:project_id/sections/:section_id',
    handler: ({ userId, intParam }) => {
      if (!deleteSection(userId, intParam('project_id'), intParam('section_id')))
        throw new HttpError(404, 'Section not found.');
      return { ok: true };
    },
  },
];
