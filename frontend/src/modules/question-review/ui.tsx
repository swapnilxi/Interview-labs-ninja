'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';
import { isMissingKeyError } from '@/lib/services/settingsService';

/** True when the user is (still) signed in; otherwise opens the login popup for `feature`. */
export function requireLogin(feature: string): boolean {
  if (isLoggedIn()) return true;
  openLoginModal({ feature, redirectTo: `${window.location.pathname}${window.location.search}` });
  return false;
}

/** A calm error line, with "Open Config" when no AI key is set up and an optional Retry. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ds-banner ds-banner-center ds-tone-rose" role="alert">
      <Icon name="ExclamationTriangleIcon" variant="solid" size={16} />
      <span className="min-w-0 flex-1">
        {message}
        {isMissingKeyError(message) && (
          <>
            {' '}
            <Link href="/config" className="font-medium underline underline-offset-2">
              Open Config
            </Link>
          </>
        )}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ds-btn ds-btn-secondary ds-btn-sm flex-shrink-0"
        >
          <Icon name="ArrowPathIcon" size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
