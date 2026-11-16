/**
 * fe-apis/lms/updates.ts
 *
 * Class membership and class updates (announcements) for AI LMS. Twin of backend/modules/ai_lms/updates.py: the same
 * tables, limits, validation texts and status codes, so change both. The one thing that is only here is the device
 * push (`pushUpdate`): the Python backend stores and serves updates but never pushes, like every other push in the app.
 *
 * Who is "into" a class: a learner joins it (`enrolled`) or shows interest by turning on its practice reminders
 * (`interested`). An instructor or admin (the editor gate in index.ts) sends an update to one class's people or to
 * everyone in any class. It is fanned out when sent: one `lms_notifications` row and one `lms_notification_recipients`
 * row per person, whose integer id is the cursor the browser polls with (`inbox`).
 */

import crypto from 'crypto';
import { HttpError, withTodoDb, type TodoDb } from '../todo/_shared';
import { ensureLmsTables } from './db';

export const MEMBER_STATUSES = ['enrolled', 'interested'] as const;
export const SCOPES = ['class', 'ai-lms'] as const;
type MemberStatus = (typeof MEMBER_STATUSES)[number];
type Scope = (typeof SCOPES)[number];

export const TITLE_MAX = 120;
export const BODY_MAX = 1000;
export const LINK_MAX = 300;
export const SENDS_PER_HOUR = 30;
// The first time a browser asks for its updates it only gets the last few days, so a new device is not flooded.
export const FIRST_SYNC_DAYS = 3;
export const INBOX_DEFAULT_LIMIT = 20;
export const INBOX_MAX_LIMIT = 50;
export const RECENT_LIMIT = 20;
const MODULE_LINK = '/ai-lms';
/** How long a send waits for the device push gateways before answering (the update itself is already stored). */
const PUSH_WAIT_MS = 5000;

// Control characters other than tab, newline and carriage return (those are handled per field).
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
// An in-app path: one leading slash (never `//`), no backslash, no whitespace, no control characters.
const LINK_OK = /^\/(?!\/)[^\\\s\u0000-\u001f\u007f-\u009f]*$/;

// Only people who can still log in are notified: the account exists and is approved.
const NOTIFIABLE = "JOIN users u ON u.id = m.user_id AND COALESCE(u.status, 'approved') = 'approved'";

type Row = Record<string, any>;

/** Length in code points, like Python's len(): an emoji is one character, not two UTF-16 units. */
const cpLength = (value: string): number => Array.from(value).length;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveClass(db: TodoDb, idOrSlug: string): { id: string; slug: string; name: string } {
  const row = db.get<Row>('SELECT id, slug, name FROM lms_classes WHERE id = ? OR slug = ?', idOrSlug, idOrSlug);
  if (!row) throw new HttpError(404, 'Class not found.');
  return { id: row.id, slug: row.slug, name: row.name };
}

/** One line: line breaks and tabs become spaces, other control characters go, the ends are trimmed. */
export function cleanTitle(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(CONTROL, '').trim();
}

/** Line breaks stay (as \n); other control characters go; the ends are trimmed. */
export function cleanBody(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
}

export function validLink(link: string): boolean {
  return cpLength(link) <= LINK_MAX && LINK_OK.test(link);
}

/** `after` / `limit` query values: digits only, or a 422 with the same text the Python router gives. */
export function parseWholeNumber(raw: string | null, name: string): number | null {
  if (raw === null || raw === '') return null;
  if (!/^[0-9]{1,12}$/.test(raw)) throw new HttpError(422, `${name} must be a whole number.`);
  return Number(raw);
}

// ── Membership ─────────────────────────────────────────────────────────────────

export interface Membership {
  status: MemberStatus | null;
  enrolled_count: number;
  interested_count: number;
  member_count: number;
  module_member_count: number;
  /** What a send from this user would reach: the same people without the sender. */
  audience_count: number;
  module_audience_count: number;
}

