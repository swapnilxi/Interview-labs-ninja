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
        className="relative flex-1 rounded-2xl rounded-bl-md border-2 border-violet-200 bg-white px-4 py-3 text-left text-sm font-semibold leading-snug text-violet-950 shadow-sm dark:border-violet-500/40 dark:bg-violet-950/60 dark:text-violet-50"
        aria-label="Companion message. Tap to hear it."
      >
        {text}
      </button>
    </div>
  );
}
