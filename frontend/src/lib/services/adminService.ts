'use client';

/**
 * Admin portal data service. Every call hits an admin-gated backend route via
 * apiFetch (Bearer token attached automatically); a non-admin gets 403 and
 * these throw with the backend's detail message.
 */

import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import type { AccessRequest, AccessRequestStatus } from './accessRequestService';

export type AppRole = 'user' | 'editor' | 'admin' | 'superadmin';
export type AccountStatus = 'pending' | 'approved' | 'rejected';

/** The 3 permission keys the portal currently knows about (see backend
 * modules/auth/dependencies.py: KNOWN_PERMISSIONS). users:manage/users:delete are
 * admin-equivalent -- granting or revoking either is superadmin-only, server-enforced. */
export const KNOWN_PERMISSIONS = ['ai_lms:edit', 'users:manage', 'users:delete'] as const;
export type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];
export const ADMIN_EQUIVALENT_PERMISSIONS: ReadonlySet<string> = new Set([
  'users:manage',
  'users:delete',
]);

export interface AdminStats {
  total_users: number;
  admin_users: number;
  pending_users: number;
  new_users_7d: number;
  total_resources: number;
  resources_by_table: Record<string, number>;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  role: AppRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  resource_count: number;
  permission_overrides: Record<string, boolean>;
  /** The merged (role default + overrides) permission set — see backend's effective_permissions(). */
  permissions: string[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as T;
}

export async function fetchStats(): Promise<AdminStats> {
  return json<AdminStats>(await apiFetch('/admin/stats'));
}

export async function fetchUsers(search?: string): Promise<AdminUser[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return json<AdminUser[]>(await apiFetch(`/admin/users${qs}`));
}

export async function setUserRole(userId: number, role: AppRole): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function resetUserPassword(userId: number, password: string): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function deleteUser(userId: number): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function approveUser(userId: number): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}/approve`, { method: 'POST' });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function rejectUser(userId: number): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function setUserPermission(
  userId: number,
  permission: string,
  allowed: boolean
): Promise<Record<string, boolean>> {
  const res = await apiFetch(`/admin/users/${userId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ permission, allowed }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()).permission_overrides;
}

export async function clearUserPermission(
  userId: number,
  permission: string
): Promise<Record<string, boolean>> {
  const res = await apiFetch(
    `/admin/users/${userId}/permissions/${encodeURIComponent(permission)}`,
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()).permission_overrides;
}

/** An access request as the admin endpoint returns it: the requester's email/display name
 * joined in, for the portal's list view. */
export interface AdminAccessRequest extends AccessRequest {
  user_email: string | null;
  user_display_name: string | null;
  user_status: AccountStatus | null;
}

export async function fetchAccessRequests(
  status?: AccessRequestStatus
): Promise<AdminAccessRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return json<AdminAccessRequest[]>(await apiFetch(`/admin/access-requests${qs}`));
}

export async function approveAccessRequest(id: number, reviewNote = ''): Promise<AccessRequest> {
  return json<AccessRequest>(
    await apiFetch(`/admin/access-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ review_note: reviewNote }),
    })
  );
}

export async function denyAccessRequest(id: number, reviewNote = ''): Promise<AccessRequest> {
  return json<AccessRequest>(
    await apiFetch(`/admin/access-requests/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ review_note: reviewNote }),
    })
  );
}

/** Superadmin-only: push the local lab_ninja.sqlite3 to Neon, or overwrite it with
 * Neon's latest snapshot. 503s if DATABASE_URL isn't configured on this backend. */
export async function pushDbToProduction(): Promise<void> {
  const res = await apiFetch('/admin/db/push', { method: 'POST' });
  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function pullDbFromProduction(): Promise<void> {
  const res = await apiFetch('/admin/db/pull', { method: 'POST' });
  if (!res.ok) throw new Error(await parseApiError(res));
}
