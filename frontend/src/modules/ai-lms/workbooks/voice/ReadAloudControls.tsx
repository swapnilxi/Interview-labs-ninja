'use client';

import Icon from '@/components/ui/AppIcon';
import { READ_RATES, type ReadRate, type useReadAloud } from './useReadAloud';

type Reader = ReturnType<typeof useReadAloud>;

/**
 * Listen / Pause / Resume / Stop and the speed, for one reader. `paragraphs` is what Listen reads; the caller highlights
 * `reader.current`.
 */
export default function ReadAloudControls({
  reader,
  paragraphs,
  label = 'Listen',
}: {
  reader: Reader;
  paragraphs: string[];
  label?: string;
}) {
  const { state } = reader;
  return (
    <div className="wb-listen" role="group" aria-label="Read aloud">
      {state === 'idle' && (
        <button type="button" className="wb-btn wb-btn-sm" onClick={() => reader.play(paragraphs)}>
          <Icon name="SpeakerWaveIcon" size={14} />
          {label}
        </button>
      )}
      {state === 'playing' && (
        <button type="button" className="wb-btn wb-btn-sm wb-btn-done" onClick={reader.pause}>
          <Icon name="PauseIcon" size={14} />
          Pause
        </button>
      )}
      {state === 'paused' && (
        <button type="button" className="wb-btn wb-btn-sm wb-btn-done" onClick={reader.resume}>
          <Icon name="PlayIcon" size={14} />
          Resume
        </button>
      )}
      {state !== 'idle' && (
        <>
          <button
            type="button"
            className="wb-btn wb-btn-sm"
            onClick={reader.stop}
            aria-label="Stop reading"
          >
            <Icon name="StopIcon" size={14} />
          </button>
          <label className="wb-rate">
            <span className="sr-only">Reading speed</span>
            <select
              value={reader.rate}
              onChange={(e) => reader.setRate(Number(e.target.value) as ReadRate)}
            >
              {READ_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {reader.error && (
        <span className="wb-hint text-destructive" role="alert">
          {reader.error}
        </span>
      )}
    </div>
  );
}