function membershipView(db: TodoDb, classId: string, userId: number): Membership {
  const counts: Record<string, number> = { enrolled: 0, interested: 0 };
  for (const row of db.all<Row>(
    `SELECT m.status AS status, COUNT(*) AS n FROM lms_class_members m ${NOTIFIABLE} WHERE m.class_id = ? GROUP BY m.status`,
    classId
  )) {
    counts[row.status] = Number(row.n);
  }
  const moduleTotal = Number(
    db.get<Row>(`SELECT COUNT(DISTINCT m.user_id) AS n FROM lms_class_members m ${NOTIFIABLE}`)?.n ?? 0
  );
  const mine = db.get<Row>('SELECT status FROM lms_class_members WHERE class_id = ? AND user_id = ?', classId, userId);
  const inAny = db.get<Row>('SELECT 1 AS one FROM lms_class_members WHERE user_id = ? LIMIT 1', userId);
  const memberCount = counts.enrolled + counts.interested;
  return {
    status: mine ? (mine.status as MemberStatus) : null,
    enrolled_count: counts.enrolled,
    interested_count: counts.interested,
    member_count: memberCount,
    module_member_count: moduleTotal,
    audience_count: memberCount - (mine ? 1 : 0),
    module_audience_count: moduleTotal - (inAny ? 1 : 0),
  };
}

export function getMembership(classIdOrSlug: string, userId: number): Membership {
  ensureLmsTables();
  return withTodoDb((db) => membershipView(db, resolveClass(db, classIdOrSlug).id, userId));
}

/** Join (`enrolled`) or show interest (`interested`). Interest never downgrades an enrolment. */
export function setMembership(classIdOrSlug: string, userId: number, status: unknown): Membership {
  if (status !== 'enrolled' && status !== 'interested') {
    throw new HttpError(422, "Membership status must be 'enrolled' or 'interested'.");
  }
  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const cls = resolveClass(db, classIdOrSlug);
      const row = db.get<Row>('SELECT status FROM lms_class_members WHERE class_id = ? AND user_id = ?', cls.id, userId);
      if (!row) {
        db.run(
          'INSERT INTO lms_class_members (class_id, user_id, status, joined_at) VALUES (?, ?, ?, ?)',
          cls.id,
          userId,
          status,
          new Date().toISOString()
        );
      } else if (row.status === 'interested' && status === 'enrolled') {
        db.run("UPDATE lms_class_members SET status = 'enrolled' WHERE class_id = ? AND user_id = ?", cls.id, userId);
      }
      return membershipView(db, cls.id, userId);
    })
  );
}

export function removeMembership(classIdOrSlug: string, userId: number): Membership {
  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const cls = resolveClass(db, classIdOrSlug);
      db.run('DELETE FROM lms_class_members WHERE class_id = ? AND user_id = ?', cls.id, userId);
      return membershipView(db, cls.id, userId);
    })
  );
}

// ── Sending ────────────────────────────────────────────────────────────────────

export interface SentUpdate {
  id: string;
  scope: Scope;
  recipients: number;
  push: { web: number; android: number };
  /** Not part of the HTTP answer: who the device push goes to, and what it says. */
  recipientIds: number[];
  title: string;
  body: string;
  link: string;
}

