/**
 * fe-apis/todo/routines/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/routines/db.py -- keep the two in sync (same SQL, same dict shapes).
 * Tables (schema.ts): routine_groups (Dailies + the groups a user makes, e.g. Weekdays, Weekend, Deployment eve) and
 * routine_items (what you tick off in a group each day; done for a day when done_on equals that local date).
 */

import { withTodoDb, type Row } from '../_shared';

export const DAILIES_NAME = 'Dailies';

const GROUP_COLUMNS =
  'id, user_id, name, kind, days, active_on, order_index, created_at, updated_at';
const ITEM_COLUMNS =
  'id, user_id, group_id, title, priority, notes, done_on, order_index, created_at, updated_at';

// Columns the update functions may write (the PATCH fields; order_index only on a move between groups).
const GROUP_UPDATABLE = new Set(['name', 'days', 'active_on']);
const ITEM_UPDATABLE = new Set(['title', 'priority', 'notes', 'done_on', 'group_id']);

/** Port of `days_from_text`: '1,2,3,4,5' -> [1, 2, 3, 4, 5]; NULL/empty/garbage -> null. */
export function daysFromText(value: unknown): number[] | null {
  if (typeof value !== 'string' || !value) return null;
  const out: number[] = [];
  for (const raw of value.split(',')) {
    const part = raw.trim();
    if (/^[0-9]+$/.test(part) && Number(part) <= 6 && !out.includes(Number(part)))
      out.push(Number(part));
  }
  out.sort((a, b) => a - b);
  return out.length ? out : null;
}

/** Port of `days_to_text`. */
export function daysToText(days: number[] | null | undefined): string | null {
  return days && days.length ? days.map(String).join(',') : null;
}

