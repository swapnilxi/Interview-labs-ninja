'use client';

/**
 * Admin portal data service. Every call hits an admin-gated backend route via
 * apiFetch (Bearer token attached automatically); a non-admin gets 403 and
 * these throw with the backend's detail message.
 */

import { apiFetch, parseApiError } from '@/lib/http/apiClient';

export interface AdminStats {
  total_users: number;
  admin_users: number;
  new_users_7d: number;
  total_resources: number;
  resources_by_table: Record<string, number>;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
  resource_count: number;
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

export async function setUserRole(userId: number, role: 'user' | 'admin'): Promise<void> {
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
