'use client';

import React from 'react';
import Mascot from './Mascot';
import type { Mood } from './content';
import { useCompanionSettings } from './useCompanion';

interface Props {
  text: string;
  mood?: Mood;
  speaking?: boolean;
  size?: number;
  onSpeak?: () => void;
  className?: string;
}

/** Mascot + speech bubble. Tap the bubble to hear the line again. */
export default function CompanionBubble({
  text,
  mood = 'happy',
  speaking,
  size = 40,
  onSpeak,
  className = '',
}: Props) {
  const [settings] = useCompanionSettings();
  if (!settings.mascotOn) return null;
  return (
    <div className={`flex items-end gap-2.5 ${className}`}>
      <Mascot mood={mood} speaking={speaking} size={size} className="flex-shrink-0" />
      <button
        type="button"
        onClick={onSpeak}
        className="ds-bubble min-w-0"
        aria-label={`Deepu says: ${text}. Tap to hear it.`}
      >
        {text}
      </button>
    </div>
  );
}
