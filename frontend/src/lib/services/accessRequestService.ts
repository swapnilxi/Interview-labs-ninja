'use client';

/**
 * Self-service access requests: any logged-in user can ask for a role bump or a specific
 * permission. Reviewed by an admin via adminService's fetchAccessRequests/approve/deny.
 */

import { apiFetch, parseApiError } from '@/lib/http/apiClient';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id: number;
  user_id: number;
  requested_role: string | null;
  permission: string | null;
  message: string;
  status: AccessRequestStatus;
  reviewed_by: number | null;
  review_note: string;
  created_at: string;
  decided_at: string | null;
}

export interface SubmitAccessRequestInput {
  requested_role?: 'editor' | 'admin' | 'superadmin';
  permission?: string;
  message?: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as T;
}

export async function submitAccessRequest(input: SubmitAccessRequestInput): Promise<AccessRequest> {
  return json<AccessRequest>(
    await apiFetch('/access-requests', { method: 'POST', body: JSON.stringify(input) })
  );
}

export async function fetchMyAccessRequests(): Promise<AccessRequest[]> {
  return json<AccessRequest[]>(await apiFetch('/access-requests/me'));
}
