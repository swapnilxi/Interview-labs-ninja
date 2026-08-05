'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Gates the admin portal. Shows a spinner while auth resolves, a "log in"
 * prompt for guests, and a "not authorized" screen for logged-in non-admins.
 * The backend independently enforces admin on every /admin/* route — this is
 * UX, not the security boundary.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isGuest, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-[40px] h-[40px] border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isGuest || !isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-[4vw] py-48">
        <div className="max-w-[420px] text-center bg-card border border-border rounded-lg shadow-md p-36 flex flex-col items-center gap-18">
          <div className="w-48 h-48 rounded-full bg-error/10 flex items-center justify-center">
            <Icon name="ShieldExclamationIcon" size={24} className="text-error" />
          </div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {isGuest ? 'Admins only' : 'You don’t have access'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isGuest
              ? 'The admin portal requires an administrator account. Log in to continue.'
              : 'This area is restricted to administrators. If you believe this is a mistake, ask an existing admin to grant you access.'}
          </p>
          <Link
            href={isGuest ? '/login' : '/daily-session'}
            className="inline-flex items-center justify-center gap-6 py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth focus-ring"
          >
            {isGuest ? 'Log in' : 'Back to app'}
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
