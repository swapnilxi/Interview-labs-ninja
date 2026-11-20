/**
 * fe-apis/lms/workbookHandlers.ts
 *
 * The Next.js handlers of the workbook endpoints (twin of the "Workbooks" block in backend/modules/ai_lms/router.py).
 * The logic and every access rule are in workbooks.ts; this file only does auth, the body, the database and the
 * Neon wrappers. The paths are in index.ts's NON_EDIT_WRITES (any signed-in user may create a private workbook), so
 * "may this user publish" is decided here from the user's effective permissions (role defaults + per-user overrides,
 * like Python's has_permission), not from the role-only gate.
 */

import { NextResponse } from 'next/server';
import { getUserFromAuthHeader, publicUser } from '../_shared/db';
import { aiSettings, withTodoDb } from '../todo/_shared';
import { withNeonRead, withNeonSync } from '@/lib/server/neonSync';
import { callAIText } from '../ai';
import { extractJsonObjectLenient } from '../ai/utils';
import { cleanExplanation } from './workbookGen';
import { requireUserId } from './index';
import { ensureLmsTables } from './db';
import {
  WorkbookError,
  createWorkbook,
  deleteWorkbook,
  explainJob,
  getProgress,
  getWorkbook,
  listLearners,
  listWorkbooks,
  resetLearner,
  resetProgress,
  saveProgress,
  outlineJob,
  saveOutline,
  saveSection,
  sectionJob,
  updateWorkbook,
  type WorkbookDb,
} from './workbooks';

interface Caller {
  id: number;
  isEditor: boolean;
}

/** The signed-in, approved caller, or the response to send instead (same texts as Python's get_current_active_user). */
function caller(req: Request): Caller | NextResponse {
  const gate = requireUserId(req);
  if (gate instanceof NextResponse) return gate;
  const user = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
  const view = publicUser(user);
  if (view.status === 'pending') {
    return NextResponse.json(
      { detail: 'Your account is pending admin approval.' },
      { status: 403 }
    );
  }
  if (view.status !== 'approved') {
    return NextResponse.json({ detail: 'Your account was not approved.' }, { status: 403 });
  }
  return { id: user.id, isEditor: view.permissions.includes('ai_lms:edit') };
}

function errorResponse(err: unknown, fallback: string): NextResponse {
  if (err instanceof WorkbookError)
    return NextResponse.json({ detail: err.detail }, { status: err.status });
  console.error('[lms/workbooks]', err);
  return NextResponse.json({ detail: (err as Error)?.message || fallback }, { status: 500 });
}

/** The parsed body; a body that is not JSON gets the same 422 text the Python router gives. */
async function jsonBody(req: Request, message: string): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new WorkbookError(422, message);
  }
}

function inDb<T>(fn: (db: WorkbookDb) => T): T {
  ensureLmsTables();
  return withTodoDb((db) => fn(db));
}

async function listImpl(req: Request, classSlug: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => listWorkbooks(db, classSlug, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to load workbooks');
  }
}

async function createImpl(req: Request, classSlug: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    const payload = await jsonBody(req, 'Send the workbook as a JSON object.');
    return NextResponse.json(
      inDb((db) => createWorkbook(db, classSlug, who.id, who.isEditor, payload)),
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err, 'Failed to create the workbook');
  }
}

async function getImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => getWorkbook(db, workbookId, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to load the workbook');
  }
}

async function updateImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    const payload = await jsonBody(req, 'Send the changes as a JSON object.');
    return NextResponse.json(
      inDb((db) => updateWorkbook(db, workbookId, who.id, who.isEditor, payload))
    );
  } catch (err) {
    return errorResponse(err, 'Failed to save the workbook');
  }
}

async function deleteImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => deleteWorkbook(db, workbookId, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to delete the workbook');
  }
}

// ── Generation (twin of the "Workbook generation" block in router.py) ─────────────────────────────────────────────

/** Per provider request: a chapter is a long answer (router.py's _WORKBOOK_AI_TIMEOUT_S). */
const AI_TIMEOUT_MS = 240_000;

/** The AI's answer to one generation prompt, read as a JSON object as leniently as it allows (null if it is not). */
async function runAi(prompt: string, maxTokens: number, settings: unknown): Promise<unknown> {
  return extractJsonObjectLenient(await callAi(prompt, maxTokens, settings));
}

/** The AI's raw answer; provider failures become the same 400/502 texts as router.py's _call_workbook_ai. */
async function callAi(prompt: string, maxTokens: number, settings: unknown): Promise<string> {
  let raw: string;
  try {
    raw = await callAIText(
      prompt,
      aiSettings(settings as Record<string, unknown>),
      AI_TIMEOUT_MS,
      maxTokens
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('No API key configured')) throw new WorkbookError(400, message);
    throw new WorkbookError(502, `The AI call failed: ${message}`);
  }
  if (!(raw || '').trim())
    throw new WorkbookError(502, 'The AI returned an empty answer. Try again.');
  return raw;
}

/** The AI settings riding along with the request (the same fields as Python's AISettings body). */
async function settingsBody(req: Request): Promise<Record<string, unknown>> {
  const body = await jsonBody(req, 'Send the AI settings as a JSON object.');
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new WorkbookError(422, 'Send the AI settings as a JSON object.');
  }
  return body as Record<string, unknown>;
}

