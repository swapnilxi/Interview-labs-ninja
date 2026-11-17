import { apiFetch } from '@/lib/http/apiClient';
import type { LabGroupRow, ManagedTopic } from './types';

/**
 * The calls behind lab management, with no React in them, so a lab's own page can use them too (DSA's sidebar does).
 * Every function rejects with the server's plain message ("Only an admin can share a topic with everyone").
 * `base` is the lab's `apiBase` ('/dsa').
 */

async function ok(res: Response): Promise<Response> {
  if (res.ok) return res;
  const body = await res.json().catch(() => null);
  throw new Error(
    typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`
  );
}

export async function fetchTopics<T extends ManagedTopic>(base: string): Promise<T[]> {
  const res = await ok(await apiFetch(`${base}/topics`));
  return (await res.json()) as T[];
}

export async function fetchGroups(base: string): Promise<LabGroupRow[]> {
  const res = await ok(await apiFetch(`${base}/sections`));
  return ((await res.json()) as LabGroupRow[]).map((s) => ({
    name: s.name,
    isCustom: Boolean(s.isCustom),
  }));
}

/** Creates or changes a topic. `shared` (an admin) makes it everyone's. */
export async function saveTopic(base: string, topic: ManagedTopic, shared = false): Promise<void> {
  await ok(
    await apiFetch(`${base}/topics`, { method: 'POST', body: JSON.stringify({ ...topic, shared }) })
  );
}

/** Removes a topic the person added (an admin: any custom topic); for a seed topic they changed, drops their version. */
export async function deleteTopic(base: string, topicId: string): Promise<void> {
  await ok(
    await apiFetch(`${base}/topics?topic_id=${encodeURIComponent(topicId)}`, { method: 'DELETE' })
  );
}

export async function addGroup(base: string, name: string): Promise<void> {
  await ok(
    await apiFetch(`${base}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isCustom: true }),
    })
  );
}

/** Removes a group the person added. */
export async function deleteGroup(base: string, name: string): Promise<void> {
  await ok(
    await apiFetch(`${base}/sections?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
  );
}
