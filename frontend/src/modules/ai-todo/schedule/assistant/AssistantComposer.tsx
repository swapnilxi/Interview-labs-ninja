'use client';

import React, { useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import VoiceMicButton from '@/components/voice/VoiceMicButton';
import { useVoiceInput } from '@/components/voice/useVoiceInput';

/**
 * The message box, pinned to the bottom like a chat app. The mic dictates into the box (a message sent after dictating
 * counts as spoken, so the reply is read aloud when that's on). The round button on the right is voice mode while the
 * box is empty and Send once there is text.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, opts: { voice: boolean }) => void;
  onVoiceMode: () => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** Four bars: the voice-mode glyph. */
export function WaveIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 10v4M10 6v12M14 8v8M18 11v2" />
    </svg>
  );
}

export default function AssistantComposer({
  value,
  onChange,
  onSend,
  onVoiceMode,
  busy,
  inputRef,
}: Props) {
  const dictated = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const voice = useVoiceInput((text) => {
    dictated.current = true;
    const cur = valueRef.current;
    onChange(cur.trim() ? `${cur.trimEnd()} ${text}` : text);
  });

  // Grow with the text (up to the CSS max-height, then scroll).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    if (voice.state === 'recording') void voice.toggle();
    onSend(text, { voice: dictated.current });
    dictated.current = false;
  };

  const hasText = !!value.trim();

  return (
    <div className="agt-dock">
      <form onSubmit={submit} className="agt-composer">
        <label htmlFor="agt-input" className="sr-only">
          Message the Assistant
        </label>
        <textarea
          id="agt-input"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!e.target.value.trim()) dictated.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={voice.state === 'recording' ? 'Listening…' : 'Ask, or schedule something…'}
          className="agt-input"
          enterKeyHint="send"
          // It has its own mic (and voice mode): no second one from GlobalVoiceInput.
          data-no-mic=""
        />
        <div className="agt-composer-row">
          <VoiceMicButton state={voice.state} onClick={() => void voice.toggle()} />
          <p className="agt-hint" aria-live="polite">
            {voice.error ? (
              <span className="text-destructive">{voice.error}</span>
            ) : busy ? (
              'Working on it…'
            ) : (
              ''
            )}
          </p>
          {hasText ? (
            <button
              type="submit"
              disabled={busy}
              className="agt-round agt-round-primary"
              aria-label="Send"
              title="Send (Enter)"
            >
              <Icon name="ArrowUpIcon" size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onVoiceMode}
              className="agt-round agt-round-primary"
              aria-label="Talk to the Assistant (voice mode)"
              title="Voice mode"
            >
              <WaveIcon />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
