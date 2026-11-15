'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import type { CompanionSettings } from './useCompanion';

interface Props {
  settings: CompanionSettings;
  update: (p: Partial<CompanionSettings>) => void;
  onOpenSettings: () => void;
}

/**
 * Two quiet icon buttons: one-tap mute for the focus sound, and the full settings sheet (where Deepu can also be
 * hidden). Styles: .ds-ctrl in daily-session.css.
 */
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

  return (
    <div className="ds-ctrl flex-shrink-0" role="group" aria-label="Sound and companion">
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={!soundOff}
        aria-label={soundOff ? 'Turn sound on' : 'Mute sound'}
        title={soundOff ? 'Sound off. Tap to turn on' : 'Tap to mute sound'}
        data-on={!soundOff}
      >
        <Icon name={soundOff ? 'SpeakerXMarkIcon' : 'SpeakerWaveIcon'} size={18} />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Sound and companion settings"
        title="Sound and companion settings"
      >
        <Icon name="EllipsisHorizontalCircleIcon" size={20} />
      </button>
    </div>
  );
}
