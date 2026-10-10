/**
 * fe-apis/todo/importData/handlers.ts
 *
 * Port of backend/modules/ai_todo/import_data/router.py -- keep the two in sync.
 * Guest -> account migration: bulk-imports the browser-local (IndexedDB) dataset that
 * src/lib/services/migration.ts sends, in one transaction so a partial failure can't
 * half-populate the account. Client ids are remapped to server ids and the mapping returned.
 */

import { HttpError, withTodoDb, type Row } from '../_shared';
import { pyJsonDumps } from '../py';
import type { TodoRoute } from '../router';

// ── Pydantic-style request validation (ImportRequest and its nested models) ──

type Kind = 'str' | 'int' | 'float' | 'bool';

const REQUIRED = Symbol('required');
const KIND_NAMES: Record<Kind, string> = { str: 'string', int: 'integer', float: 'number', bool: 'boolean' };
const BOOL_STRINGS = new Map<string, boolean>([
  ['1', true], ['on', true], ['t', true], ['true', true], ['y', true], ['yes', true],
  ['0', false], ['off', false], ['f', false], ['false', false], ['n', false], ['no', false],
]);

function invalid(loc: string, msg: string): never {
  throw new HttpError(422, `${loc}: ${msg}`);
}

/** Pydantic (lax mode) scalar coercion; anything else is a 422. */
function scalar(value: unknown, kind: Kind, loc: string): any {
  if (kind === 'str' && typeof value === 'string') return value;
  if (kind === 'int') {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^\s*[-+]?\d+\s*$/.test(value)) return parseInt(value, 10);
  }
  if (kind === 'float') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  if (kind === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 1) return value === 1;
    if (typeof value === 'string' && BOOL_STRINGS.has(value.toLowerCase())) return BOOL_STRINGS.get(value.toLowerCase());
  }
  return invalid(loc, `Input should be a valid ${KIND_NAMES[kind]}`);
}

function object(value: unknown, loc: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(loc, 'Input should be a valid dictionary or object');
  }
  return value as Row;
}

/** One model field: REQUIRED → `x: T`; null → `x: Optional[T] = None`; else → `x: T = default`. */
function field(o: Row, loc: string, key: string, kind: Kind, dflt: unknown = REQUIRED): any {
  const value = o[key];
  if (value === undefined) {
    if (dflt === REQUIRED) invalid(`${loc}.${key}`, 'Field required');
    return dflt;
  }
  if (value === null && dflt === null) return null;
  return scalar(value, kind, `${loc}.${key}`);
}

/** `x: List[...] = []` (or `Optional[List[...]] = None` when `nullable`). */
function list(o: Row, loc: string, key: string, nullable = false): unknown[] | null {
  const value = o[key];
  if (value === undefined) return nullable ? null : [];
  if (value === null && nullable) return null;
  if (!Array.isArray(value)) invalid(`${loc}.${key}`, 'Input should be a valid list');
  return value;
}

function models<T>(o: Row, loc: string, key: string, parse: (item: unknown, loc: string) => T): T[] {
  return (list(o, loc, key) as unknown[]).map((item, i) => parse(item, `${loc}.${key}.${i}`));
}

interface ImportNote { client_id: number | null; content: string; note_type: string; created_at: string | null }

function importNote(raw: unknown, loc: string): ImportNote {
  const o = object(raw, loc);
  return {
    client_id: field(o, loc, 'client_id', 'int', null),
    content: field(o, loc, 'content', 'str'),
    note_type: field(o, loc, 'note_type', 'str', 'manual'),
    created_at: field(o, loc, 'created_at', 'str', null),
  };
}

function importTask(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  const attachments = list(o, loc, 'attachments', true);
  return {
    client_id: field(o, loc, 'client_id', 'int'),
    parent_client_id: field(o, loc, 'parent_client_id', 'int', null),
    title: field(o, loc, 'title', 'str'),
    status: field(o, loc, 'status', 'str', 'backlog'),
    priority: field(o, loc, 'priority', 'str', 'p3'),
    time_estimate: field(o, loc, 'time_estimate', 'str', null),
    due_date: field(o, loc, 'due_date', 'str', null),
    context: field(o, loc, 'context', 'str', null),
    intention: field(o, loc, 'intention', 'str', null),
    definition_of_done: field(o, loc, 'definition_of_done', 'str', null),
    is_recurring: field(o, loc, 'is_recurring', 'bool', false),
    recurrence_interval: field(o, loc, 'recurrence_interval', 'str', null),
    eisenhower_quadrant: field(o, loc, 'eisenhower_quadrant', 'str', null),
    attachments: attachments && attachments.map((a, i) => scalar(a, 'str', `${loc}.attachments.${i}`)),
    created_at: field(o, loc, 'created_at', 'str', null),
    updated_at: field(o, loc, 'updated_at', 'str', null),
    notes: models(o, loc, 'notes', importNote),
  };
}

