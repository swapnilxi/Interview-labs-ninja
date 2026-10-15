'use client';

import Link from 'next/link';
import { isMissingKeyError } from '@/lib/services/settingsService';

/**
 * Inline message for a failed AI call. The backend words every provider failure as "No API key
 * configured or all providers failed … Last error: …", so the message is shown as is, with a link to
 * Config alongside it when it is that kind of failure.
 */
export default function AiError({
  message,
  className = '',
}: {
  message: string;
  className?: string;
}) {
  return (
    <p role="alert" className={`text-xs text-error ${className}`}>
      {message}
      {isMissingKeyError(message) && (
        <>
          {' '}
          <Link
            href="/config"
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Go to Config
          </Link>
        </>
      )}
    </p>
  );
}
