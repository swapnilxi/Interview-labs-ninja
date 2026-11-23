/**
 * Project question/topic lessons: Next.js handlers, operations table and write transactions.
 *
 * TWIN of backend/modules/ai_lms/question_topics_api.py (same routes, bodies, status codes and error texts; read its
 * docstring for the duplicate-prevention and sync design). Pure helpers: ./questionTopics.ts.
 *
 *   POST   /api/lms/projects/{p}/question-topics/preview
 *   POST   /api/lms/projects/{p}/question-topics                  (self-synced: claim + commit via runSyncedWrite)
 *   GET    /api/lms/projects/{p}/question-topics/operations/{op}
 *   PATCH  /api/lms/projects/{p}/question-topics/{t}              (withNeonSync)
 *   DELETE /api/lms/projects/{p}/question-topics/{t}              (withNeonSync)
 */
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSQLiteDatabase, getUserFromAuthHeader } from '../_shared/db';
import { callAIText } from '../ai';
import {
  withNeonRead,
  withNeonSync,
  runSyncedWrite,
  SyncUnavailableError,
} from '@/lib/server/neonSync';
import { withClassFolderSync } from './classFolders';
import { getSubjectByIdAnyClass, slugify, TOPIC_OPS_DDL } from './db';
import { PREMIUM_DESIGN_TOKENS_CSS } from './htmlBuilder';
import * as qt from './questionTopics';
import { requireUserId } from './index';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const OP_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const BUSY_SECONDS = 300;
const LESSON_TIMEOUT_MS = 240_000;
const PREVIEW_TIMEOUT_MS = 60_000;
const EDITOR_ROLES = new Set(['editor', 'instructor', 'admin', 'superadmin']);

class HttpError extends Error {
  constructor(
    public status: number,
    public body: Obj
  ) {
    super(String(body.detail));
  }
}
const fail = (status: number, detail: string): never => {
  throw new HttpError(status, { detail });
};

const now = () => new Date().toISOString();

function database() {
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) throw new HttpError(503, { detail: 'Database unavailable' });
  res.db.exec('PRAGMA busy_timeout = 30000');
  res.db.exec(TOPIC_OPS_DDL);
  return res.db;
}

