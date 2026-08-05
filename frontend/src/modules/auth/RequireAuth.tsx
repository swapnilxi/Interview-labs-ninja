'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

const PERKS = [
  { icon: 'SparklesIcon', text: 'AI-generated questions & feedback' },
  { icon: 'ChartBarIcon', text: 'Progress tracked across sessions' },
  { icon: 'CloudArrowUpIcon', text: 'Synced to your account, every device' },
];

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
        <div className="w-[40px] h-[40px] border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="min-h-[calc(100svh-60px)] flex items-center justify-center px-[4vw] py-36
                      bg-[radial-gradient(ellipse_at_top,var(--color-glow),transparent_60%)]">
        <div className="w-full max-w-[440px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          {/* Gradient header */}
          <div className="relative px-24 pt-36 pb-24 text-center text-white overflow-hidden
                          bg-gradient-to-br from-[#5b5bd6] via-[#6d5be0] to-[#7c3aed]">
            <div className="pointer-events-none absolute -top-24 -right-24 w-[45%] aspect-square rounded-full bg-white/10 blur-2xl" />
            <div className="relative mx-auto w-[56px] h-[56px] rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Icon name="LockClosedIcon" size={26} className="text-white" />
            </div>
            <h2 className="relative mt-18 font-heading text-xl font-semibold text-white">Log in to use {feature}</h2>
            <p className="relative mt-6 text-sm text-white/80 max-w-[34ch] mx-auto">
              This feature is AI-powered and tracks your progress, so it needs an account.
            </p>
          </div>

          {/* Body */}
          <div className="p-24 flex flex-col gap-24">
            <ul className="flex flex-col gap-12">
              {PERKS.map((p) => (
                <li key={p.text} className="flex items-center gap-12 text-sm text-foreground">
                  <span className="w-36 h-36 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-12">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-6 py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth focus-ring shadow-sm"
              >
                Log in or sign up
                <Icon name="ArrowRightIcon" size={16} />
              </Link>
              <Link
                href="/todo"
                className="text-center text-xs text-muted-foreground hover:text-foreground transition-smooth"
              >
                Your to-do lists stay fully usable as a guest →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
