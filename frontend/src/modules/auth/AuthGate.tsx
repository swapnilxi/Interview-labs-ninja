'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isLoggedIn } from '@/lib/auth/tokenStore';

/**
 * The app is login-only (2026-11-16): every page needs a signed-in user except these. A path is public
 * when it equals one of them or starts with it followed by `/`. Static files (/_next, /icons, /downloads
 * with the Android APK metadata, public/*.html) never pass through this component.
 */
export const PUBLIC_PATH_PREFIXES = [
  // The log in / sign up screen. Signing up is also how someone without an account asks for access.
  '/login',
  // Published Career Studio portfolios and resumes for visitors (/p/<slug>, /r/<slug>, /…/v/<n>).
  '/p',
  '/r',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** What a protected page shows until the login state is known: no page content, no app chrome. */
function AuthSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      <div className="h-[2.25rem] w-[2.25rem] animate-spin rounded-full border-[3px] mix-border-primary/25 border-t-primary" />
      <span className="sr-only">Checking your login…</span>
    </div>
  );
}

/**
 * Mounted once in the root layout around every page. A guest on any page outside PUBLIC_PATH_PREFIXES is
 * sent to /login?next=<this page>; the /login screen sends them back after logging in. Until the login
 * state is known (AuthContext's /auth/me check) a protected page renders only AuthSkeleton, on the server
 * too, so its content never flashes. The backends enforce the same rule on every API call.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, loading } = useAuth();

  const isPublic = isPublicPath(pathname);
  // A stored token whose /auth/me check got no answer (backend unreachable; a rejected token is cleared)
  // still counts as signed in, as in RequireAuth, so the offline fallbacks stay reachable.
  const signedIn = !!user || (!loading && isLoggedIn());
  const allowed = isPublic || signedIn;

  useEffect(() => {
    if (loading || allowed) return;
    const here = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [loading, allowed, router]);

  if (!allowed) return <AuthSkeleton />;
  return <>{children}</>;
}
