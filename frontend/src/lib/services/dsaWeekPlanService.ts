import { apiFetch } from '@/lib/http/apiClient';
import type { WeekPlan } from '@/modules/dsa-lab/weekPlan';

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.detail === 'string' ? body.detail : `Server error ${res.status}`;
}

/** The user's saved plan, or null if they never changed the suggested one. */
export async function fetchWeekPlan(): Promise<WeekPlan | null> {
  const res = await apiFetch('/dsa/week-plan');
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).plan ?? null;
}

export async function saveWeekPlan(plan: WeekPlan): Promise<WeekPlan> {
  const res = await apiFetch('/dsa/week-plan', { method: 'PUT', body: JSON.stringify(plan) });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()).plan;
}

/** Back to the suggested plan. */
export async function resetWeekPlan(): Promise<void> {
  const res = await apiFetch('/dsa/week-plan', { method: 'DELETE' });
  if (!res.ok) throw new Error(await errorMessage(res));
}
