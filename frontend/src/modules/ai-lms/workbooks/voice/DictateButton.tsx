'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import VoiceMicButton from '@/components/voice/VoiceMicButton';
import { useVoiceInput, type VoiceLang } from '@/components/voice/useVoiceInput';

const LANG_KEY = 'labninja.workbook.dictation-lang';

function storedLang(): VoiceLang {
  try {
    return window.localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Dictate into a text answer, in English or Hindi. What was heard goes into a review box first; only "Add to my
 * answer" puts it in the answer (the learner can correct it before that). The microphone is asked for only when the
 * mic is pressed, and nothing is recorded or kept: the audio goes to the transcription and is dropped.
 */
export default function DictateButton({ onAccept }: { onAccept: (text: string) => void }) {
  const [lang, setLang] = useState<VoiceLang>('en');
  const [heard, setHeard] = useState('');
  useEffect(() => setLang(storedLang()), []);
  const voice = useVoiceInput((text) => setHeard((prev) => (prev ? `${prev} ${text}` : text)), {
    lang,
  });

  const pickLang = (next: VoiceLang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* not remembered in private mode */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <VoiceMicButton state={voice.state} onClick={voice.toggle} size="sm" className="wb-mic" />
        <div className="wb-seg wb-seg-sm" role="group" aria-label="Dictation language">
          <button
            type="button"
            aria-pressed={lang === 'en'}
            onClick={() => pickLang('en')}
            disabled={voice.state !== 'idle'}
          >
            English
          </button>
          <button
            type="button"
            aria-pressed={lang === 'hi'}
            onClick={() => pickLang('hi')}
            disabled={voice.state !== 'idle'}
            lang="hi"
          >
            हिन्दी
          </button>
        </div>
        <span className="wb-hint" aria-live="polite">
          {voice.state === 'recording'
            ? 'Listening… press the mic again to stop.'
            : voice.state === 'transcribing'
              ? 'Turning your voice into text…'
              : 'Speak your answer'}
        </span>
      </div>
      {voice.error && (
        <p className="wb-hint text-destructive" role="alert">
          {voice.error}
        </p>
      )}
      {heard && (
        <div className="wb-review" role="group" aria-label="Review what you said">
          <label className="block">
            <span className="wb-label">What you said (check it before adding)</span>
            <textarea
              className="wb-field"
              rows={3}
              value={heard}
              lang={lang === 'hi' ? 'hi' : 'en'}
              onChange={(e) => setHeard(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="wb-btn wb-btn-sm wb-btn-primary"
              disabled={!heard.trim()}
              onClick={() => {
                onAccept(heard.trim());
                setHeard('');
              }}
            >
              <Icon name="CheckIcon" size={14} />
              Add to my answer
            </button>
            <button type="button" className="wb-btn wb-btn-sm" onClick={() => setHeard('')}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
