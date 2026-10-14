'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

export const OPEN_LOGIN_MODAL_EVENT = 'open-login-modal';

export interface OpenLoginModalDetail {
  feature?: string;
  redirectTo?: string;
}

export function openLoginModal(detail?: OpenLoginModalDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_LOGIN_MODAL_EVENT, {
      detail: detail || {},
    })
  );
}

export default function LoginModal() {
  const router = useRouter();
  const { login, signup, user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [feature, setFeature] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>('/ai-todo?tab=quick');

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen to open modal events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<OpenLoginModalDetail>;
      const detail = customEvent.detail || {};
      setFeature(detail.feature || null);
      if (detail.redirectTo) {
        setRedirectTo(detail.redirectTo);
      } else {
        setRedirectTo('/ai-todo?tab=quick');
      }
      setError(null);
      setIsOpen(true);
    };

    window.addEventListener(OPEN_LOGIN_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_LOGIN_MODAL_EVENT, handleOpen);
  }, []);

  // Close modal if user gets authenticated
  useEffect(() => {
    if (user && isOpen) {
      setIsOpen(false);
    }
  }, [user, isOpen]);

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

      setIsOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
  };

  return (
    <Modal
      open={isOpen}
      onClose={() => setIsOpen(false)}
      labelledBy="login-modal-title"
      size="md"
    >
      <div className="relative overflow-hidden rounded-2xl bg-card border border-border shadow-2xl">
        {/* Modal Top Header Gradient */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#5b5bd6] via-[#6d5be0] to-[#7c3aed] p-6 text-center text-white">
          <div className="pointer-events-none absolute -top-16 -right-16 w-36 h-36 rounded-full bg-white/10 blur-xl" />
          <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-md">
            <Icon name="LockClosedIcon" size={24} className="text-white" />
          </div>
          <h2 id="login-modal-title" className="font-heading text-xl font-bold tracking-tight">
            {feature ? `Log in to use ${feature}` : mode === 'login' ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="mt-1 text-xs text-white/80 max-w-[36ch] mx-auto">
            {feature
              ? 'This feature is AI-powered and tracks your progress across sessions.'
              : 'Everything you practice or build as a guest is saved to your account.'}
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-500">
              <Icon name="ExclamationCircleIcon" size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ninja Candidate"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                autoFocus={mode === 'login'}
                placeholder="ninja@labs.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 py-3 text-sm font-bold text-white shadow-md shadow-primary/25 hover:opacity-95 disabled:opacity-50 transition-opacity"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Icon name="ArrowRightIcon" size={16} />
              )}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Mode switch */}
          <div className="mt-5 border-t border-border/60 pt-4 text-center">
            {mode === 'login' ? (
              <p className="text-xs text-muted-foreground">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-bold text-primary hover:underline ml-1"
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
                  className="font-bold text-primary hover:underline ml-1"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
