'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/http/apiClient';
import { isLoggedIn } from '@/lib/auth/tokenStore';

/**
 * Shown when a signed-in user's account is still pending or was rejected.
 * AuthGate redirects pending/rejected users here; approved users are
 * redirected away from here to the app.
 */
export default function PendingApprovalModule() {
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  // Not logged in at all → go to login.
  useEffect(() => {
    if (!loading && !isLoggedIn()) {
      router.replace('/login');
    }
  }, [loading, router]);

  // Approved user somehow landed here → go to app.
  useEffect(() => {
    if (!loading && user?.status === 'approved') {
      router.replace('/ai-todo');
    }
  }, [loading, user, router]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'approved') {
          // AuthGate will pick this up via AuthContext, but we can also reload.
          window.location.replace('/ai-todo');
          return;
        }
      }
    } catch {
      // network error — just update the timestamp
    } finally {
      setChecking(false);
      setCheckedAt(new Date());
    }
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  if (loading || !user) {
    return (
      <div role="status" className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-[2.25rem] w-[2.25rem] animate-spin rounded-full border-[3px] mix-border-primary/25 border-t-primary" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  const isRejected = user.status === 'rejected';

  return (
    <main className="fixed inset-0 overflow-y-auto bg-background">
      <div className="flex min-h-full flex-col items-center justify-center px-[1rem] py-[2rem]">
        <p className="mb-[1.25rem] font-heading text-[1.0625rem] font-bold tracking-[-0.02em] text-foreground">
          LabNinja
        </p>

        <div className="w-full max-w-md overflow-hidden rounded-[22px] border mix-border-foreground/10 bg-card shadow-2xl">
          <div className="px-[1.75rem] pb-[1.75rem] pt-[1.75rem] text-center">
            {/* Icon */}
            <div
              className={`mx-auto mb-[0.875rem] flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-[16px] ${
                isRejected ? 'mix-bg-error/15' : 'mix-bg-warning/15'
              }`}
            >
              <Icon
                name={isRejected ? 'XCircleIcon' : 'ClockIcon'}
                size={24}
                className={isRejected ? 'text-error' : 'text-warning'}
              />
            </div>

            {/* Title */}
            <h2 className="font-heading text-[1.375rem] font-bold tracking-[-0.022em] text-foreground">
              {isRejected ? 'Account not approved' : 'Waiting for approval'}
            </h2>

            {/* Body */}
            <p className="mx-auto mt-[0.5rem] max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
              {isRejected ? (
                <>
                  Your account ({user.email}) was not approved. Please contact an administrator if
                  you believe this is a mistake.
                </>
              ) : (
                <>
                  Your account ({user.email}) is pending admin approval. You&apos;ll get full
                  access once an admin approves it.
                </>
              )}
            </p>

            {checkedAt && (
              <p className="mt-[0.5rem] text-[12px] text-muted-foreground">
                Checked at{' '}
                {checkedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {isRejected ? 'still not approved' : 'still pending'}
              </p>
            )}

            {/* Actions */}
            <div className="mt-[1.5rem] flex flex-col gap-[0.75rem]">
              {!isRejected && (
                <button
                  onClick={checkStatus}
                  disabled={checking}
                  className="flex h-[3rem] w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                >
                  {checking ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon name="ArrowPathIcon" size={16} />
                  )}
                  Check if approved
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex h-[3rem] w-full items-center justify-center gap-2 rounded-full border mix-border-foreground/15 bg-transparent text-[15px] font-semibold text-foreground transition-opacity hover:mix-bg-foreground/5 active:scale-[0.98]"
              >
                <Icon name="ArrowLeftStartOnRectangleIcon" size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>

        <p className="mt-[1.5rem] max-w-[36ch] text-center text-[12px] text-muted-foreground">
          Admins can approve accounts from the Admin Portal.
        </p>
      </div>
    </main>
  );
}
