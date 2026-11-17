'use client';

import React, { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import type { ThreadItem } from '@/lib/services/agentService';
import { isDeepgramEnabled } from '@/modules/ai-lms/services/voiceService';
import ActionCard from './ActionCard';
import AssistantMarkdown from './AssistantMarkdown';
import { useVoiceConversation, type VoicePhase } from './useVoiceConversation';
import { deviceVoices, speaker, type VoiceEngine, type VoiceSettings } from './voice';

/**
 * Voice mode: talk to the Assistant hands-free. It listens until you stop talking, answers out loud, and listens again.
 * Everything said lands in the same conversation, and actions show here as the same cards (Undo, Edit, Delete?).
 */

interface Props {
  open: boolean;
  onClose: () => void;
  send: (text: string, opts: { voice?: boolean }) => Promise<ThreadItem | null>;
  settings: VoiceSettings;
  onSettings: (next: VoiceSettings) => void;
  onUndo: (itemId: string, index: number) => void;
  onConfirm: (itemId: string, index: number, yes: boolean) => void;
  onEditSchedule: (id: number) => void;
  /** The live copy of an answer (its action cards change state after Undo / Delete). */
  liveItem: (id: string) => ThreadItem | undefined;
}

const PHASE_TEXT: Record<VoicePhase, string> = {
  off: 'Starting…',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  paused: 'Paused',
  error: 'Something went wrong',
};

const PHASE_HINT: Record<VoicePhase, string> = {
  off: '',
  listening: 'Talk, then pause. Tap the circle when you’re done.',
  thinking: 'Reading your data, and the web if it needs to.',
  speaking: 'Tap the circle to interrupt.',
  paused: 'Tap the circle to talk.',
  error: 'Tap the circle to try again.',
};

export default function VoiceMode(props: Props) {
  const { open, onClose, send, settings, onSettings } = props;
  const orbRef = useRef<HTMLButtonElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const convo = useVoiceConversation({
    send,
    settings,
    onLevel: (level) => orbRef.current?.style.setProperty('--level', level.toFixed(3)),
  });
  const { phase, caption, heard, answer, error } = convo;

  useEffect(() => {
    if (open) {
      setShowSettings(false);
      convo.open();
    } else convo.close();
    // open/close only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    convo.close();
    onClose();
  };

  const live = answer ? (props.liveItem(answer.id) ?? answer) : null;
  const captionText =
    phase === 'listening'
      ? caption
      : phase === 'thinking'
        ? heard
        : phase === 'error'
          ? (error ?? '')
          : '';

  return (
    <Modal
      isOpen={open}
      onClose={close}
      label="Voice mode"
      backdropClassName="bg-black/55 backdrop-blur-sm"
      overlayClassName="flex items-end justify-center sm:items-center sm:p-4"
      className="agt-voice"
    >
      <div className="agt-voice-top">
        <p className="text-sm font-medium text-foreground">Voice</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="todo-btn todo-btn-ghost h-9 w-9 px-0"
            aria-label="Voice settings"
            title="Voice settings"
          >
            <Icon name="AdjustmentsHorizontalIcon" size={18} />
          </button>
          <button
            type="button"
            onClick={close}
            className="todo-btn todo-btn-ghost h-9 w-9 px-0"
            aria-label="Close voice mode"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="flex-1 py-4">
          <VoiceSettingsPanel settings={settings} onChange={onSettings} />
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="todo-btn todo-btn-quiet mt-5 h-10 w-full text-sm"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="agt-voice-stage">
          <button
            ref={orbRef}
            type="button"
            className="agt-orb"
            data-phase={phase}
            onClick={convo.tap}
            aria-label={
              phase === 'listening'
                ? 'Done talking'
                : phase === 'speaking'
                  ? 'Interrupt'
                  : phase === 'thinking'
                    ? 'Thinking'
                    : 'Talk'
            }
          >
            <Icon
              name={
                phase === 'listening'
                  ? 'MicrophoneIcon'
                  : phase === 'speaking'
                    ? 'SpeakerWaveIcon'
                    : phase === 'thinking'
                      ? 'SparklesIcon'
                      : 'MicrophoneIcon'
              }
              size={34}
            />
          </button>
          <div>
            <p className="agt-voice-state" role="status">
              {PHASE_TEXT[phase]}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{PHASE_HINT[phase]}</p>
          </div>
          <p
            className="agt-voice-caption"
            data-you={phase === 'listening' || phase === 'thinking' ? 'true' : undefined}
          >
            {captionText}
          </p>
          {live &&
            !live.failed &&
            (phase === 'speaking' || phase === 'paused' || phase === 'listening') && (
              <div className="w-full">
                {live.text && (
                  <div className="agt-voice-answer">
                    <AssistantMarkdown text={live.text} />
                  </div>
                )}
                {live.actions?.map((entry, i) => (
                  <ActionCard
                    key={i}
                    entry={entry}
                    onUndo={() => props.onUndo(live.id, i)}
                    onConfirm={(yes) => props.onConfirm(live.id, i, yes)}
                    onEditSchedule={(id) => {
                      close();
                      props.onEditSchedule(id);
                    }}
                  />
                ))}
              </div>
            )}
        </div>
      )}

      <div className="agt-voice-controls">
        <button
          type="button"
          className="agt-voice-btn"
          onClick={phase === 'listening' || phase === 'speaking' ? convo.pause : convo.tap}
          disabled={phase === 'thinking'}
          aria-label={phase === 'listening' || phase === 'speaking' ? 'Pause' : 'Talk'}
          title={phase === 'listening' || phase === 'speaking' ? 'Pause' : 'Talk'}
        >
          <Icon
            name={phase === 'listening' || phase === 'speaking' ? 'PauseIcon' : 'MicrophoneIcon'}
            size={22}
          />
        </button>
        <button
          type="button"
          className="agt-voice-btn"
          data-tone="end"
          onClick={close}
          aria-label="End voice mode"
          title="End"
        >
          <Icon name="XMarkIcon" size={22} />
        </button>
      </div>
    </Modal>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────────────────────────

const ENGINES: { id: VoiceEngine; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'device', label: 'This device' },
  { id: 'server', label: 'Natural' },
];

const RATES = [0.9, 1, 1.15, 1.3];

export function VoiceSettingsPanel({
  settings,
  onChange,
}: {
  settings: VoiceSettings;
  onChange: (v: VoiceSettings) => void;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const load = () => setVoices(deviceVoices());
    load();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', load);
      return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    }
  }, []);
  const set = (patch: Partial<VoiceSettings>) => onChange({ ...settings, ...patch });
  const lang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
  const listed = [...voices].sort(
    (a, b) =>
      Number(b.lang.startsWith(lang)) - Number(a.lang.startsWith(lang)) ||
      a.name.localeCompare(b.name)
  );
  const autoMeans = isDeepgramEnabled() ? 'the natural server voice' : 'this device’s voice';

  return (
    <div>
      <div className="agt-set-row">
        <p className="agt-set-label">Voice</p>
        <div className="todo-segmented w-full" role="group" aria-label="Voice">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              className="todo-segment flex-1"
              aria-pressed={settings.engine === e.id}
              onClick={() => set({ engine: e.id })}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {settings.engine === 'auto'
            ? `Auto uses ${autoMeans}.`
            : settings.engine === 'server'
              ? 'A natural voice from the server (Deepgram). Falls back to this device if it isn’t set up.'
              : 'Your device’s built-in voice: free and works offline.'}
        </p>
      </div>

      {settings.engine !== 'server' && listed.length > 0 && (
        <div className="agt-set-row">
          <label className="agt-set-label" htmlFor="agt-voice-pick">
            Device voice
          </label>
          <select
            id="agt-voice-pick"
            value={settings.voiceURI ?? ''}
            onChange={(e) => set({ voiceURI: e.target.value || null })}
            className="todo-input todo-input-quiet h-11 px-3 text-sm"
          >
            <option value="">Best match</option>
            {listed.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="agt-set-row">
        <p className="agt-set-label">Speed</p>
        <div className="todo-segmented w-full" role="group" aria-label="Speed">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              className="todo-segment flex-1"
              aria-pressed={settings.rate === r}
              onClick={() => set({ rate: r })}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>

      <div className="agt-set-row">
        <label className="sch-check">
          <input
            type="checkbox"
            checked={settings.autoSpeak}
            onChange={(e) => set({ autoSpeak: e.target.checked })}
          />
          <span>Read the answer aloud when I dictate a message</span>
        </label>
      </div>

      <button
        type="button"
        onClick={() =>
          void speaker.speak(
            'Hi! This is how I sound. Ask me what’s due today, or tell me what to schedule.',
            settings
          )
        }
        className="todo-btn todo-btn-ghost mt-3 h-9 px-3 text-sm"
      >
        <Icon name="SpeakerWaveIcon" size={15} />
        Test the voice
      </button>
    </div>
  );
}