function importProjectNode(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  return {
    client_id: field(o, loc, 'client_id', 'int'),
    parent_client_id: field(o, loc, 'parent_client_id', 'int', null),
    title: field(o, loc, 'title', 'str'),
    node_type: field(o, loc, 'node_type', 'str', 'topic'),
    order_index: field(o, loc, 'order_index', 'int', 0),
    context: field(o, loc, 'context', 'str', null),
    due_date: field(o, loc, 'due_date', 'str', null),
    time_estimate: field(o, loc, 'time_estimate', 'str', null),
    created_at: field(o, loc, 'created_at', 'str', null),
  };
}

function importProject(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  return {
    client_id: field(o, loc, 'client_id', 'int'),
    title: field(o, loc, 'title', 'str'),
    description: field(o, loc, 'description', 'str', null),
    status: field(o, loc, 'status', 'str', 'active'),
    priority: field(o, loc, 'priority', 'str', 'p3'),
    color: field(o, loc, 'color', 'str', null),
    icon: field(o, loc, 'icon', 'str', null),
    due_date: field(o, loc, 'due_date', 'str', null),
    created_at: field(o, loc, 'created_at', 'str', null),
    nodes: models(o, loc, 'nodes', importProjectNode),
  };
}

function importQuickTask(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  return {
    client_id: field(o, loc, 'client_id', 'int'),
    title: field(o, loc, 'title', 'str'),
    done: field(o, loc, 'done', 'bool', false),
    quadrant: field(o, loc, 'quadrant', 'str', 'do_now'),
    date: field(o, loc, 'date', 'str'),
    source: field(o, loc, 'source', 'str', 'manual'),
    created_at: field(o, loc, 'created_at', 'str', null),
  };
}

function importDailyPlan(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  let reasoning: Record<string, string> | null = null;
  if (o.reasoning !== undefined && o.reasoning !== null) {
    reasoning = {};
    for (const [k, v] of Object.entries(object(o.reasoning, `${loc}.reasoning`))) {
      reasoning[k] = scalar(v, 'str', `${loc}.reasoning.${k}`);
    }
  }
  return {
    date: field(o, loc, 'date', 'str'),
    available_hours: field(o, loc, 'available_hours', 'float'),
    task_client_ids: (list(o, loc, 'task_client_ids') as unknown[]).map((v, i) =>
      scalar(v, 'int', `${loc}.task_client_ids.${i}`)
    ),
    reasoning,
  };
}

function importInboxItem(raw: unknown, loc: string): Row {
  const o = object(raw, loc);
  return { content: field(o, loc, 'content', 'str') };
}

// ── Python-compatible values ────────────────────────────────────────────────

/** Port of `_now`: `datetime.utcnow().isoformat()` (UTC, microseconds, no suffix). */
function now(): string {
  return `${new Date().toISOString().slice(0, 23)}000`;
}

