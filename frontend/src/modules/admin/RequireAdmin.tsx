'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMyAccessRequests,
  submitAccessRequest,
  type AccessRequest,
} from '@/lib/services/accessRequestService';

/**
 * Gates the admin portal. Shows a spinner while auth resolves, a "log in"
 * prompt for guests, and — for a logged-in user without portal access — a
 * "not authorized" screen with a self-service request-access form.
 * The backend independently enforces this on every /admin/* route (require_permission
 * ("users:manage")) — this is UX, not the security boundary.
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isGuest, hasPermission, loading } = useAuth();
  const authorized = hasPermission('users:manage');

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-[40px] h-[40px] border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isGuest || !authorized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-[4vw] py-48">
        <div className="max-w-[420px] w-full text-center bg-card border border-border rounded-lg shadow-md p-36 flex flex-col items-center gap-18">
          <div className="w-48 h-48 rounded-full bg-error/10 flex items-center justify-center">
            <Icon name="ShieldExclamationIcon" size={24} className="text-error" />
          </div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {isGuest ? 'Admins only' : 'You don’t have access'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isGuest
              ? 'The admin portal requires an administrator account. Log in to continue.'
              : 'This area is restricted. You can ask an admin to grant you access below.'}
          </p>
          {isGuest ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-6 py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth focus-ring"
            >
              Log in
            </Link>
          ) : (
            <RequestAdminAccess />
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function RequestAdminAccess() {
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyAccessRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  if (requests === null) {
    return (
      <div className="w-[24px] h-[24px] border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    );
  }

  const relevant = requests.filter((r) => r.requested_role === 'admin');
  const latest = relevant[0] ?? null;

  if (latest?.status === 'pending') {
    return (
      <div className="w-full rounded-lg border border-border bg-background px-18 py-12 text-sm text-muted-foreground">
        <Icon name="ClockIcon" size={16} className="inline-block mr-6 align-[-2px]" />
        Your request is waiting on an admin to review it.
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const created = await submitAccessRequest({
        requested_role: 'admin',
        message: message.trim(),
      });
      setRequests([created, ...(requests ?? [])]);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-12 text-left">
      {latest?.status === 'rejected' && (
        <div className="rounded-lg border border-border bg-background px-18 py-12 text-xs text-muted-foreground">
          Your last request was declined{latest.review_note ? `: "${latest.review_note}"` : '.'} You
          can ask again below.
        </div>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Optional note for the admin reviewing this (why you need access)"
        rows={3}
        className="w-full rounded-md border border-border bg-input px-12 py-12 text-sm text-foreground focus-ring transition-smooth"
      />
      {error && <p className="text-xs text-error">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="inline-flex items-center justify-center gap-6 py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth focus-ring disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Request admin access'}
      </button>
    </div>
  );
}
