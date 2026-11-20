'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AiError from '@/modules/labs/common/AiError';
import { workbookService } from '../workbookService';
import ReadAloudControls from './ReadAloudControls';
import { useReadAloud } from './useReadAloud';

/**
 * "Explain this to me" under a reading: the AI explains this block again in simpler words, with an everyday example,
 * and it can be read aloud. The learner may ask something specific about it. Nothing is saved.
 */
export default function ExplainPanel({
  workbookId,
  blockId,
}: {
  workbookId: string;
  blockId: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reader = useReadAloud();
  const paragraphs = (answer || '').split(/\n{2,}/).filter((p) => p.trim());

  const ask = async () => {
    setBusy(true);
    setError(null);
    reader.stop();
    try {
      const res = await workbookService.explain(workbookId, blockId, question.trim());
      setAnswer(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The explanation could not be written.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="wb-btn wb-btn-sm" onClick={() => setOpen(true)}>
        <Icon name="ChatBubbleLeftRightIcon" size={14} />
        Explain this to me
      </button>
    );
  }

  return (
    <div className="wb-explain space-y-3">
      <label className="block">
        <span className="wb-label">What should the explanation focus on? (optional)</span>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="wb-field min-w-0 flex-1 basis-[14rem]"
            maxLength={500}
            value={question}
            placeholder="For example: what does this mean for a student?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) ask();
            }}
          />
          <button
            type="button"
            className="wb-btn wb-btn-sm wb-btn-primary"
            onClick={ask}
            disabled={busy}
          >
            {busy ? (
              <span className="wb-spinner" aria-hidden="true" />
            ) : (
              <Icon name="SparklesIcon" size={14} />
            )}
            {answer ? 'Explain again' : 'Explain'}
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-sm"
            onClick={() => {
              reader.stop();
              setOpen(false);
            }}
          >
            Close
          </button>
        </div>
      </label>
      {error && <AiError message={error} className="text-sm" />}
      {answer && (
        <div className="space-y-2" aria-live="polite">
          <div className="wb-prose">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className={`whitespace-pre-line ${reader.current === i ? 'wb-reading-now' : ''}`}
              >
                {p}
              </p>
            ))}
          </div>
          <ReadAloudControls
            reader={reader}
            paragraphs={paragraphs}
            label="Listen to the explanation"
          />
        </div>
      )}
    </div>
  );
}