// ── Route ────────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  /** POST /todo/import — import_guest_data. */
  {
    method: 'POST',
    path: '/import',
    handler: async (ctx) => {
      const body = object(await ctx.json(), 'body');
      const payload = {
        tasks: models(body, 'body', 'tasks', importTask),
        projects: models(body, 'body', 'projects', importProject),
        quick_tasks: models(body, 'body', 'quick_tasks', importQuickTask),
        daily_plans: models(body, 'body', 'daily_plans', importDailyPlan),
        inbox: models(body, 'body', 'inbox', importInboxItem),
      };
      const userId = ctx.userId;
      const idMap = {
        tasks: new Map<number, number>(),
        projects: new Map<number, number>(),
        quick_tasks: new Map<number, number>(),
      };

      withTodoDb((db) =>
        db.transaction(() => {
          // ── Tasks: insert parents before children (topological, like bulk_save) ──
          const unprocessed = [...payload.tasks];
          const maxLoops = unprocessed.length * 3 + 1;
          let loops = 0;
          while (unprocessed.length && loops < maxLoops) {
            loops += 1;
            const current = unprocessed.shift()!;
            if (current.parent_client_id !== null && !idMap.tasks.has(current.parent_client_id)) {
              unprocessed.push(current);
              continue;
            }

            const parentId = current.parent_client_id !== null ? idMap.tasks.get(current.parent_client_id)! : null;
            let depthLevel = 1;
            if (parentId !== null) {
              const row = db.get('SELECT depth_level FROM tasks WHERE id = ?', parentId);
              depthLevel = row ? row.depth_level + 1 : 1;
            }

            const ts = now();
            const serverId = db.run(
              `INSERT INTO tasks (
                user_id, parent_id, title, status, priority, time_estimate, due_date,
                generation_type, depth_level, context, attachments, created_at, updated_at,
                last_activity_at, is_recurring, recurrence_interval, intention,
                definition_of_done, eisenhower_quadrant
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              userId, parentId, current.title, current.status, current.priority,
              current.time_estimate, current.due_date, depthLevel, current.context,
              current.attachments && current.attachments.length ? pyJsonDumps(current.attachments) : null,
              current.created_at || ts, current.updated_at || ts, ts,
              current.is_recurring ? 1 : 0, current.recurrence_interval,
              current.intention, current.definition_of_done, current.eisenhower_quadrant
            ).lastInsertRowid;
            idMap.tasks.set(current.client_id, serverId);

            for (const note of current.notes as ImportNote[]) {
              db.run(
                'INSERT INTO task_notes (task_id, user_id, content, note_type, created_at) VALUES (?, ?, ?, ?, ?)',
                serverId, userId, note.content, note.note_type, note.created_at || ts
              );
            }
          }

          // Any tasks whose parent_client_id never resolved (bad/missing reference):
          // import as root-level rather than silently dropping the user's data.
          for (const orphan of unprocessed) {
            const ts = now();
            const res = db.run(
              `INSERT INTO tasks (user_id, parent_id, title, status, priority, generation_type, depth_level, created_at, updated_at, last_activity_at)
              VALUES (?, NULL, ?, ?, ?, 'manual', 1, ?, ?, ?)`,
              userId, orphan.title, orphan.status, orphan.priority, ts, ts, ts
            );
            idMap.tasks.set(orphan.client_id, res.lastInsertRowid);
          }

          // ── Projects + nodes ──────────────────────────────────────────────────
          for (const proj of payload.projects) {
            const ts = now();
            const projectId = db.run(
              `INSERT INTO projects (user_id, title, description, status, priority, color, icon, due_date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              userId, proj.title, proj.description, proj.status, proj.priority, proj.color, proj.icon,
              proj.due_date, proj.created_at || ts
            ).lastInsertRowid;
            idMap.projects.set(proj.client_id, projectId);

            const nodeIdMap = new Map<number, number>();
            const unprocessedNodes = [...(proj.nodes as Row[])];
            let nodeLoops = 0;
            const nodeMaxLoops = unprocessedNodes.length * 3 + 1;
            while (unprocessedNodes.length && nodeLoops < nodeMaxLoops) {
              nodeLoops += 1;
              const node = unprocessedNodes.shift()!;
              if (node.parent_client_id !== null && !nodeIdMap.has(node.parent_client_id)) {
                unprocessedNodes.push(node);
                continue;
              }

              const parentNodeId = node.parent_client_id !== null ? nodeIdMap.get(node.parent_client_id)! : null;
              let depthLevel = 1;
              if (parentNodeId !== null) {
                const row = db.get('SELECT depth_level FROM project_nodes WHERE id = ?', parentNodeId);
                depthLevel = row ? row.depth_level + 1 : 1;
              }

              const nodeTs = now();
              const res = db.run(
                `INSERT INTO project_nodes (
                  user_id, project_id, parent_node_id, title, node_type, generation_type,
                  depth_level, order_index, context, due_date, time_estimate, created_at
                ) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)`,
                userId, projectId, parentNodeId, node.title, node.node_type,
                depthLevel, node.order_index, node.context, node.due_date,
                node.time_estimate, node.created_at || nodeTs
              );
              nodeIdMap.set(node.client_id, res.lastInsertRowid);
            }
          }

          // ── Quick tasks ───────────────────────────────────────────────────────
          for (const qt of payload.quick_tasks) {
            const ts = now();
            const res = db.run(
              `INSERT INTO quick_tasks (user_id, title, done, quadrant, date, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
              userId, qt.title, qt.done ? 1 : 0, qt.quadrant, qt.date, qt.source, qt.created_at || ts
            );
            idMap.quick_tasks.set(qt.client_id, res.lastInsertRowid);
          }

          // ── Daily plans (remap task_client_ids -> server task ids) ──────────────
          for (const plan of payload.daily_plans) {
            const resolvedTaskIds = (plan.task_client_ids as number[])
              .filter((cid) => idMap.tasks.has(cid))
              .map((cid) => idMap.tasks.get(cid)!);
            const reasoning = plan.reasoning || {};
            const ts = now();
            db.run(
              `INSERT INTO daily_plans (user_id, plan_date, available_hours, task_ids, reasoning, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, plan_date) DO UPDATE SET
                available_hours = excluded.available_hours,
                task_ids = excluded.task_ids,
                reasoning = excluded.reasoning,
                updated_at = excluded.updated_at`,
              userId, plan.date, plan.available_hours, pyJsonDumps(resolvedTaskIds), pyJsonDumps(reasoning), ts, ts
            );
          }

          // ── Inbox ────────────────────────────────────────────────────────────
          for (const item of payload.inbox) {
            db.run('INSERT INTO inbox (user_id, content, created_at) VALUES (?, ?, ?)', userId, item.content, now());
          }
        })
      );

      const asObject = (m: Map<number, number>) => Object.fromEntries([...m].map(([k, v]) => [String(k), v]));
      return {
        id_map: {
          tasks: asObject(idMap.tasks),
          projects: asObject(idMap.projects),
          quick_tasks: asObject(idMap.quick_tasks),
        },
        imported: {
          tasks: idMap.tasks.size,
          projects: idMap.projects.size,
          quick_tasks: idMap.quick_tasks.size,
          daily_plans: payload.daily_plans.length,
          inbox: payload.inbox.length,
        },
      };
    },
  },
];
