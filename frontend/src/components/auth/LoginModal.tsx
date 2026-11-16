'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import LoginForm from './LoginForm';
import { rememberReturnPath } from './loginReturn';

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

/**
 * Remembers the page the user is on, query string included, so /login can send them back to it when it
 * has no ?next=. Keyed on the query too, not just the path: the in-page tabs (?tab=…) change only the query.
 * Its own component because useSearchParams needs a Suspense boundary.
 */
function LoginReturnTracker() {
  const pathname = usePathname();
  const query = useSearchParams().toString();

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/login/')) return;
    rememberReturnPath(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);

  return null;
}

/**
 * In-page login popup (openLoginModal). The app is login-only (2026-11-16): a guest never sees a page
 * other than /login and the published /p and /r pages (src/modules/auth/AuthGate.tsx), and /login renders
 * the same form as a screen of its own. The popup stays for the callers that still open it.
 */
export default function LoginModal() {
  const router = useRouter();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [feature, setFeature] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>('');

  // Listen to open modal events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<OpenLoginModalDetail>;
      const detail = customEvent.detail || {};
      setFeature(detail.feature || null);
      // No redirect by default: log in right where the user is.
      setRedirectTo(detail.redirectTo || '');
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

  const handleSuccess = () => {
    setIsOpen(false);
    if (redirectTo) {
      router.push(redirectTo);
    }
  };

  return (
    <>
      <Suspense fallback={null}>
        <LoginReturnTracker />
      </Suspense>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy="login-modal-title"
        className="w-full max-w-md overflow-hidden rounded-[22px] border mix-border-foreground/10 bg-card shadow-2xl"
      >
        <LoginForm titleId="login-modal-title" feature={feature} onSuccess={handleSuccess} />
      </Modal>
    </>
  );
}