function tx<T>(fn: (db: ReturnType<typeof database>) => T): T {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn(db);
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

function projectOr404(projectId: string): { cls: Obj; project: Obj } {
  const subj = getSubjectByIdAnyClass(projectId) as Obj | null;
  if (!subj || subj.id !== projectId || subj.kind !== 'project') fail(404, 'Project not found.');
  return { cls: subj!.class as Obj, project: subj! };
}

function authUser(req: Request): Obj {
  const auth = requireUserId(req);
  if (auth instanceof NextResponse) {
    throw new HttpError(auth.status, {
      detail:
        auth.status === 401
          ? 'Log in to use this feature.'
          : 'Editor, admin or superadmin role required to edit',
    });
  }
  return getUserFromAuthHeader(req.headers.get('authorization')) as Obj;
}

function requireEdit(user: Obj, cls: Obj): void {
  if (!EDITOR_ROLES.has(user.role) && cls.owner_id !== user.id)
    fail(403, "You can't change this project.");
}

function loadPlan(db: ReturnType<typeof database>, projectId: string): Obj[] {
  const row = db.prepare('SELECT project_plan FROM lms_subjects WHERE id = ?').get(projectId) as
    Obj | undefined;
  let raw: unknown = [];
  try {
    raw = row?.project_plan ? JSON.parse(row.project_plan) : [];
  } catch {
    raw = [];
  }
  return qt.ensureIds(Array.isArray(raw) ? raw : []);
}

function savePlan(db: ReturnType<typeof database>, projectId: string, plan: Obj[]): void {
  const ts = now();
  db.prepare('UPDATE lms_subjects SET project_plan = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(plan),
    ts,
    projectId
  );
  // Lessons follow the outline order (modules, then their steps); lessons outside the outline go last.
  const planned: string[] = [];
  for (const m of plan) {
    if (m.lesson_id) planned.push(m.lesson_id);
    for (const s of m.sublessons || []) if (s.lesson_id) planned.push(s.lesson_id);
  }
  const current = (
    db
      .prepare(
        'SELECT id FROM lms_lessons WHERE subject_id = ? ORDER BY order_index ASC, created_at ASC'
      )
      .all(projectId) as Obj[]
  ).map((r) => r.id as string);
  const ordered = [
    ...planned.filter((i) => current.includes(i)),
    ...current.filter((i) => !planned.includes(i)),
  ];
  const upd = db.prepare('UPDATE lms_lessons SET order_index = ?, updated_at = ? WHERE id = ?');
  ordered.forEach((lid, idx) => upd.run(idx, ts, lid));
}

function result(cls: Obj, projectId: string, topicId: string, op: Obj, replayed: boolean): Obj {
  const db = database();
  const plan = loadPlan(db, projectId);
  const pos = qt.findTopic(plan, topicId);
  if (!pos) fail(404, 'That topic no longer exists in this project.');
  const section = plan[pos![0]];
  const topic = qt.topicView(section, section.sublessons[pos![1]]);
  const lessonRow = topic.lesson_id
    ? (db.prepare('SELECT id, slug, title FROM lms_lessons WHERE id = ?').get(topic.lesson_id) as
        Obj | undefined)
    : undefined;
  const lesson = lessonRow
    ? { id: lessonRow.id, slug: lessonRow.slug, title: lessonRow.title }
    : null;
  const { project } = projectOr404(projectId);
  return {
    topic,
    lesson,
    lesson_url: lesson ? `/ai-lms/classes/${cls.slug}/${project.slug}/${lesson.slug}` : null,
    operation: { id: op.id, status: 'done' },
    replayed,
    project,
  };
}

// ── Operation claim / fail / commit ───────────────────────────────────────────────

function claim(
  opId: string,
  projectId: string,
  userId: number,
  hash: string
): ['run' | 'done' | 'busy' | 'conflict', Obj] {
  return tx((db) => {
    const row = db.prepare('SELECT * FROM lms_topic_operations WHERE id = ?').get(opId) as
      Obj | undefined;
    const ts = now();
    if (row) {
      if (row.project_id !== projectId || row.request_hash !== hash) return ['conflict', row];
      if (row.status === 'done') return ['done', row];
      const fresh = (Date.now() - Date.parse(row.updated_at)) / 1000 < BUSY_SECONDS;
      if (row.status === 'generating' && fresh) return ['busy', row];
      db.prepare(
        "UPDATE lms_topic_operations SET status = 'generating', error = NULL, updated_at = ? WHERE id = ?"
      ).run(ts, opId);
    } else {
      db.prepare(
        'INSERT INTO lms_topic_operations (id, project_id, user_id, request_hash, status, created_at, updated_at) ' +
          "VALUES (?, ?, ?, ?, 'generating', ?, ?)"
      ).run(opId, projectId, userId, hash, ts, ts);
    }
    return ['run', db.prepare('SELECT * FROM lms_topic_operations WHERE id = ?').get(opId) as Obj];
  });
}

function markFailed(opId: string, message: string): void {
  database()
    .prepare(
      "UPDATE lms_topic_operations SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status != 'done'"
    )
    .run(message.slice(0, 500), now(), opId);
}

function commit(a: {
  opId: string;
  clsId: string;
  projectId: string;
  sectionId: string;
  topicId: string;
  title: string;
  userInput: string;
  inputType: string;
  html: string;
  summary: string;
  minutes: number;
}): { op: Obj; replayed: boolean } {
  return tx((db) => {
    const op = db.prepare('SELECT * FROM lms_topic_operations WHERE id = ?').get(a.opId) as Obj;
    if (op.status === 'done') return { op, replayed: true };
    const plan = loadPlan(db, a.projectId);
    const ts = now();
    let section: Obj;
    let item: Obj;
    let pos: [number, number] | null = null;
    if (a.topicId) {
      pos = qt.findTopic(plan, a.topicId);
      if (!pos) fail(404, 'That topic no longer exists in this project.');
      section = plan[pos![0]];
      item = { ...section.sublessons[pos![1]] };
    } else {
      if (a.sectionId) {
        const found = plan.find((m) => m.id === a.sectionId);
        if (!found) fail(422, 'That section is not part of this project.');
        section = found!;
      } else {
        let found = qt.findQuestionsSection(plan);
        if (!found) {
          found = {
            id: 's-' + crypto.randomBytes(6).toString('hex'),
            kind: 'questions',
            title: qt.USER_QUESTIONS_SECTION,
            focus: qt.USER_QUESTIONS_FOCUS,
            context: '',
            lesson_id: null,
            sublessons: [],
            videos: [],
          };
          plan.push(found);
        }
        section = found;
      }
      item = {
        id: 'q-' + crypto.randomBytes(6).toString('hex'),
        kind: 'question',
        input_type: a.inputType,
        original_input: a.userInput,
        title: a.title,
        focus: '',
        context: '',
        lesson_id: null,
        sublessons: [],
        videos: [],
        version: 0,
        created_at: ts,
      };
    }
    const existing = db
      .prepare('SELECT id FROM lms_lessons WHERE id = ?')
      .get(item.lesson_id || '') as Obj | undefined;
    let lessonId: string;
    if (existing) {
      db.prepare(
        'UPDATE lms_lessons SET title = ?, generated_html = ?, summary = ?, read_time_minutes = ?, updated_at = ? WHERE id = ?'
      ).run(a.title, a.html, a.summary, a.minutes, ts, existing.id);
      lessonId = existing.id;
    } else {
      lessonId = `lesson-${crypto.randomBytes(4).toString('hex')}`;
      const base = slugify(a.title) || 'item';
      let slug = base;
      for (let n = 1; db.prepare('SELECT 1 FROM lms_lessons WHERE slug = ?').get(slug); n++)
        slug = `${base}-${n}`;
      const order = (
        db
          .prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM lms_lessons WHERE subject_id = ?'
          )
          .get(a.projectId) as Obj
      ).n;
      db.prepare(
        'INSERT INTO lms_lessons (id, class_id, subject_id, title, slug, order_index, source_type, source_content, ' +
          'generated_html, summary, read_time_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        lessonId,
        a.clsId,
        a.projectId,
        a.title,
        slug,
        order,
        'project-question',
        a.userInput,
        a.html,
        a.summary,
        a.minutes,
        ts,
        ts
      );
    }
    Object.assign(item, {
      title: a.title,
      lesson_id: lessonId,
      version: Number(item.version || 0) + 1,
      updated_at: ts,
    });
    if (pos) section!.sublessons[pos[1]] = item;
    else section!.sublessons = [...(section!.sublessons || []), item];
    savePlan(db, a.projectId, plan);
    db.prepare(
      "UPDATE lms_topic_operations SET status = 'done', topic_id = ?, lesson_id = ?, error = NULL, updated_at = ? WHERE id = ?"
    ).run(item.id, lessonId, ts, a.opId);
    return {
      op: { ...op, status: 'done', topic_id: item.id, lesson_id: lessonId },
      replayed: false,
    };
  });
}

