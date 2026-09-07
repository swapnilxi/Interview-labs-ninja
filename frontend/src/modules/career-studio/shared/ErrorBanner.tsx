'use client';

/**
 * Shared error banner for AI-calling panels. When the failure is specifically
 * a missing-provider-key error (backend's ai_client.py raises this exact
 * substring — see settingsService.isMissingKeyError), points the user at
 * Config instead of showing a generic, unactionable message.
 */

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { isMissingKeyError } from '@/lib/services/settingsService';

export default function ErrorBanner({ message, className = 'mb-4' }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;

  if (isMissingKeyError(message)) {
    return (
      <div className={`${className} p-2.5 rounded-lg border bg-warning/12 border-warning/40 text-warning flex items-center gap-2 text-xs`}>
        <Icon name="KeyIcon" size={15} variant="solid" className="shrink-0" />
        <span className="flex-1">No AI provider key is configured yet.</span>
        <Link href="/config" className="font-semibold underline underline-offset-2 hover:opacity-80 shrink-0">Go to Config</Link>
      </div>
    );
  }

  return (
    <div className={`${className} p-2.5 rounded-lg border bg-error/12 border-error/40 text-error flex items-center gap-2 text-xs`}>
      <Icon name="ExclamationTriangleIcon" size={15} variant="solid" className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}
