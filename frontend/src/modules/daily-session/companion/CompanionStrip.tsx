'use client';

import React, { useState } from 'react';
import CompanionBubble from './CompanionBubble';
import CompanionSettings from './CompanionSettings';
import CompanionControls from './CompanionControls';
import type { useCompanionVoice } from './useCompanionVoice';

/**
 * Deepu on one line: mascot + speech bubble, and two quiet icon buttons (sound, settings) at the end of the row.
 * Driven by useCompanionVoice. `controls={false}` hides the buttons.
 */
export default function CompanionStrip({
  c,
  size = 40,
  controls = true,
  className = '',
}: {
  c: ReturnType<typeof useCompanionVoice>;
  size?: number;
  controls?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="min-w-0 flex-1">
        <CompanionBubble
          text={c.msg}
          mood={c.mood}
          speaking={c.speaking}
          size={size}
          onSpeak={() => c.say(c.msg, c.mood, true)}
        />
      </div>
      {controls && (
        <CompanionControls
          settings={c.settings}
          update={c.update}
          onOpenSettings={() => setOpen(true)}
        />
      )}
      <CompanionSettings
        open={open}
        onClose={() => setOpen(false)}
        settings={c.settings}
        update={c.update}
      />
    </div>
  );
}
