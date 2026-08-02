'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Gates an interview-prep module behind login. These modules are AI-driven
 * and track per-user history, so — unlike the Todo app, which fully works
 * for guests — they require an account. Wrap a page's module render with
 * this; it shows a lightweight "log in" screen for guests instead of the
 * module, and renders children once logged in.
 */
export default function RequireAuth({ children, feature }: { children: React.ReactNode; feature: string }) {
  const { isGuest, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-40 h-40 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-40">
        <div className="max-w-[420px] text-center bg-card border border-border rounded-lg shadow-md p-32 space-y-16">
          <div className="mx-auto w-48 h-48 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="LockClosedIcon" size={24} className="text-primary" />
          </div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Log in to use {feature}</h2>
          <p className="text-sm text-muted-foreground">
            This feature tracks your progress and uses AI, so it needs an account. Your to-do lists stay fully usable as a guest — this is the one part that needs a login.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-8 py-10 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth focus-ring"
          >
            Log in or sign up
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
