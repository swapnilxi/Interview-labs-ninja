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
}

/** Mascot + speech bubble. Tap the bubble to hear the line again. */
export default function CompanionBubble({ text, mood = 'happy', speaking, size = 72, onSpeak }: Props) {
  const [settings] = useCompanionSettings();
  if (!settings.mascotOn) return null;
  return (
    <div className="flex items-end gap-3">
      <Mascot mood={mood} speaking={speaking} size={size} className="flex-shrink-0" />
      <button
        type="button"
        onClick={onSpeak}
        className="relative flex-1 rounded-2xl rounded-bl-md border-2 mix-border-primary/30 bg-card px-4 py-3 text-left text-sm font-semibold leading-snug text-foreground"
        aria-label="Companion message. Tap to hear it."
      >
        {text}
      </button>
    </div>
  );
}
