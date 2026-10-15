'use client';

import React, { useEffect, useState } from 'react';
import { SOUNDSCAPES, playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import { VOICE_PRESETS, speak, stopSpeaking, voicesAvailable } from './voice';
import type { CompanionSettings as Settings } from './useCompanion';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
}

/** Bottom sheet on phones, centred card on larger screens. */
export default function CompanionSettings({ open, onClose, settings, update }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(voicesAvailable());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [open]);

  if (!open) return null;
  const chosen = SOUNDSCAPES.find((s) => s.id === settings.sound);

  const pickSound = (id: Settings['sound']) => {
    update({ sound: id, soundMuted: false });
    if (id === 'off') stopSoundscape();
    else playSoundscape(id);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Companion settings">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1.5 w-[3rem] rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-extrabold text-foreground">Sound & Companion</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white">Done</button>
        </div>

        <label className="mb-4 flex items-center justify-between rounded-2xl border-2 border-border px-3 py-3 text-sm font-bold text-foreground">
          Show Deepu (off hides him and his voice)
          <input type="checkbox" checked={settings.mascotOn} onChange={(e) => { update({ mascotOn: e.target.checked }); if (!e.target.checked) stopSpeaking(); }} className="h-5 w-5 accent-violet-600" />
        </label>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Focus sound</h3>
        <div className="grid grid-cols-2 gap-2">
          {SOUNDSCAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickSound(s.id)}
              className={`rounded-2xl border-2 px-3 py-3 text-left text-sm font-bold transition ${
                settings.sound === s.id
                  ? 'border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <span className="mr-1.5">{s.emoji}</span>
              {s.label}
              {s.headphones && <span className="ml-1 text-[10px] font-semibold text-muted-foreground">🎧</span>}
            </button>
          ))}
        </div>
        {chosen && <p className="mt-2 text-xs text-muted-foreground">{chosen.hint}</p>}
        <label className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          Volume
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
            className="flex-1 accent-violet-600"
          />
        </label>
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Honest note: research on binaural beats is mixed. Think of these as calming focus aids, not a guaranteed brain boost. 🎧 presets work best with stereo headphones.
        </p>

        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Companion voice</h3>
        <label className="mb-2 flex items-center justify-between rounded-2xl border-2 border-border px-3 py-3 text-sm font-bold text-foreground">
          Deepu talks
          <input type="checkbox" checked={settings.voiceOn} onChange={(e) => update({ voiceOn: e.target.checked })} className="h-5 w-5 accent-violet-600" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {VOICE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                update({ voicePreset: p.id });
                speak("Hi! I'm Deepu. Ready to learn together?", p.id, settings.voiceURI);
              }}
              className={`rounded-2xl border-2 px-2 py-3 text-center text-xs font-bold transition ${
                settings.voicePreset === p.id
                  ? 'border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100'
                  : 'border-border text-foreground'
              }`}
            >
              <div className="text-xl">{p.emoji}</div>
              {p.label}
            </button>
          ))}
        </div>
        {voices.length > 0 && (
          <select
            value={settings.voiceURI ?? ''}
            onChange={(e) => update({ voiceURI: e.target.value || null })}
            className="mt-2 w-full rounded-xl border-2 border-border bg-input px-3 py-2.5 text-sm text-foreground"
            aria-label="Voice"
          >
            <option value="">Auto voice</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">The cute pitch comes from your device&apos;s own voices; some phones ignore pitch, so try a different voice if it sounds too normal.</p>

        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Extras</h3>
        <label className="mb-2 flex items-center justify-between rounded-2xl border-2 border-border px-3 py-3 text-sm font-bold text-foreground">
          Spiritual touches (mantras & Gita verses)
          <input type="checkbox" checked={settings.spiritual} onChange={(e) => update({ spiritual: e.target.checked })} className="h-5 w-5 accent-violet-600" />
        </label>
        <label className="flex items-center justify-between rounded-2xl border-2 border-border px-3 py-3 text-sm font-bold text-foreground">
          Little chimes
          <input type="checkbox" checked={settings.chimes} onChange={(e) => update({ chimes: e.target.checked })} className="h-5 w-5 accent-violet-600" />
        </label>
      </div>
    </div>
  );
}
