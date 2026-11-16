'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import { describeReturnTarget, resolveLoginReturnPath } from '@/components/auth/loginReturn';
import { useAuth } from '@/contexts/AuthContext';
import { isLoggedIn } from '@/lib/auth/tokenStore';

function nextPath(): string {
  return resolveLoginReturnPath(new URLSearchParams(window.location.search).get('next'));
}

/**
 * The /login screen. The app is login-only (src/modules/auth/AuthGate.tsx sends every guest here with
 * ?next=<the page they asked for>). Once signed in, by this form or already, it goes on to ?next=
 * (else the last page this tab showed, else the To-Do landing page; see loginReturn.ts).
 */
export default function AuthModule() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const signedIn = !!user || (!loading && isLoggedIn());
  // Read after mount (the server has no query string), so the sentence is the same on the first client render.
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    setOpening(describeReturnTarget(new URLSearchParams(window.location.search).get('next')));
  }, []);

  useEffect(() => {
    if (signedIn) router.replace(nextPath());
  }, [signedIn, router]);

  if (loading || signedIn) {
    return (
      <div role="status" className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="h-[2.25rem] w-[2.25rem] animate-spin rounded-full border-[3px] mix-border-primary/25 border-t-primary" />
        <span className="sr-only">{signedIn ? 'Opening LabNinja…' : 'Checking your login…'}</span>
      </div>
    );
  }

  return (
    // Fixed to the viewport: the body's left padding for the sidebar rail (md+) must not push the card off-centre.
    <main className="fixed inset-0 overflow-y-auto bg-background">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-[2rem] [padding-bottom:max(2rem,env(safe-area-inset-bottom))] [padding-top:max(2rem,env(safe-area-inset-top))]">
        <p className="mb-[1.25rem] font-heading text-[1.0625rem] font-bold tracking-[-0.02em] text-foreground">
          LabNinja
        </p>
        <div className="w-full max-w-md overflow-hidden rounded-[22px] border mix-border-foreground/10 bg-card shadow-2xl">
          <LoginForm
            titleId="login-title"
            opening={opening}
            onSuccess={() => router.replace(nextPath())}
          />
        </div>
      </div>
    </main>
  );
}
