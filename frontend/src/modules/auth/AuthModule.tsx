'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'login' | 'signup';

const FEATURES = [
  { icon: 'AcademicCapIcon', title: 'AI interview prep', desc: 'Daily sessions, DSA, CV & system-design labs tuned to you.' },
  { icon: 'ClipboardDocumentCheckIcon', title: 'Tasks that sync', desc: 'Your to-dos and projects follow you across every device.' },
  { icon: 'BriefcaseIcon', title: 'Career Studio', desc: 'Build resumes and portfolios, then share them in a click.' },
];

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

  const switchMode = (next: Mode) => { setMode(next); setError(null); };

  return (
    <div className="min-h-[calc(100svh-60px)] flex items-center justify-center px-[4vw] py-24
                    bg-[radial-gradient(ellipse_at_top,var(--color-glow),transparent_60%)]">
      <div className="w-full max-w-[min(960px,94vw)] grid md:grid-cols-[1.05fr_1fr] bg-card border border-border
                      rounded-2xl shadow-xl overflow-hidden">

        {/* Brand / value panel */}
        <div className="relative hidden md:flex flex-col justify-center gap-36 p-48 text-white
                        bg-gradient-to-br from-[#5b5bd6] via-[#6d5be0] to-[#7c3aed] overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-24 w-[40%] aspect-square rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-[45%] aspect-square rounded-full bg-black/10 blur-2xl" />

          <div className="relative">
            <div className="flex items-center gap-12">
              <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="9" fill="rgba(255,255,255,0.16)" />
                <polygon points="20,6.4 23.39,16.61 33.6,20 23.39,23.39 20,33.6 16.61,23.39 6.4,20 16.61,16.61" fill="white" />
              </svg>
              <span className="font-heading text-xl font-semibold">Lab-Ninja</span>
            </div>
            <h2 className="mt-24 font-heading text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight text-white">
              {mode === 'login' ? 'Welcome back.' : 'Level up your interview prep.'}
            </h2>
            <p className="mt-12 text-sm text-white/80 max-w-[36ch]">
              Everything you build as a guest is saved to your account the moment you sign in.
            </p>
          </div>

          <ul className="relative flex flex-col gap-18">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-12">
                <span className="w-36 h-36 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Icon name={f.icon} size={18} className="text-white" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-white/75 leading-snug">{f.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Form panel */}
        <div className="p-24 sm:p-48 flex flex-col justify-center gap-18">
          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-12">
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="url(#g)" />
              <polygon points="20,6.4 23.39,16.61 33.6,20 23.39,23.39 20,33.6 16.61,23.39 6.4,20 16.61,16.61" fill="white" />
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#5b5bd6" /><stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-heading text-lg font-semibold text-foreground">Lab-Ninja</span>
          </div>

          {/* Segmented mode toggle */}
          <div className="grid grid-cols-2 gap-6 p-6 rounded-lg bg-muted">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`py-12 rounded-md text-sm font-medium transition-smooth ${
                  mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <div>
            <h1 className="font-heading text-xl font-semibold text-foreground">
              {mode === 'login' ? 'Log in to your account' : 'Create your account'}
            </h1>
            <p className="text-sm text-muted-foreground mt-6">
              {mode === 'login'
                ? 'Sync your tasks, projects, and AI features across devices.'
                : 'Your local data will be saved to this account automatically.'}
            </p>
          </div>

          {error && (
            <div className="p-12 rounded-lg border bg-error/12 border-error/40 text-error flex items-center gap-12 text-sm">
              <Icon name="ExclamationTriangleIcon" size={18} variant="solid" className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-18">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-6">Name (optional)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-12 py-12 text-sm text-foreground focus-ring transition-smooth"
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-6">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-12 py-12 text-sm text-foreground focus-ring transition-smooth"
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-6">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-12 py-12 pr-36 text-sm text-foreground focus-ring transition-smooth"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth flex items-center justify-center gap-12 focus-ring disabled:opacity-50 shadow-sm"
            >
              {submitting && (
                <span className="w-[16px] h-[16px] border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              )}
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>Don&apos;t have an account?{' '}
                <button type="button" onClick={() => switchMode('signup')} className="text-primary hover:underline font-medium">Sign up</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-primary hover:underline font-medium">Log in</button>
              </>
            )}
          </div>

          <div className="pt-18 border-t border-border text-center">
            <Link href="/todo" className="text-sm text-muted-foreground hover:text-foreground transition-smooth inline-flex items-center gap-6">
              Continue as guest
              <Icon name="ArrowRightIcon" size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
