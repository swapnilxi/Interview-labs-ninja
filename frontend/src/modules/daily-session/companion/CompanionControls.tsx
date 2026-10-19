'use client';

import React from 'react';
import { playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import { stopSpeaking } from './voice';
import type { CompanionSettings } from './useCompanion';

interface Props {
  settings: CompanionSettings;
  update: (p: Partial<CompanionSettings>) => void;
  onOpenSettings: () => void;
}

const BTN =
  'flex h-[2.75rem] w-[2.75rem] items-center justify-center rounded-2xl border-2 text-lg transition';

/** One-tap mute sound, one-tap hide/mute Deepu, and the full settings sheet. */
export default function CompanionControls({ settings, update, onOpenSettings }: Props) {
  const soundOff = settings.soundMuted || settings.sound === 'off';

  const toggleSound = () => {
    if (settings.soundMuted) {
      update({ soundMuted: false });
      if (settings.sound !== 'off') {
        playSoundscape(settings.sound); // inside a tap, so audio is allowed
        setSoundscapeVolume(settings.volume);
      }
    } else {
      update({ soundMuted: true });
      stopSoundscape();
    }
  };

  const toggleMascot = () => {
    if (settings.mascotOn) stopSpeaking();
    update({ mascotOn: !settings.mascotOn });
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={!soundOff}
        aria-label={soundOff ? 'Turn sound on' : 'Mute sound'}
        title={soundOff ? 'Sound off. Tap to turn on' : 'Tap to mute sound'}
        className={`${BTN} ${soundOff ? 'border-border bg-muted text-muted-foreground' : 'mix-border-primary/40 lab-tint'}`}
      >
        {soundOff ? '🔇' : '🔊'}
      </button>
      <button
        type="button"
        onClick={toggleMascot}
        aria-pressed={settings.mascotOn}
        aria-label={settings.mascotOn ? 'Hide and mute Deepu' : 'Show Deepu'}
        title={settings.mascotOn ? 'Tap to hide and mute Deepu' : 'Deepu is hidden. Tap to bring him back'}
        className={`${BTN} ${settings.mascotOn ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/20' : 'border-border bg-muted text-muted-foreground opacity-70'}`}
      >
        🦉
      </button>
      <button type="button" onClick={onOpenSettings} aria-label="Sound and companion settings" className={`${BTN} border-border bg-card`}>
        ⚙️
      </button>
    </div>
  );
}
