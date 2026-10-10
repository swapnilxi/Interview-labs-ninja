'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Rendered app-wide (see frontend/src/app/layout.tsx) so a pending/rejected account can't
 * miss why every action is 403ing — the backend blocks everything except /auth/me for
 * these two states (see backend/modules/auth/dependencies.py: get_current_active_user).
 */
export default function PendingStatusBanner() {
  const { user } = useAuth();

  if (!user || !user.status || user.status === 'approved') return null;

  const isPending = user.status === 'pending';

  return (
    <div
      role="alert"
      className={`sticky top-0 z-[200] px-[4vw] py-8 text-center text-sm font-medium ${
        isPending
          ? 'bg-warning/15 text-warning border-b border-warning/30'
          : 'bg-error/15 text-error border-b border-error/30'
      }`}
    >
      {isPending
        ? 'Your account is pending admin approval. You can look around, but most actions are disabled until an admin approves it.'
        : 'Your account was not approved. Contact an admin if you believe this is a mistake.'}
    </div>
  );
}