function update(
  projectId: string,
  topicId: string,
  title: string | null,
  sectionId: string | null,
  baseVersion: number | null
): [number, Obj] {
  return tx((db) => {
    const plan = loadPlan(db, projectId);
    const pos = qt.findTopic(plan, topicId);
    if (!pos) return [404, { detail: 'That topic no longer exists in this project.' }];
    const [mi, sj] = pos;
    const item = { ...plan[mi].sublessons[sj] };
    const current = Number(item.version || 1);
    if (baseVersion !== null && baseVersion !== current) {
      return [
        409,
        {
          detail:
            'This topic was changed somewhere else since you opened it. Reload to see the latest version.',
          topic: qt.topicView(plan[mi], item),
        },
      ];
    }
    let changed = false;
    if (title !== null && title !== item.title) {
      item.title = title;
      changed = true;
      if (item.lesson_id)
        db.prepare('UPDATE lms_lessons SET title = ?, updated_at = ? WHERE id = ?').run(
          title,
          now(),
          item.lesson_id
        );
    }
    let dest = mi;
    if (sectionId !== null && sectionId !== plan[mi].id) {
      dest = plan.findIndex((m) => m.id === sectionId);
      if (dest < 0) return [422, { detail: 'That section is not part of this project.' }];
      changed = true;
    }
    if (changed) {
      item.version = current + 1;
      item.updated_at = now();
      if (dest === mi) plan[mi].sublessons[sj] = item;
      else {
        plan[mi].sublessons = plan[mi].sublessons.filter((_: Obj, k: number) => k !== sj);
        plan[dest].sublessons = [...(plan[dest].sublessons || []), item]; // appended: manual order stays
      }
      savePlan(db, projectId, plan);
    }
    return [200, { topic: qt.topicView(plan[dest], item) }];
  });
}

