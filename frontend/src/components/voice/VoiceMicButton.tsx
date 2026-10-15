'use client';

import React from 'react';
import type { useVoiceInput } from './useVoiceInput';

type VoiceState = ReturnType<typeof useVoiceInput>['state'];

interface Props {
  state: VoiceState;
  onClick: () => void;
  /** Extra classes (positioning). */
  className?: string;
  size?: 'sm' | 'md';
}

/** Round icon-only mic button, styled to sit inside a text box like the ones in chat apps. */
export default function VoiceMicButton({ state, onClick, className = '', size = 'md' }: Props) {
  const recording = state === 'recording';
  const busy = state === 'transcribing';
  const dim = size === 'sm' ? 'h-[1.9rem] w-[1.9rem]' : 'h-[2.25rem] w-[2.25rem]';
  const label = recording ? 'Stop dictation' : busy ? 'Transcribing…' : 'Dictate with your voice';
  return (
    <button
      type="button"
      // Keep focus (and the caret) in the text box when the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={recording}
      title={label}
      className={`relative flex ${dim} flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-wait ${
        recording
          ? 'bg-rose-500 text-white shadow-[0_0_0_4px_rgba(244,63,94,0.2)]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } ${className}`}
    >
      {recording && (
        <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" aria-hidden />
      )}
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      ) : recording ? (
        <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="currentColor" aria-hidden>
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[1.15rem] w-[1.15rem]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      )}
    </button>
  );
}
