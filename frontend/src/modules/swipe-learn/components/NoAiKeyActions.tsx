'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { openLoginModal } from '@/components/auth/LoginModal';
import { useAuth } from '@/contexts/AuthContext';

interface NoAiKeyActionsProps {
  /** Opens SwipeLearn's Settings sheet (its own Gemini key). */
  onOpenSettings: () => void;
  /** Called before leaving for Config or opening another sheet (e.g. to close the sheet this sits in). */
  onBeforeAction?: () => void;
  layout?: 'stack' | 'inline';
  showNote?: boolean;
}

/**
 * What to do when there is no AI to write cards. Logged in: the server found no key for the Config model, so the
 * fix is a key on the Config page (or SwipeLearn's own Gemini key). Guest: log in to use any Config model, or add a
 * Gemini key that this browser uses directly.
 */
export default function NoAiKeyActions({
  onOpenSettings,
  onBeforeAction,
  layout = 'stack',
  showNote = true,
}: NoAiKeyActionsProps) {
  const { isGuest } = useAuth();
  const small = layout === 'inline' ? ' swipe-btn-sm' : '';

  const note = isGuest
    ? 'Log in to use any AI model you set up in Config, or add a free Gemini key that this browser uses directly.'
    : 'No AI key is set up for your Config model yet. Add one in Config and SwipeLearn writes cards with that model.';

  const gemini = (
    <button
      type="button"
      onClick={() => {
        onBeforeAction?.();
        onOpenSettings();
      }}
      className={`swipe-secondary-btn${small}`}
    >
      <Icon name="KeyIcon" size={layout === 'inline' ? 16 : 17} />
      {isGuest ? 'Add a Gemini key' : 'Use a Gemini key instead'}
    </button>
  );

  const primary = isGuest ? (
    <button
      type="button"
      onClick={() => {
        onBeforeAction?.();
        openLoginModal();
      }}
      className={`swipe-primary-btn${small}`}
    >
      <Icon name="ArrowRightOnRectangleIcon" size={layout === 'inline' ? 17 : 18} />
      Log in
    </button>
  ) : (
    <Link href="/config" onClick={() => onBeforeAction?.()} className={`swipe-primary-btn${small}`}>
      <Icon name="Cog6ToothIcon" size={layout === 'inline' ? 17 : 18} />
      Add a key in Config
    </Link>
  );

  return (
    <div className={layout === 'inline' ? 'flex flex-col items-center gap-2' : 'space-y-2.5'}>
      {showNote && (
        <div className="swipe-note swipe-note-warn text-left">
          <Icon name="KeyIcon" size={18} className="mt-px shrink-0" />
          <span>{note}</span>
        </div>
      )}
      <div
        className={
          layout === 'inline' ? 'flex flex-wrap items-center justify-center gap-2' : 'flex flex-col gap-2'
        }
      >
        {primary}
        {gemini}
      </div>
    </div>
  );
}