/** Store an update and its recipients. The push is separate (`pushUpdate`), so a slow gateway never holds the rows. */
export function sendUpdate(classIdOrSlug: string, senderId: number, payload: Record<string, unknown>): SentUpdate {
  let scope: unknown = payload.scope;
  if (scope === undefined || scope === null || scope === '') scope = 'class';
  if (scope !== 'class' && scope !== 'ai-lms') {
    throw new HttpError(422, 'Choose who gets this update: this class or all of AI LMS.');
  }

  const rawTitle = payload.title;
  const title = typeof rawTitle === 'string' ? cleanTitle(rawTitle) : '';
  if (!title) throw new HttpError(422, 'Add a title for the update.');
  if (cpLength(title) > TITLE_MAX) throw new HttpError(422, `The title can be at most ${TITLE_MAX} characters.`);

  let rawBody = payload.body;
  if (rawBody === undefined || rawBody === null) rawBody = '';
  if (typeof rawBody !== 'string') throw new HttpError(422, 'The message must be text.');
  const body = cleanBody(rawBody);
  if (cpLength(body) > BODY_MAX) throw new HttpError(422, `The message can be at most ${BODY_MAX} characters.`);

  let rawLink = payload.link;
  if (rawLink !== undefined && rawLink !== null && typeof rawLink !== 'string') rawLink = '\u0000'; // not text: fails below
  let link = String(rawLink ?? '').trim();
  if (link && !validLink(link)) {
    throw new HttpError(422, 'The link must be a page inside LabNinja, like /ai-lms/classes/ai.');
  }

  ensureLmsTables();
  return withTodoDb((db) =>
    db.transaction(() => {
      const cls = resolveClass(db, classIdOrSlug);
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const sent = Number(
        db.get<Row>('SELECT COUNT(*) AS n FROM lms_notifications WHERE sender_id = ? AND created_at > ?', senderId, since)?.n ?? 0
      );
      if (sent >= SENDS_PER_HOUR) {
        throw new HttpError(429, `You have sent ${SENDS_PER_HOUR} updates in the last hour. Try again later.`);
      }

      if (!link) link = scope === 'class' ? `/ai-lms/classes/${cls.slug}` : MODULE_LINK;

      const rows =
        scope === 'class'
          ? db.all<Row>(
              `SELECT m.user_id AS user_id FROM lms_class_members m ${NOTIFIABLE} WHERE m.class_id = ? AND m.user_id != ? ORDER BY m.user_id`,
              cls.id,
              senderId
            )
          : db.all<Row>(
              `SELECT DISTINCT m.user_id AS user_id FROM lms_class_members m ${NOTIFIABLE} WHERE m.user_id != ? ORDER BY m.user_id`,
              senderId
            );
      const recipientIds = rows.map((row) => Number(row.user_id));

      const id = `notif-${crypto.randomBytes(6).toString('hex')}`;
      db.run(
        'INSERT INTO lms_notifications (id, scope, class_id, title, body, link, sender_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        scope,
        cls.id,
        title,
        body,
        link,
        senderId,
        new Date().toISOString()
      );
      for (const userId of recipientIds) {
        db.run('INSERT OR IGNORE INTO lms_notification_recipients (notification_id, user_id) VALUES (?, ?)', id, userId);
      }
      return {
        id,
        scope: scope as Scope,
        recipients: recipientIds.length,
        push: { web: 0, android: 0 },
        recipientIds,
        title,
        body,
        link,
      };
    })
  );
}

/**
 * Send the update to the recipients' devices: Web Push to every subscription of theirs and FCM to their Android
 * apps (a safe no-op without FIREBASE_SERVICE_ACCOUNT). Never throws and never holds the answer for long: whatever
 * the gateways have accepted within PUSH_WAIT_MS is counted. The update is already stored and reaches the people
 * with the app open through `inbox` either way.
 */
