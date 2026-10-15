/**
 * fe-apis/todo/pareto/handlers.ts
 *
 * Port of backend/modules/ai_todo/pareto/router.py (80/20 analysis across Smart To-Do,
 * Quick Daily and Plan & Project) -- keep the two in sync. Mounted at /pareto, not /todo.
 *
 * Manually-pinned items (pareto_locked=1) are skipped by the bulk /analyze sweep; the
 * single-item /reanalyze is an explicit user action, so it unlocks + re-scores.
 */

import {
  HttpError,
  aiSettings,
  callAi,
  extractJsonItems,
  todayIso,
  withTodoDb,
  type Row,
  type TodoDb,
} from '../_shared';
import { pyJsonDumps } from '../py';
import type { TodoCtx, TodoRoute } from '../router';

const VALID_TABLES = ['tasks', 'quick_tasks', 'project_nodes', 'projects'];

/** `AnalyzeRequest(AISettings)` — `scope: str = "all"` ("smart", "quick", "plan" or "all"). */
async function analyzeRequest(ctx: TodoCtx): Promise<{ body: Row; scope: string }> {
  const body = await ctx.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'body: Input should be a valid dictionary or object');
  }
  const scope = body.scope === undefined ? 'all' : body.scope;
  if (typeof scope !== 'string') throw new HttpError(422, 'body.scope: Input should be a valid string');
  return { body, scope };
}

/** Port of `_fetch_scope_items`: un-locked, not-done items for the scope, owned by userId. */
function fetchScopeItems(db: TodoDb, scope: string, userId: number): Row[] {
  const items: Row[] = [];

  if (scope === 'smart' || scope === 'all') {
    const rows = db.all(
      'SELECT id, title, priority, due_date, intention, definition_of_done, time_estimate ' +
        "FROM tasks WHERE user_id = ? AND status != 'done' AND (pareto_locked IS NULL OR pareto_locked = 0)",
      userId
    );
    for (const r of rows) {
      items.push({
        table: 'tasks', id: r.id, title: r.title, priority: r.priority,
        due_date: r.due_date, intention: r.intention, definition_of_done: r.definition_of_done,
        time_estimate: r.time_estimate,
      });
    }
  }

  if (scope === 'quick' || scope === 'all') {
    const rows = db.all(
      'SELECT id, title, quadrant FROM quick_tasks ' +
        'WHERE user_id = ? AND date = ? AND done = 0 AND (pareto_locked IS NULL OR pareto_locked = 0)',
      userId,
      todayIso()
    );
    for (const r of rows) {
      items.push({ table: 'quick_tasks', id: r.id, title: r.title, quadrant: r.quadrant });
    }
  }

  if (scope === 'plan' || scope === 'all') {
    // Aliased: rows are keyed by column name, and Python reads n.title / p.title by index.
    const nodeRows = db.all(
      'SELECT n.id, n.title, p.title AS project_title, p.priority AS project_priority ' +
        'FROM project_nodes n JOIN projects p ON n.project_id = p.id ' +
        "WHERE p.status = 'active' AND n.user_id = ? AND p.user_id = ? " +
        'AND (n.pareto_locked IS NULL OR n.pareto_locked = 0)',
      userId,
      userId
    );
    for (const r of nodeRows) {
      items.push({
        table: 'project_nodes', id: r.id, title: r.title,
        project_title: r.project_title, project_priority: r.project_priority,
      });
    }

    const projectRows = db.all(
      'SELECT id, title, priority, due_date, description FROM projects ' +
        "WHERE user_id = ? AND status = 'active' AND (pareto_locked IS NULL OR pareto_locked = 0)",
      userId
    );
    for (const r of projectRows) {
      items.push({
        table: 'projects', id: r.id, title: r.title, priority: r.priority,
        due_date: r.due_date, description: Array.from(String(r.description || '')).slice(0, 150).join(''),
      });
    }
  }

  return items;
}

