'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import FlatIcon from '@/components/ui/FlatIcon';
import Icon from '@/components/ui/AppIcon';
import { SOUNDSCAPES, playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import { VOICE_PRESETS, speak, stopSpeaking, voicesAvailable } from './voice';
import type { CompanionSettings as Settings } from './useCompanion';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
}

/** A row with a label and an iOS switch. */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ds-list-row cursor-pointer">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium ds-ink">{label}</span>
        {hint && <span className="block text-xs ds-faint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="ds-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Sound & companion settings. A bottom sheet on phones (Modal does that), a centred card above. */
export default function CompanionSettings({ open, onClose, settings, update }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(voicesAvailable());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [open]);

  const chosen = SOUNDSCAPES.find((s) => s.id === settings.sound);

  const pickSound = (id: Settings['sound']) => {
    update({ sound: id, soundMuted: false });
    if (id === 'off') stopSoundscape();
    else playSoundscape(id);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      labelledBy="ds-companion-title"
      className="lab-page ds-skin ios-sheet flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-lg"
    >
      <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
        <span />
      </div>
      <div className="ios-sheet-head sm:pt-4">
        <h2 id="ds-companion-title" className="ios-sheet-title">
          Sound & companion
        </h2>
        <button type="button" onClick={onClose} className="sheet-done ds-tone-indigo ds-tone-text">
          Done
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-[calc(1.25rem+var(--safe-bottom))]">
        <div className="ds-list">
          <SwitchRow
            label="Show Deepu"
            hint="Off hides him and his voice"
            checked={settings.mascotOn}
            onChange={(v) => {
              update({ mascotOn: v });
              if (!v) stopSpeaking();
            }}
          />
          <SwitchRow
            label="Deepu talks"
            checked={settings.voiceOn}
            onChange={(v) => update({ voiceOn: v })}
          />
        </div>

        <section aria-labelledby="ds-sound-title">
          <h3 id="ds-sound-title" className="mb-1.5 px-1 text-[13px] font-medium ds-faint">
            Focus sound
          </h3>
          <div
            className="ds-list"
            data-icons="true"
            role="radiogroup"
            aria-labelledby="ds-sound-title"
          >
            {SOUNDSCAPES.map((s) => {
              const on = settings.sound === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickSound(s.id)}
                  className="ds-list-row"
                >
                  <span className="ds-icon-tile ds-icon-tile-sm ds-tone-neutral">
                    <FlatIcon name={s.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-medium ds-ink">{s.label}</span>
                  {s.headphones && (
                    <span className="flex items-center" title="Best with stereo headphones">
                      <FlatIcon name="headphones" size={15} label="Best with headphones" />
                    </span>
                  )}
                  <Icon
                    name="CheckIcon"
                    size={18}
                    className={`flex-shrink-0 ds-tone-indigo ds-tone-text ${on ? '' : 'invisible'}`}
                  />
                </button>
              );
            })}
          </div>
          {chosen && <p className="mt-2 px-1 text-xs ds-faint">{chosen.hint}</p>}
          <label className="mt-3 flex items-center gap-3 px-1 text-xs font-medium ds-faint">
            <Icon name="SpeakerXMarkIcon" size={16} />
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                update({ volume: v });
                setSoundscapeVolume(v);
              }}
              className="flex-1 accent-primary"
            />
            <Icon name="SpeakerWaveIcon" size={16} />
          </label>
          <p className="mt-3 flex items-start gap-2 px-1 text-[11.5px] leading-relaxed ds-faint">
            <FlatIcon name="headphones" size={14} className="mt-0.5" />
            <span>
              Research on binaural beats is mixed: treat them as calming focus aids, not a
              guaranteed boost. The headphone presets need stereo headphones.
            </span>
          </p>
        </section>

        <section aria-labelledby="ds-voice-title">
          <h3 id="ds-voice-title" className="mb-1.5 px-1 text-[13px] font-medium ds-faint">
            Companion voice
          </h3>
          <div className="ds-seg" role="radiogroup" aria-labelledby="ds-voice-title">
            {VOICE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={settings.voicePreset === p.id}
                aria-pressed={settings.voicePreset === p.id}
                onClick={() => {
                  update({ voicePreset: p.id });
                  speak("Hi! I'm Deepu. Ready to learn together?", p.id, settings.voiceURI);
                }}
              >
                <FlatIcon name={p.icon} size={15} />
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
          {voices.length > 0 && (
            <select
              value={settings.voiceURI ?? ''}
              onChange={(e) => update({ voiceURI: e.target.value || null })}
              className="ds-field mt-2 py-2.5 text-sm"
              aria-label="Voice"
            >
              <option value="">Auto voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          )}
          <p className="mt-2 px-1 text-[11.5px] ds-faint">
            The voice comes from your device; some phones ignore pitch, so try another voice if it
            sounds too plain.
          </p>
        </section>

        <section aria-labelledby="ds-extras-title">
          <h3 id="ds-extras-title" className="mb-1.5 px-1 text-[13px] font-medium ds-faint">
            Extras
          </h3>
          <div className="ds-list">
            <SwitchRow
              label="Spiritual touches"
              hint="Mantras and Gita verses"
              checked={settings.spiritual}
              onChange={(v) => update({ spiritual: v })}
            />
            <SwitchRow
              label="Little chimes"
              checked={settings.chimes}
              onChange={(v) => update({ chimes: v })}
            />
          </div>
        </section>
      </div>
    </Modal>
  );
}
