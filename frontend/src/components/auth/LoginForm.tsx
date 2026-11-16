'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The log in / sign up card body: header (icon tile, title, one line), the form and the mode switch. Shared by the
 * /login screen (src/modules/auth/AuthModule.tsx) and the in-page LoginModal. Plain email + password against
 * /auth/login and /auth/signup: no popup window or redirect, so it works inside the Android app's WebView too.
 */
export default function LoginForm({
  titleId,
  feature,
  opening,
  onSuccess,
}: {
  /** id for the heading, so the dialog or page can point aria-labelledby at it. */
  titleId: string;
  /** "Log in to use <feature>" instead of the plain title. */
  feature?: string | null;
  /** What the person is about to open after logging in ("the class you were sent"): said in the one line under the title. */
  opening?: string | null;
  onSuccess?: () => void;
}) {
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result =
        mode === 'login'
          ? await login(email.trim(), password)
          : await signup(email.trim(), password, displayName.trim() || undefined);

      if (result.ok === false) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      onSuccess?.();
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="relative">
      {/* Header: the system's own surface (the violet gradient band is retired), an icon tile, title and one line. */}
      <div className="px-[1.75rem] pb-1 pt-[1.75rem] text-center">
        <div className="mx-auto mb-[0.875rem] flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-[16px] mix-bg-primary/15">
          <Icon name="LockClosedIcon" size={24} className="lab-ink" />
        </div>
        <h2
          id={titleId}
          className="font-heading text-[1.375rem] font-bold tracking-[-0.022em] text-foreground"
        >
          {feature
            ? `Log in to use ${feature}`
            : mode === 'login'
              ? 'Welcome back'
              : 'Create an account'}
        </h2>
        <p className="mx-auto mt-1 max-w-[36ch] text-[13px] leading-snug text-muted-foreground">
          {feature
            ? 'This feature is AI-powered and tracks your progress across sessions.'
            : opening
              ? mode === 'login'
                ? `Log in to open ${opening}.`
                : `Create an account to open ${opening}.`
              : mode === 'login'
                ? 'Log in to continue to LabNinja.'
                : 'Create an account to get started.'}
        </p>
      </div>

      {/* Form Body */}
      <div className="px-[1.75rem] pt-[1.5rem] pb-[1.75rem]">
        {error && (
          <div className="mb-[1.125rem] flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-500">
            <Icon name="ExclamationCircleIcon" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-[1.125rem]">
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="login-name"
                className="mb-[0.375rem] block text-[13px] font-medium text-muted-foreground"
              >
                Full name
              </label>
              <input
                id="login-name"
                type="text"
                required
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                autoFocus
                placeholder="Ninja Candidate"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="todo-input h-[3rem] px-[0.875rem] text-base sm:text-sm"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="login-email"
              className="mb-[0.375rem] block text-[13px] font-medium text-muted-foreground"
            >
              Email address
            </label>
            {/* Keyboard + autofill hints: the email keyboard, no auto-capital or autocorrect, and the field password
                managers (Google Password Manager, iCloud Keychain) recognise as the account name. */}
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete={mode === 'login' ? 'username' : 'email'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              autoFocus={mode === 'login'}
              placeholder="ninja@labs.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="todo-input h-[3rem] px-[0.875rem] text-base sm:text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-[0.375rem] block text-[13px] font-medium text-muted-foreground"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                enterKeyHint="go"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="todo-input h-[3rem] px-[0.875rem] pr-10 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-[0.5rem] flex h-[3rem] w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="ArrowRightIcon" size={16} />
            )}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Mode switch */}
        <div className="mt-[1.5rem] border-t border-border pt-[1.125rem] text-center">
          {mode === 'login' ? (
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="lab-ink ml-1 font-semibold hover:underline"
              >
                Sign up free
              </button>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="lab-ink ml-1 font-semibold hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
