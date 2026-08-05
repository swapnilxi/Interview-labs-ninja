'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchStats,
  fetchUsers,
  setUserRole,
  resetUserPassword,
  deleteUser,
  type AdminStats,
  type AdminUser,
} from '@/lib/services/adminService';

/** Friendly labels for the raw sqlite table names surfaced in resource stats. */
const RESOURCE_LABELS: Record<string, string> = {
  sessions: 'Daily Sessions',
  questions: 'Questions',
  session_progress: 'Session Answers',
  tasks: 'Tasks',
  inbox: 'Inbox Items',
  task_notes: 'Task Notes',
  handwriting_extractions: 'Handwriting Extractions',
  quick_tasks: 'Quick Tasks',
  quick_tasks_archive: 'Archived Quick Tasks',
  projects: 'Projects',
  project_nodes: 'Project Nodes',
  daily_plans: 'Daily Plans',
  user_stats: 'User Stats',
  lab_sections: 'Custom Lab Sections',
};

const labelFor = (table: string) =>
  RESOURCE_LABELS[table] ??
  table.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function formatDate(iso: string): string {
  // Backend stores UTC "YYYY-MM-DD HH:MM:SS"; treat as UTC for a stable display.
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ icon, label, value, tone = 'primary' }: {
  icon: string; label: string; value: number | string; tone?: 'primary' | 'secondary' | 'accent' | 'success';
}) {
  const toneMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
  };
  return (
    <div className="bg-card border border-border rounded-lg p-18 flex items-center gap-12 shadow-sm">
      <div className={`w-48 h-48 rounded-lg flex items-center justify-center shrink-0 ${toneMap[tone]}`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-heading font-semibold text-foreground leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: 'user' | 'admin' }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-6 px-12 py-6 rounded-full text-[11px] font-medium bg-primary/12 text-primary border border-primary/25">
      <Icon name="ShieldCheckIcon" size={12} variant="solid" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-6 px-12 py-6 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
      <Icon name="UserIcon" size={12} /> User
    </span>
  );
}

type PendingAction =
  | { type: 'reset'; user: AdminUser }
  | { type: 'delete'; user: AdminUser }
  | { type: 'role'; user: AdminUser; next: 'user' | 'admin' };

