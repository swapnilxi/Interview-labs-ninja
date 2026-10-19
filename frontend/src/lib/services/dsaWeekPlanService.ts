import { apiFetch } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import { normalizePlan, type AutoRequestAnswers, type WeekPlan } from '@/modules/dsa-lab/weekPlan';

/**
 * Client for the DSA week plan API (`/dsa/week-plan/*`; FastAPI backend/modules/dsa_lab and its
 * fe-apis/dsaLab twin). The learner keeps up to 20 named plans ("profiles"); at most one is active,
 * and `/dsa/week-plan` itself reads and writes the active one. Every plan that comes back goes through
 * `normalizePlan`, so callers always get `order` and `labels`.
 */

/** The active profile's plan, with the profile it belongs to. */
export interface ActivePlan extends WeekPlan {
  updatedAt: string;
  profileId: number;
  name: string;
}

export interface ProfileSummary {
  id: number;
  name: string;
  weeks: number;
  /** How many questions the plan puts in a week (any week). */
  planned: number;
  summary: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileFull extends ProfileSummary {
  plan: WeekPlan;
}

export interface AutoPlanResult {
  plan: WeekPlan;
  summary: string;
  stats: { placed: number; dropped: number; slots: number };
}

/** A question as the auto organizer is told about it (in learning order). */
export interface AutoPlanTopic {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  done?: boolean;
}

/** A refused request: the server's own message, plus the HTTP status so callers can tell a 409 apart. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The 409 detail of a save that named a plan that is not the active one any more (twin: week_plan.py). */
export const NOT_ACTIVE_MESSAGE = 'This plan is no longer the active one.';

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.detail === 'string' ? body.detail : `Server error ${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

/** Only the fields the API takes, so extras riding on the object (updatedAt, name …) are not sent. */
const planBody = (plan: WeekPlan): WeekPlan => ({
  weeks: plan.weeks,
  assignments: plan.assignments,
  order: plan.order,
  labels: plan.labels,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toActive(raw: any): ActivePlan {
  return {
    ...normalizePlan(raw),
    updatedAt: String(raw?.updatedAt ?? ''),
    profileId: Number(raw?.profileId),
    name: String(raw?.name ?? ''),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(raw: any): ProfileSummary {
  return {
    id: Number(raw?.id),
    name: String(raw?.name ?? ''),
    weeks: Number(raw?.weeks) || 0,
    planned: Number(raw?.planned) || 0,
    summary: String(raw?.summary ?? ''),
    active: raw?.active === true,
    createdAt: String(raw?.createdAt ?? ''),
    updatedAt: String(raw?.updatedAt ?? ''),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFull(raw: any): ProfileFull {
  return { ...toSummary(raw), plan: normalizePlan(raw?.plan) };
}

/** The active plan, or null when no profile is active (the lab then shows its suggested plan). */
export async function fetchWeekPlan(): Promise<ActivePlan | null> {
  const body = await request<{ plan: unknown }>('/dsa/week-plan');
  return body.plan ? toActive(body.plan) : null;
}

/**
 * Saves the active profile's plan; with none active the server creates and activates "My plan".
 * `profileId` is the plan the caller believes is active (null = none): if the server's active plan is a
 * different one (another tab or device switched, or deleted it) the save is refused with a 409
 * (NOT_ACTIVE_MESSAGE) instead of overwriting that other plan.
 */
export async function saveWeekPlan(plan: WeekPlan, profileId: number | null): Promise<ActivePlan> {
  const body = await request<{ plan: unknown }>(
    '/dsa/week-plan',
    json('PUT', { ...planBody(plan), profileId })
  );
  return toActive(body.plan);
}

/** Deactivates every profile (nothing is deleted), so the suggested plan shows again. */
export async function resetWeekPlan(): Promise<void> {
  await request<unknown>('/dsa/week-plan', { method: 'DELETE' });
}

export async function listProfiles(): Promise<{
  profiles: ProfileSummary[];
  activeId: number | null;
}> {
  const body = await request<{ profiles: unknown[]; activeId: number | null }>(
    '/dsa/week-plan/profiles'
  );
  return {
    profiles: (Array.isArray(body.profiles) ? body.profiles : []).map(toSummary),
    activeId: typeof body.activeId === 'number' ? body.activeId : null,
  };
}

export async function getProfile(id: number): Promise<ProfileFull> {
  const body = await request<{ profile: unknown }>(`/dsa/week-plan/profiles/${id}`);
  return toFull(body.profile);
}

/** Creates a profile (409 when the name is taken or 20 plans exist); `activate` makes it the only active one. */
export async function createProfile(input: {
  name: string;
  plan: WeekPlan;
  summary?: string;
  activate?: boolean;
}): Promise<ProfileFull> {
  const body = await request<{ profile: unknown }>(
    '/dsa/week-plan/profiles',
    json('POST', {
      name: input.name,
      plan: planBody(input.plan),
      summary: input.summary ?? '',
      activate: input.activate ?? false,
    })
  );
  return toFull(body.profile);
}

/** Renames a profile, changes its summary and/or replaces its plan (any subset). */
export async function updateProfile(
  id: number,
  changes: { name?: string; summary?: string; plan?: WeekPlan }
): Promise<ProfileFull> {
  const payload: Record<string, unknown> = {};
  if (changes.name !== undefined) payload.name = changes.name;
  if (changes.summary !== undefined) payload.summary = changes.summary;
  if (changes.plan !== undefined) payload.plan = planBody(changes.plan);
  const body = await request<{ profile: unknown }>(
    `/dsa/week-plan/profiles/${id}`,
    json('PATCH', payload)
  );
  return toFull(body.profile);
}

/** Makes a profile the active one (the others are deactivated) and returns its plan. */
export async function activateProfile(id: number): Promise<ActivePlan> {
  const body = await request<{ plan: unknown }>(`/dsa/week-plan/profiles/${id}/activate`, {
    method: 'POST',
  });
  return toActive(body.plan);
}

/** Deletes a profile; deleting the active one leaves none active. */
export async function deleteProfile(
  id: number
): Promise<{ deleted: number; activeId: number | null }> {
  const body = await request<{ deleted: number; activeId: number | null }>(
    `/dsa/week-plan/profiles/${id}`,
    { method: 'DELETE' }
  );
  return {
    deleted: Number(body.deleted),
    activeId: typeof body.activeId === 'number' ? body.activeId : null,
  };
}

/** Asks the AI for a plan from the wizard's answers (login and an AI key needed). Nothing is saved. */
export async function autoOrganize(input: {
  answers: AutoRequestAnswers;
  topics: AutoPlanTopic[];
}): Promise<AutoPlanResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await request<any>(
    '/dsa/week-plan/auto',
    json('POST', { answers: input.answers, topics: input.topics, ...defaultAIRequestFields() })
  );
  return {
    plan: normalizePlan(body?.plan),
    summary: typeof body?.summary === 'string' ? body.summary : '',
    stats: {
      placed: Number(body?.stats?.placed) || 0,
      dropped: Number(body?.stats?.dropped) || 0,
      slots: Number(body?.stats?.slots) || 0,
    },
  };
}
