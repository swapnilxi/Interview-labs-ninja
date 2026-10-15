'use client';

import React, { useState } from 'react';
import CompanionBubble from './CompanionBubble';
import CompanionSettings from './CompanionSettings';
import CompanionControls from './CompanionControls';
import type { useCompanionVoice } from './useCompanionVoice';

/** Mascot bubble + sound/settings button, driven by useCompanionVoice. */
export default function CompanionStrip({ c }: { c: ReturnType<typeof useCompanionVoice> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex-1">
        <CompanionBubble text={c.msg} mood={c.mood} speaking={c.speaking} onSpeak={() => c.say(c.msg, c.mood)} />
      </div>
      <CompanionControls settings={c.settings} update={c.update} onOpenSettings={() => setOpen(true)} />
      <CompanionSettings open={open} onClose={() => setOpen(false)} settings={c.settings} update={c.update} />
    </div>
  );
}