export default function AdminModule() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async (searchTerm: string) => {
    setError(null);
    try {
      const [s, u] = await Promise.all([fetchStats(), fetchUsers(searchTerm || undefined)]);
      setStats(s);
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { fetchUsers(search || undefined).then(setUsers).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const runAction = async () => {
    if (!pending) return;
    setWorking(true);
    setError(null);
    try {
      if (pending.type === 'role') {
        await setUserRole(pending.user.id, pending.next);
        flash(`${pending.user.email} is now ${pending.next === 'admin' ? 'an admin' : 'a user'}.`);
      } else if (pending.type === 'reset') {
        await resetUserPassword(pending.user.id, resetPw);
        flash(`Password reset for ${pending.user.email}.`);
      } else if (pending.type === 'delete') {
        await deleteUser(pending.user.id);
        flash(`Deleted ${pending.user.email} and all their data.`);
      }
      setPending(null);
      setResetPw('');
      await load(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setWorking(false);
    }
  };

  const topResources = useMemo(
    () => Object.entries(stats?.resources_by_table ?? {}).slice(0, 8),
    [stats],
  );
  const maxResource = topResources.reduce((m, [, n]) => Math.max(m, n), 0) || 1;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-[40px] h-[40px] border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1160px] mx-auto px-[4vw] md:px-24 py-24 flex flex-col gap-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-18 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground flex items-center gap-12">
            <Icon name="ShieldCheckIcon" size={26} className="text-primary" />
            Admin Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-6">
            Manage users, roles, and view resource usage across Lab-Ninja.
          </p>
        </div>
        <button
          onClick={() => load(search)}
          className="inline-flex items-center gap-6 py-12 px-18 rounded-md border border-border bg-card hover:bg-muted text-sm text-foreground transition-smooth focus-ring"
        >
          <Icon name="ArrowPathIcon" size={16} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-12 rounded-lg border bg-error/12 border-error/40 text-error flex items-center gap-12 text-sm">
          <Icon name="ExclamationTriangleIcon" size={18} variant="solid" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-18">
        <StatCard icon="UsersIcon" label="Total users" value={stats?.total_users ?? 0} tone="primary" />
        <StatCard icon="ShieldCheckIcon" label="Administrators" value={stats?.admin_users ?? 0} tone="secondary" />
        <StatCard icon="SparklesIcon" label="New in last 7 days" value={stats?.new_users_7d ?? 0} tone="accent" />
        <StatCard icon="CircleStackIcon" label="Total resources" value={stats?.total_resources ?? 0} tone="success" />
      </div>

      {/* Resource breakdown */}
      <div className="bg-card border border-border rounded-lg p-24 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-foreground mb-18 flex items-center gap-6">
          <Icon name="ChartBarIcon" size={18} className="text-muted-foreground" />
          Resource breakdown
        </h2>
        {topResources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No user-owned resources yet.</p>
        ) : (
          <div className="flex flex-col gap-12">
            {topResources.map(([table, count]) => (
              <div key={table} className="flex items-center gap-12">
                <div className="w-[38%] sm:w-[26%] shrink-0 text-xs text-muted-foreground truncate" title={labelFor(table)}>
                  {labelFor(table)}
                </div>
                <div className="flex-1 h-[8px] rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all"
                    style={{ width: `${Math.max(2, (count / maxResource) * 100)}%` }}
                  />
                </div>
                <div className="w-[44px] text-right text-xs font-medium text-foreground tabular-nums">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="p-18 border-b border-border flex items-center justify-between gap-12 flex-wrap">
          <h2 className="font-heading text-base font-semibold text-foreground flex items-center gap-6">
            <Icon name="UserGroupIcon" size={18} className="text-muted-foreground" />
            Users
            <span className="text-xs font-normal text-muted-foreground">({users.length})</span>
          </h2>
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-12 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email or name…"
              className="w-full sm:w-[260px] rounded-md border border-border bg-input pl-36 pr-12 py-12 text-sm text-foreground focus-ring transition-smooth"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/40">
                <th className="px-18 py-12 font-medium">User</th>
                <th className="px-18 py-12 font-medium">Role</th>
                <th className="px-18 py-12 font-medium hidden md:table-cell">Resources</th>
                <th className="px-18 py-12 font-medium hidden lg:table-cell">Joined</th>
                <th className="px-18 py-12 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-18 py-24 text-center text-muted-foreground">No users found.</td></tr>
              )}
              {users.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-smooth">
                    <td className="px-18 py-12">
                      <div className="flex items-center gap-12">
                        <div className="w-36 h-36 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                          {(u.display_name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate flex items-center gap-6">
                            {u.display_name || u.email.split('@')[0]}
                            {isMe && <span className="text-[10px] text-muted-foreground font-normal">(you)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-18 py-12"><RoleBadge role={u.role} /></td>
                    <td className="px-18 py-12 hidden md:table-cell text-muted-foreground tabular-nums">{u.resource_count}</td>
                    <td className="px-18 py-12 hidden lg:table-cell text-muted-foreground">{formatDate(u.created_at)}</td>
                    <td className="px-18 py-12">
                      <div className="flex items-center justify-end gap-6">
                        <button
                          onClick={() => setPending({ type: 'role', user: u, next: u.role === 'admin' ? 'user' : 'admin' })}
                          title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                          className="p-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-smooth focus-ring"
                        >
                          <Icon name={u.role === 'admin' ? 'ArrowDownCircleIcon' : 'ArrowUpCircleIcon'} size={18} />
                        </button>
                        <button
                          onClick={() => { setResetPw(''); setPending({ type: 'reset', user: u }); }}
                          title="Reset password"
                          className="p-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-smooth focus-ring"
                        >
                          <Icon name="KeyIcon" size={18} />
                        </button>
                        <button
                          onClick={() => setPending({ type: 'delete', user: u })}
                          disabled={isMe}
                          title={isMe ? 'You cannot delete yourself here' : 'Delete user'}
                          className="p-6 rounded-md hover:bg-error/10 text-muted-foreground hover:text-error transition-smooth focus-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <Icon name="TrashIcon" size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-18 py-12 rounded-lg bg-foreground text-background text-sm shadow-lg flex items-center gap-12">
          <Icon name="CheckCircleIcon" size={18} variant="solid" className="text-success" />
          {toast}
        </div>
      )}

      {/* Confirmation / action modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-[4vw] bg-black/40 backdrop-blur-sm" onClick={() => !working && setPending(null)}>
          <div className="w-full max-w-[440px] bg-card border border-border rounded-lg shadow-lg p-24 flex flex-col gap-18" onClick={(e) => e.stopPropagation()}>
            {pending.type === 'delete' && (
              <>
                <div className="flex items-center gap-12">
                  <div className="w-48 h-48 rounded-full bg-error/10 flex items-center justify-center shrink-0">
                    <Icon name="TrashIcon" size={20} className="text-error" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">Delete user?</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  This permanently deletes <span className="font-medium text-foreground">{pending.user.email}</span> and all
                  {' '}<span className="font-medium text-foreground">{pending.user.resource_count}</span> of their resources
                  (sessions, tasks, projects, and more). This cannot be undone.
                </p>
              </>
            )}
            {pending.type === 'role' && (
              <>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {pending.next === 'admin' ? 'Promote to admin?' : 'Demote to user?'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {pending.next === 'admin'
                    ? <>Grant <span className="font-medium text-foreground">{pending.user.email}</span> full admin access, including managing all users.</>
                    : <>Remove admin access from <span className="font-medium text-foreground">{pending.user.email}</span>. They keep their account and data.</>}
                </p>
              </>
            )}
            {pending.type === 'reset' && (
              <>
                <h3 className="font-heading text-lg font-semibold text-foreground">Reset password</h3>
                <p className="text-sm text-muted-foreground">
                  Set a new password for <span className="font-medium text-foreground">{pending.user.email}</span>. Share it with them securely.
                </p>
                <input
                  type="text"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="New password (min 8 characters)"
                  className="w-full rounded-md border border-border bg-input px-12 py-12 text-sm text-foreground focus-ring transition-smooth"
                  autoFocus
                />
              </>
            )}

            <div className="flex items-center justify-end gap-12">
              <button
                onClick={() => setPending(null)}
                disabled={working}
                className="py-12 px-18 rounded-md border border-border bg-card hover:bg-muted text-sm text-foreground transition-smooth focus-ring disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runAction}
                disabled={working || (pending.type === 'reset' && resetPw.length < 8)}
                className={`py-12 px-18 rounded-md text-sm font-medium text-white transition-smooth focus-ring disabled:opacity-50 flex items-center gap-12 ${
                  pending.type === 'delete' ? 'bg-error hover:bg-error/90' : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {working && <span className="w-[14px] h-[14px] border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {pending.type === 'delete' ? 'Delete' : pending.type === 'reset' ? 'Reset password' : pending.next === 'admin' ? 'Promote' : 'Demote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