// Only the save is a Neon write: the AI call (up to minutes) runs outside it, so it never holds up other writes on this
// instance, and a save that loses a race with another instance is replayed without calling the AI again. withNeonSync
// replays from a clone of its first argument, so it gets a fresh body-less Request (the real one's body is read).

const saveOutlineSynced = withNeonSync(
  async (_replay: Request, who: Caller, workbookId: string, parsed: unknown) => {
    try {
      return NextResponse.json(
        inDb((db) => saveOutline(db, workbookId, who.id, who.isEditor, parsed))
      );
    } catch (err) {
      return errorResponse(err, 'Failed to plan the chapters');
    }
  }
);

const saveSectionSynced = withNeonSync(
  async (
    _replay: Request,
    who: Caller,
    workbookId: string,
    sectionId: string,
    templateVersion: number,
    parsed: unknown
  ) => {
    try {
      return NextResponse.json(
        inDb((db) =>
          saveSection(db, workbookId, sectionId, who.id, who.isEditor, templateVersion, parsed)
        )
      );
    } catch (err) {
      return errorResponse(err, 'Failed to write the chapter');
    }
  }
);

async function outlineImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  let parsed: unknown;
  try {
    const settings = await settingsBody(req);
    const job = inDb((db) => outlineJob(db, workbookId, who.id, who.isEditor));
    parsed = await runAi(job.prompt, job.max_tokens, settings);
  } catch (err) {
    return errorResponse(err, 'Failed to plan the chapters');
  }
  return saveOutlineSynced(new Request(req.url), who, workbookId, parsed);
}

async function sectionImpl(
  req: Request,
  workbookId: string,
  sectionId: string
): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  let parsed: unknown;
  let templateVersion: number;
  try {
    const settings = await settingsBody(req);
    const job = inDb((db) => sectionJob(db, workbookId, sectionId, who.id, who.isEditor));
    templateVersion = job.template_version as number;
    parsed = await runAi(job.prompt, job.max_tokens, settings);
  } catch (err) {
    return errorResponse(err, 'Failed to write the chapter');
  }
  return saveSectionSynced(
    new Request(req.url),
    who,
    workbookId,
    sectionId,
    templateVersion,
    parsed
  );
}

// The Request comes first so withNeonSync can replay a write that lost a race with another instance.
export const handleListWorkbooks = withNeonRead(listImpl);
export const handleCreateWorkbook = withNeonSync(createImpl);
export const handleGetWorkbook = withNeonRead(getImpl);
export const handleUpdateWorkbook = withNeonSync(updateImpl);
export const handleDeleteWorkbook = withNeonSync(deleteImpl);
// The job is read like any GET (pulled fresh first); only the save above is a synced write.
export const handleGenerateOutline = withNeonRead(outlineImpl);
export const handleGenerateSection = withNeonRead(sectionImpl);

// ── Learner progress (twin of the "Learner progress" block in router.py) ─────────────────────────────────────────

async function getProgressImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => getProgress(db, workbookId, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to load your progress');
  }
}

async function saveProgressImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    const payload = await jsonBody(req, 'Send your answers as a JSON object.');
    return NextResponse.json(
      inDb((db) => saveProgress(db, workbookId, who.id, who.isEditor, payload))
    );
  } catch (err) {
    return errorResponse(err, 'Failed to save your answers');
  }
}

async function resetProgressImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => resetProgress(db, workbookId, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to reset your progress');
  }
}

async function listLearnersImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(inDb((db) => listLearners(db, workbookId, who.id, who.isEditor)));
  } catch (err) {
    return errorResponse(err, 'Failed to load the learners');
  }
}

async function resetLearnerImpl(
  req: Request,
  workbookId: string,
  learnerId: string
): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    return NextResponse.json(
      inDb((db) => resetLearner(db, workbookId, learnerId, who.id, who.isEditor))
    );
  } catch (err) {
    return errorResponse(err, "Failed to reset the learner's progress");
  }
}

export const handleGetProgress = withNeonRead(getProgressImpl);
export const handleSaveProgress = withNeonSync(saveProgressImpl);
export const handleResetProgress = withNeonSync(resetProgressImpl);
export const handleListLearners = withNeonRead(listLearnersImpl);
export const handleResetLearner = withNeonSync(resetLearnerImpl);

// "Explain this to me": anyone who can see the workbook may ask; nothing is saved, so it is a read, not a sync.
async function explainImpl(req: Request, workbookId: string): Promise<NextResponse> {
  const who = caller(req);
  if (who instanceof NextResponse) return who;
  try {
    const body = await jsonBody(req, 'Send the request as a JSON object.');
    const job = inDb((db) => explainJob(db, workbookId, who.id, who.isEditor, body));
    const raw = await callAi(job.prompt, job.max_tokens, body);
    return NextResponse.json({ text: cleanExplanation(raw) });
  } catch (err) {
    return errorResponse(err, 'Failed to explain this part');
  }
}

export const handleExplain = withNeonRead(explainImpl);
