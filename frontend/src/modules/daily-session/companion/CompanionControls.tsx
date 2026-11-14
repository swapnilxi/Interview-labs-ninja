'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import { stopSpeaking } from './voice';
import type { CompanionSettings } from './useCompanion';

interface Props {
  settings: CompanionSettings;
  update: (p: Partial<CompanionSettings>) => void;
  onOpenSettings: () => void;
}

/** One-tap mute sound, one-tap hide/mute Deepu, and the full settings sheet (styles: .ds-ctrl in daily-session.css). */
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
    <div className="ds-ctrl flex-shrink-0" role="group" aria-label="Sound and companion">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={!soundOff}
        aria-label={soundOff ? 'Turn sound on' : 'Mute sound'}
        title={soundOff ? 'Sound off. Tap to turn on' : 'Tap to mute sound'}
        data-on={!soundOff}
        data-off={soundOff}
      >
        <Icon name={soundOff ? 'SpeakerXMarkIcon' : 'SpeakerWaveIcon'} size={18} />
      </button>
      <button
        type="button"
        onClick={toggleMascot}
        aria-pressed={settings.mascotOn}
        aria-label={settings.mascotOn ? 'Hide and mute Deepu' : 'Show Deepu'}
        title={
          settings.mascotOn
            ? 'Tap to hide and mute Deepu'
            : 'Deepu is hidden. Tap to bring him back'
        }
        data-on={settings.mascotOn}
        data-off={!settings.mascotOn}
      >
        <Icon name="FaceSmileIcon" size={18} />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Sound and companion settings"
        title="Sound and companion settings"
      >
        <Icon name="AdjustmentsHorizontalIcon" size={18} />
      </button>
    </div>
  );
}