function remove(projectId: string, topicId: string): [number, Obj] {
  return tx((db) => {
    const plan = loadPlan(db, projectId);
    const pos = qt.findTopic(plan, topicId);
    if (!pos) return [404, { detail: 'That topic no longer exists in this project.' }];
    const [mi, sj] = pos;
    const item = plan[mi].sublessons[sj];
    plan[mi].sublessons = plan[mi].sublessons.filter((_: Obj, k: number) => k !== sj);
    if (item.lesson_id) db.prepare('DELETE FROM lms_lessons WHERE id = ?').run(item.lesson_id);
    savePlan(db, projectId, plan);
    return [200, { status: 'deleted', id: topicId }];
  });
}

// ── Validation (same texts as the Python twin) ────────────────────────────────────

function validInput(value: unknown): string {
  const text = qt.cleanText(value, qt.INPUT_MAX + 1);
  if (!text || Array.from(text).length > qt.INPUT_MAX)
    fail(422, 'Enter a question or topic (up to 2000 characters).');
  return text;
}

function validTitle(value: unknown): string {
  const title = qt.cleanLine(value, qt.TITLE_MAX + 1);
  if (!title || Array.from(title).length > qt.TITLE_MAX)
    fail(422, 'Title is required (up to 120 characters).');
  return title;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function respond(fn: () => Promise<Obj | Response>): Promise<Response> {
  return fn()
    .then((body) => (body instanceof Response ? body : NextResponse.json(body)))
    .catch((err) => {
      if (err instanceof HttpError) return NextResponse.json(err.body, { status: err.status });
      if (err instanceof SyncUnavailableError)
        return NextResponse.json({ detail: err.message }, { status: 503 });
      console.error('[question-topics]', err);
      return NextResponse.json({ detail: 'Something went wrong. Try again.' }, { status: 500 });
    });
}

// ── Handlers ──────────────────────────────────────────────────────────────────────

async function previewImpl(req: Request, projectId: string): Promise<Response> {
  return respond(async () => {
    const user = authUser(req);
    const { cls, project } = projectOr404(projectId);
    requireEdit(user, cls);
    const body = (await req.json().catch(() => ({}))) as Obj;
    const userInput = validInput(body.input);
    const plan = qt.ensureIds(project.project_plan || []);
    let parsed: unknown;
    try {
      const raw = await callAIText(
        qt.buildPreviewPrompt(project, plan, userInput),
        body,
        PREVIEW_TIMEOUT_MS,
        1024
      );
      parsed = qt.parseJsonObject(raw);
    } catch {
      fail(502, 'The AI could not suggest a title and section. Edit them yourself or try again.');
    }
    return { ...qt.normalizePreview(parsed, plan, userInput), sections: qt.sectionChoices(plan) };
  });
}

async function generateImpl(req: Request, projectId: string): Promise<Response> {
  const pristine = req.clone();
  return respond(async () => {
    const user = authUser(req);
    const { cls, project } = projectOr404(projectId);
    requireEdit(user, cls);
    const body = (await req.json().catch(() => ({}))) as Obj;
    const opId = str(body.operation_id);
    if (!OP_ID_RE.test(opId)) fail(422, 'operation_id is required (8-64 letters, digits, - or _).');
    const userInput = validInput(body.input);
    const title = validTitle(body.title);
    const inputType =
      body.input_type === 'question' || body.input_type === 'topic'
        ? body.input_type
        : qt.guessInputType(userInput);
    const sectionId = str(body.section_id).trim();
    const topicId = str(body.topic_id).trim();
    const guiding = qt.cleanLine(body.guiding_question, 300);

    const plan = qt.ensureIds(project.project_plan || []);
    let sectionTitle: string;
    if (topicId) {
      const pos = qt.findTopic(plan, topicId);
      if (!pos) fail(404, 'That topic no longer exists in this project.');
      sectionTitle = plan[pos![0]].title || '';
    } else if (sectionId) {
      const section = plan.find((m) => m.id === sectionId);
      if (!section) fail(422, 'That section is not part of this project.');
      sectionTitle = section!.title || '';
    } else {
      sectionTitle = qt.USER_QUESTIONS_SECTION;
    }

    const hash = qt.requestHash(projectId, userInput, inputType, title, sectionId, topicId);
    const [state, op] = await runSyncedWrite(() => claim(opId, projectId, user.id, hash), {
      replay: pristine,
    });
    if (state === 'conflict')
      fail(409, 'This operation id was already used for a different request.');
    if (state === 'busy') {
      return NextResponse.json(
        {
          detail: 'This lesson is still being generated.',
          operation: { id: op.id, status: 'generating' },
        },
        { status: 409 }
      );
    }
    if (state === 'done') return result(cls, projectId, op.topic_id, op, true);

    let prompt = qt.buildLessonPrompt(
      project,
      plan,
      sectionTitle,
      userInput,
      inputType,
      title,
      guiding
    );
    let lesson: Obj | null = null;
    let error = 'The AI could not write this lesson. Your input is kept; try again.';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callAIText(prompt, body, LESSON_TIMEOUT_MS, 8000);
        lesson = qt.normalizeLesson(qt.parseJsonObject(raw), inputType, guiding);
        break;
      } catch (err) {
        if (err instanceof qt.LessonShapeError) {
          error = err.message;
          prompt =
            qt.buildLessonPrompt(
              project,
              plan,
              sectionTitle,
              userInput,
              inputType,
              title,
              guiding
            ) + `\n\nYour previous reply was rejected: ${error} Return the complete JSON object.`;
        } else {
          error = 'The AI could not write this lesson. Your input is kept; try again.';
        }
      }
    }
    if (!lesson) {
      await runSyncedWrite(() => markFailed(opId, error));
      fail(502, error);
    }
    const html = qt.renderLessonHtml(
      lesson!,
      title,
      userInput,
      inputType,
      project.name,
      sectionTitle,
      PREMIUM_DESIGN_TOKENS_CSS
    );
    const saved = await runSyncedWrite(
      () =>
        commit({
          opId,
          clsId: cls.id,
          projectId,
          sectionId,
          topicId,
          title,
          userInput,
          inputType,
          html,
          summary: qt.lessonSummary(lesson!, title),
          minutes: qt.readMinutes(lesson!),
        }),
      { replay: pristine }
    );
    return result(cls, projectId, saved.op.topic_id, saved.op, saved.replayed);
  });
}

