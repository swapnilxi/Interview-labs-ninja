'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'login' | 'signup';

export default function AuthModule() {
  const router = useRouter();
  const { user, login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace('/todo');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = mode === 'login'
      ? await login(email.trim(), password)
      : await signup(email.trim(), password, displayName.trim() || undefined);
    setSubmitting(false);
    if (result.ok === false) {
      setError(result.error);
      return;
    }
    router.push('/todo');
  };

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-4 py-40">
      <div className="w-full max-w-[400px] bg-card border border-border rounded-lg shadow-md p-24 space-y-20">
        <div className="text-center space-y-6">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            {mode === 'login' ? 'Log in' : 'Create an account'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login'
              ? 'Sync your tasks, projects, and AI features across devices.'
              : 'Your local data will be saved to this account automatically.'}
          </p>
        </div>

        {error && (
          <div className="p-12 rounded-lg border bg-error/15 border-error text-error-foreground flex items-center gap-10 text-sm">
            <Icon name="ExclamationTriangleIcon" size={18} variant="solid" className="text-error shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-14">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-4">Name (optional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-4">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-4">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-12 py-9 pr-40 text-sm text-foreground focus-ring transition-smooth"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
              </button>
            </div>
            {mode === 'signup' && (
              <p className="mt-4 text-[11px] text-muted-foreground">At least 8 characters.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-10 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth flex items-center justify-center gap-10 focus-ring disabled:opacity-50"
          >
            {submitting && (
              <span className="w-16 h-16 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            )}
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(null); }} className="text-primary hover:underline font-medium">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(null); }} className="text-primary hover:underline font-medium">
                Log in
              </button>
            </>
          )}
        </div>

        <div className="pt-4 border-t border-border text-center">
          <Link href="/todo" className="text-sm text-muted-foreground hover:text-foreground transition-smooth inline-flex items-center gap-6">
            <Icon name="ArrowRightIcon" size={14} />
            Continue as guest
          </Link>
        </div>
      </div>
    </div>
  );
}
