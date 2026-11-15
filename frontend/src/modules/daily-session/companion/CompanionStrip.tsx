'use client';

import React, { useState } from 'react';
import CompanionBubble from './CompanionBubble';
import CompanionSettings from './CompanionSettings';
import CompanionControls from './CompanionControls';
import type { useCompanionVoice } from './useCompanionVoice';

/** Mascot bubble + sound/settings controls, driven by useCompanionVoice. `controls={false}` hides the buttons. */
export default function CompanionStrip({
  c,
  size,
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
    <div className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-2 sm:flex-nowrap ${className}`}>
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
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