async function operationImpl(req: Request, projectId: string, opId: string): Promise<Response> {
  return respond(async () => {
    const user = authUser(req);
    const { cls } = projectOr404(projectId);
    const row = database()
      .prepare('SELECT * FROM lms_topic_operations WHERE id = ? AND project_id = ?')
      .get(opId, projectId) as Obj | undefined;
    if (!row || (row.user_id !== user.id && !EDITOR_ROLES.has(user.role)))
      fail(404, 'Operation not found.');
    if (row!.status === 'done') return result(cls, projectId, row!.topic_id, row!, true);
    return { operation: { id: row!.id, status: row!.status, error: row!.error } };
  });
}

async function updateImpl(req: Request, projectId: string, topicId: string): Promise<Response> {
  return respond(async () => {
    const user = authUser(req);
    const { cls } = projectOr404(projectId);
    requireEdit(user, cls);
    const body = (await req.json().catch(() => ({}))) as Obj;
    const title = body.title === undefined || body.title === null ? null : validTitle(body.title);
    const sectionId = typeof body.section_id === 'string' ? body.section_id.trim() : null;
    const baseVersion = Number.isInteger(body.base_version) ? (body.base_version as number) : null;
    const [status, out] = update(projectId, topicId, title, sectionId, baseVersion);
    if (status !== 200) return NextResponse.json(out, { status });
    return { ...out, project: projectOr404(projectId).project };
  });
}

async function deleteImpl(req: Request, projectId: string, topicId: string): Promise<Response> {
  return respond(async () => {
    const user = authUser(req);
    const { cls } = projectOr404(projectId);
    requireEdit(user, cls);
    const [status, out] = remove(projectId, topicId);
    return status === 200 ? out : NextResponse.json(out, { status });
  });
}

// Generate is self-synced (its AI call must not hold the sync lock); the read wrapper only pulls first.
export const handlePreviewQuestionTopic = withNeonRead(previewImpl);
export const handleGenerateQuestionTopic = withNeonRead(withClassFolderSync(generateImpl));
export const handleGetQuestionTopicOperation = withNeonRead(operationImpl);
export const handleUpdateQuestionTopic = withNeonSync(withClassFolderSync(updateImpl));
export const handleDeleteQuestionTopic = withNeonSync(withClassFolderSync(deleteImpl));