function top20Rows(db: TodoDb, sql: string, table: string, userId: number): Row[] {
  return db.all(sql, userId).map((r) => ({
    id: r.id, title: r.title, pareto_score: r.pareto_score, reason: r.pareto_reason,
    locked: Boolean(r.pareto_locked), table,
  }));
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One analysis scores at most this many items (a bigger scope is trimmed, as it always was). */
const BATCH_LIMIT = 60;
/** If a reply is cut off, the items it never reached are sent again, at most this many calls in all. */
const MAX_PASSES = 3;

/**
 * Output budget for scoring `count` items in one reply. A scored item is ~45-60 output tokens (a pretty-printed JSON
 * object plus a one-line reason). The default 2,048 holds only ~35 of them: past that every provider silently cuts the
 * reply off mid-array, and the answer used to fail with "No JSON array found in response" although most of the scores
 * were already there. (Port of `_analysis_max_tokens`.)
 */
function analysisMaxTokens(count: number): number {
  return Math.min(6000, 600 + 80 * count);
}

/** Port of `_analysis_prompt`. */
function analysisPrompt(batch: Row[]): string {
  return `You are a productivity strategist applying the 80/20 Pareto Principle.
Analyze these tasks and identify which 20% will produce 80% of meaningful results.
Consider: strategic impact, dependency (other tasks blocked on this), alignment with stated
intentions, urgency vs importance, and which tasks remove the most friction.

Tasks:
${pyJsonDumps(batch, 2)}

For each task return a pareto_score between 0.0 and 1.0 and a short reason (at most 12 words).
is_top_20 should be true ONLY for roughly the top ${Math.max(1, Math.floor(batch.length / 5))} tasks in this list.
Return ONLY a JSON array with one object per task, no markdown and no extra text:
[
  { "table": "tasks", "id": 1, "pareto_score": 0.92, "is_top_20": true, "reason": "Unblocks 4 other tasks" }
]`;
}

/**
 * Port of `_result_key`: the (table, id) a scored result refers to. Models drop or mangle `table`; when the id is
 * unique in the batch that is enough to tell which item was meant.
 */
function resultKey(res: Row, pending: Row[]): [string, number] | null {
  if (res.id === null || res.id === undefined || res.id === '') return null;
  const n = Number(res.id);
  if (!Number.isFinite(n)) return null;
  const tid = Math.trunc(n);
  let table = res.table;
  if (!VALID_TABLES.includes(table)) {
    const tables = new Set(pending.filter((it) => it.id === tid).map((it) => it.table));
    table = tables.size === 1 ? [...tables][0] : null;
  }
  return table ? [table, tid] : null;
}

export const routes: TodoRoute[] = [
  /** POST /pareto/analyze — analyze_pareto_endpoint. */
  {
    method: 'POST',
    path: '/analyze',
    handler: async (ctx) => {
      const { body, scope } = await analyzeRequest(ctx);
      const items = withTodoDb((db) => fetchScopeItems(db, scope, ctx.userId));
      if (!items.length) return { results: [], message: 'No un-locked tasks to analyze in this scope.' };

      // Cap to avoid blowing the prompt token budget on very large scopes.
      const batch = items.slice(0, BATCH_LIMIT);
      const keyOf = (table: string, id: number) => `${table}:${id}`;
      const wanted = new Set(batch.map((it) => keyOf(it.table, it.id)));
      const scored = new Map<string, Row>();
      let pending = batch;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let found: Row[];
        let complete: boolean;
        try {
          ({ items: found, complete } = extractJsonItems(
            await callAi(analysisPrompt(pending), aiSettings(body), analysisMaxTokens(pending.length))
          ));
        } catch (err) {
          if (scored.size) break; // keep what the earlier passes scored; the gap is reported in the response
          throw new HttpError(500, `AI Pareto Analysis failed: ${errorText(err)}`);
        }
        const before = scored.size;
        for (const res of found) {
          const key = resultKey(res, pending);
          if (!key) continue;
          const id = keyOf(key[0], key[1]);
          if (wanted.has(id) && !scored.has(id)) scored.set(id, { ...res, table: key[0], id: key[1] });
        }
        pending = pending.filter((it) => !scored.has(keyOf(it.table, it.id)));
        // Go again only for a reply that was cut off and still got somewhere.
        if (complete || !pending.length || scored.size === before) break;
      }

      const results: Row[] = batch.filter((it) => scored.has(keyOf(it.table, it.id))).map((it) => scored.get(keyOf(it.table, it.id))!);
      if (!results.length) {
        throw new HttpError(500, "AI Pareto Analysis failed: the AI's reply had no score for any of these tasks");
      }

      withTodoDb((db) =>
        db.transaction(() => {
          for (const res of results) {
            const table = res.table;
            const tid = res.id;
            if (res.pareto_score === null || res.pareto_score === undefined) continue;
            const score = Number(res.pareto_score);
            if (!Number.isFinite(score)) continue;
            const top20 = res.is_top_20 ? 1 : 0;
            const reason = res.reason;
            if (VALID_TABLES.includes(table) && tid) {
              // table is re-checked against VALID_TABLES right before interpolation —
              // never build this query from an unvalidated table name.
              db.run(
                `UPDATE ${table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ? ` +
                  'WHERE id = ? AND user_id = ? AND (pareto_locked IS NULL OR pareto_locked = 0)',
                score,
                top20,
                reason,
                tid,
                ctx.userId
              );
            }
          }
        })
      );

      const top20Count = results.filter((r) => r.is_top_20).length;
      const response: Row = { results, analyzed_count: results.length, top20_count: top20Count };
      const missed = batch.length - results.length;
      if (missed > 0) {
        response.partial = true;
        response.message = `The AI scored ${results.length} of ${batch.length} items; run the analysis again to retry the other ${missed}.`;
      }
      return response;
    },
  },

  /** GET /pareto/top20 — get_top20_endpoint. */
  {
    method: 'GET',
    path: '/top20',
    handler: (ctx) =>
      withTodoDb((db) => {
        const smart = top20Rows(
          db,
          'SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM tasks ' +
            "WHERE user_id = ? AND is_top_20 = 1 AND status != 'done'",
          'tasks',
          ctx.userId
        );
        const quick = top20Rows(
          db,
          'SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM quick_tasks ' +
            'WHERE user_id = ? AND is_top_20 = 1 AND done = 0',
          'quick_tasks',
          ctx.userId
        );
        const plan = top20Rows(
          db,
          'SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM project_nodes WHERE user_id = ? AND is_top_20 = 1',
          'project_nodes',
          ctx.userId
        );
        plan.push(
          ...top20Rows(
            db,
            'SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM projects ' +
              "WHERE user_id = ? AND is_top_20 = 1 AND status = 'active'",
            'projects',
            ctx.userId
          )
        );
        return { smart, quick, plan };
      }),
  },

  /** POST /pareto/reanalyze/{table}/{item_id} — reanalyze_single_endpoint. */
  {
    method: 'POST',
    path: '/reanalyze/:table/:item_id',
    handler: async (ctx) => {
      const itemId = ctx.intParam('item_id');
      const { body } = await analyzeRequest(ctx);
      const table = ctx.params.table;
      if (!VALID_TABLES.includes(table)) throw new HttpError(400, 'Invalid table');

      const itemData = withTodoDb((db) => {
        const row = db.get(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, itemId, ctx.userId);
        if (!row) throw new HttpError(404, 'Item not found');
        return { ...row };
      });

      const prompt = `You are a productivity strategist. Evaluate this single task on a scale of 0.0 to 1.0 for its
Pareto (80/20) impact — strategic value, dependencies it unblocks, urgency vs importance, and friction removed.
A score > 0.8 means it is highly likely to be a Top 20% leverage task.

Task data:
${pyJsonDumps(itemData, 2)}

Return ONLY JSON:
[{ "pareto_score": 0.85, "is_top_20": true, "reason": "High impact due to..." }]
No extra text.`;

      let res: Row;
      try {
        const { items: results } = extractJsonItems(await callAi(prompt, aiSettings(body), 600));
        if (!results.length) throw new Error('No result returned');
        res = results[0];
        if (res.pareto_score === undefined || res.pareto_score === null) throw new Error("the AI's answer had no pareto_score");
      } catch (err) {
        throw new HttpError(500, `AI Pareto Analysis failed: ${errorText(err)}`);
      }

      const score = res.pareto_score ?? null;
      const top20 = res.is_top_20 ? 1 : 0;
      const reason = res.reason ?? null;

      withTodoDb((db) =>
        db.run(
          `UPDATE ${table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ?, pareto_locked = 0 WHERE id = ? AND user_id = ?`,
          score,
          top20,
          reason,
          itemId,
          ctx.userId
        )
      );

      return { status: 'success', pareto_score: score, is_top_20: Boolean(top20), reason };
    },
  },
];