function groupDict(row: Row): Row {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    days: daysFromText(row.days),
    active_on: row.active_on ?? null,
    order_index: row.order_index,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function itemDict(row: Row): Row {
  return {
    id: row.id,
    group_id: row.group_id,
    title: row.title,
    priority: row.priority,
    notes: row.notes ?? null,
    done_on: row.done_on ?? null,
    order_index: row.order_index,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Port of `ensure_dailies`: every user has a Dailies group; it is made the first time their routines are read. True
 * when it was made now. Looked up first, so an ordinary read writes nothing (an ignored INSERT would still use up an
 * id); the partial unique index makes a race between two first reads harmless.
 */
export function ensureDailies(userId: number): boolean {
  return withTodoDb((db) => {
    if (db.get("SELECT 1 FROM routine_groups WHERE user_id = ? AND kind = 'dailies'", userId))
      return false;
    return (
      db.run(
        "INSERT OR IGNORE INTO routine_groups (user_id, name, kind, order_index) VALUES (?, ?, 'dailies', 0)",
        userId,
        DAILIES_NAME
      ).changes > 0
    );
  });
}

/** Port of `list_groups`: Dailies first, then in the order they were made, each with its items. */
export function listGroups(userId: number): Row[] {
  ensureDailies(userId);
  return withTodoDb((db) => {
    const groups = db
      .all(
        `SELECT ${GROUP_COLUMNS} FROM routine_groups WHERE user_id = ? ` +
          "ORDER BY CASE kind WHEN 'dailies' THEN 0 ELSE 1 END, order_index ASC, id ASC",
        userId
      )
      .map(groupDict);
    const byGroup = new Map<number, Row[]>(groups.map((g) => [g.id as number, []]));
    for (const row of db.all(
      `SELECT ${ITEM_COLUMNS} FROM routine_items WHERE user_id = ? ORDER BY order_index ASC, id ASC`,
      userId
    )) {
      byGroup.get(row.group_id)?.push(itemDict(row));
    }
    for (const group of groups) group.items = byGroup.get(group.id) ?? [];
    return groups;
  });
}

export function getGroup(groupId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(
      `SELECT ${GROUP_COLUMNS} FROM routine_groups WHERE id = ? AND user_id = ?`,
      groupId,
      userId
    );
    return row ? groupDict(row) : null;
  });
}

export function countGroups(userId: number): number {
  return withTodoDb((db) =>
    Number(
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM routine_groups WHERE user_id = ?', userId)!.n
    )
  );
}

export function createGroup(
  userId: number,
  name: string,
  opts: { days?: number[] | null } = {}
): Row {
  return withTodoDb((db) => {
    const { lastInsertRowid } = db.run(
      "INSERT INTO routine_groups (user_id, name, kind, days, order_index) VALUES (?, ?, 'custom', ?, " +
        '(SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_groups WHERE user_id = ?))',
      userId,
      name,
      daysToText(opts.days ?? null),
      userId
    );
    const group = groupDict(
      db.get(`SELECT ${GROUP_COLUMNS} FROM routine_groups WHERE id = ?`, lastInsertRowid)!
    );
    group.items = [];
    return group;
  });
}

/** Port of `update_group`: days come as a list; returns the group without its items, or null if it isn't the user's. */
export function updateGroup(groupId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields))
      if (GROUP_UPDATABLE.has(k) && v !== undefined) updates[k] = v;
    if ('days' in updates) updates.days = daysToText(updates.days);
    const keys = Object.keys(updates);
    if (keys.length) {
      db.run(
        `UPDATE routine_groups SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
        ...keys.map((k) => updates[k]),
        groupId,
        userId
      );
    }
    const row = db.get(
      `SELECT ${GROUP_COLUMNS} FROM routine_groups WHERE id = ? AND user_id = ?`,
      groupId,
      userId
    );
    return row ? groupDict(row) : null;
  });
}

/** Port of `delete_group`: the group and its items (deleted explicitly, as the Python side has no foreign keys on). */
export function deleteGroup(groupId: number, userId: number): boolean {
  return withTodoDb((db) =>
    db.transaction(() => {
      db.run('DELETE FROM routine_items WHERE group_id = ? AND user_id = ?', groupId, userId);
      return (
        db.run('DELETE FROM routine_groups WHERE id = ? AND user_id = ?', groupId, userId).changes >
        0
      );
    })
  );
}

export function getItem(itemId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(
      `SELECT ${ITEM_COLUMNS} FROM routine_items WHERE id = ? AND user_id = ?`,
      itemId,
      userId
    );
    return row ? itemDict(row) : null;
  });
}

export function countItems(groupId: number, userId: number): number {
  return withTodoDb((db) =>
    Number(
      db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM routine_items WHERE group_id = ? AND user_id = ?',
        groupId,
        userId
      )!.n
    )
  );
}

/** Port of `create_item`: added at the end of its group. */
export function createItem(
  userId: number,
  groupId: number,
  title: string,
  opts: { priority?: string; notes?: string | null } = {}
): Row {
  const { priority = 'p3', notes = null } = opts;
  return withTodoDb((db) => {
    const { lastInsertRowid } = db.run(
      'INSERT INTO routine_items (user_id, group_id, title, priority, notes, order_index) VALUES (?, ?, ?, ?, ?, ' +
        '(SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_items WHERE group_id = ? AND user_id = ?))',
      userId,
      groupId,
      title,
      priority,
      notes,
      groupId,
      userId
    );
    return itemDict(
      db.get(`SELECT ${ITEM_COLUMNS} FROM routine_items WHERE id = ?`, lastInsertRowid)!
    );
  });
}

/** Port of `update_item`. A move to another group (group_id) puts the item at the end of that group. */
export function updateItem(itemId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields))
      if (ITEM_UPDATABLE.has(k) && v !== undefined) updates[k] = v;
    const keys = Object.keys(updates);
    if (keys.length) {
      const setParts = keys.map((k) => `${k} = ?`);
      const values: unknown[] = keys.map((k) => updates[k]);
      if ('group_id' in updates) {
        setParts.push(
          'order_index = (SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_items ' +
            'WHERE group_id = ? AND user_id = ?)'
        );
        values.push(updates.group_id, userId);
      }
      db.run(
        `UPDATE routine_items SET ${setParts.join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
        ...values,
        itemId,
        userId
      );
    }
    const row = db.get(
      `SELECT ${ITEM_COLUMNS} FROM routine_items WHERE id = ? AND user_id = ?`,
      itemId,
      userId
    );
    return row ? itemDict(row) : null;
  });
}

export function deleteItem(itemId: number, userId: number): boolean {
  return withTodoDb(
    (db) =>
      db.run('DELETE FROM routine_items WHERE id = ? AND user_id = ?', itemId, userId).changes > 0
  );
}