export async function pushUpdate(sent: SentUpdate): Promise<{ web: number; android: number }> {
  const counted = { web: 0, android: 0 };
  if (sent.recipientIds.length === 0) return counted;
  try {
    // Loaded here, not at the top: the push libraries are heavy and only a send needs them.
    const [{ sendWebPush }, { sendFcmToUser, fcmConfigured }] = await Promise.all([
      import('@/lib/server/webPush'),
      import('@/lib/server/fcm'),
    ]);
    const subscriptions: Row[] = [];
    for (let i = 0; i < sent.recipientIds.length; i += 400) {
      const ids = sent.recipientIds.slice(i, i + 400);
      subscriptions.push(
        ...withTodoDb((db) =>
          db.all<Row>(
            `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`,
            ...ids
          )
        )
      );
    }
    const message = { title: sent.title, body: sent.body, href: sent.link, tag: `lms-${sent.id}` };
    const jobs: Promise<unknown>[] = subscriptions.map((sub) =>
      sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { ...message, requireInteraction: false }
      )
        .then((ok) => {
          if (ok) counted.web += 1;
        })
        .catch(() => undefined)
    );
    if (fcmConfigured()) {
      for (const userId of sent.recipientIds) {
        jobs.push(
          sendFcmToUser(userId, message)
            .then((accepted) => {
              counted.android += accepted;
            })
            .catch(() => undefined)
        );
      }
    }
    await Promise.race([Promise.allSettled(jobs), new Promise((resolve) => setTimeout(resolve, PUSH_WAIT_MS))]);
  } catch (err) {
    console.warn('[lms] class update push failed:', err);
  }
  return { ...counted };
}

export function listClassUpdates(classIdOrSlug: string): Row[] {
  ensureLmsTables();
  return withTodoDb((db) => {
    const cls = resolveClass(db, classIdOrSlug);
    return db
      .all<Row>(
        `
        SELECT n.id AS id, n.title AS title, n.body AS body, n.link AS link, n.scope AS scope, n.created_at AS created_at,
               COALESCE(NULLIF(TRIM(u.display_name), ''), 'Instructor') AS sender_name,
               (SELECT COUNT(*) FROM lms_notification_recipients r WHERE r.notification_id = n.id) AS recipient_count
        FROM lms_notifications n
        LEFT JOIN users u ON u.id = n.sender_id
        WHERE n.class_id = ?
        ORDER BY n.created_at DESC, n.rowid DESC
        LIMIT ?
        `,
        cls.id,
        RECENT_LIMIT
      )
      .map((row) => ({ ...row, recipient_count: Number(row.recipient_count) }));
  });
}

// ── The caller's own updates ───────────────────────────────────────────────────

const INBOX_SELECT = `
    SELECT r.id AS cursor, n.id AS id, n.scope AS scope, c.slug AS class_slug, c.name AS class_name,
           n.title AS title, n.body AS body, n.link AS link, n.created_at AS created_at,
           COALESCE(NULLIF(TRIM(u.display_name), ''), 'Instructor') AS sender_name
    FROM lms_notification_recipients r
    JOIN lms_notifications n ON n.id = r.notification_id
    LEFT JOIN lms_classes c ON c.id = n.class_id
    LEFT JOIN users u ON u.id = n.sender_id
    WHERE r.user_id = ?
`;

/**
 * The caller's updates, oldest first. With `after` (a cursor from an earlier call): what came after it. Without: the
 * newest few from the last days, and `cursor` is the caller's newest recipient id so the next call can continue.
 */
export function inbox(userId: number, after: number | null, limit: number): { items: Row[]; cursor: number } {
  const bounded = Math.max(1, Math.min(INBOX_MAX_LIMIT, limit));
  const toItem = (row: Row): Row => ({ ...row, cursor: Number(row.cursor) });
  ensureLmsTables();
  return withTodoDb((db) => {
    if (after === null) {
      const cutoff = new Date(Date.now() - FIRST_SYNC_DAYS * DAY_MS).toISOString();
      const rows = db.all<Row>(`${INBOX_SELECT} AND n.created_at >= ? ORDER BY r.id DESC LIMIT ?`, userId, cutoff, bounded);
      const top = Number(
        db.get<Row>('SELECT COALESCE(MAX(id), 0) AS top FROM lms_notification_recipients WHERE user_id = ?', userId)?.top ?? 0
      );
      return { items: rows.reverse().map(toItem), cursor: top };
    }
    const rows = db.all<Row>(`${INBOX_SELECT} AND r.id > ? ORDER BY r.id ASC LIMIT ?`, userId, after, bounded);
    const items = rows.map(toItem);
    return { items, cursor: items.length ? items[items.length - 1].cursor : after };
  });
}
