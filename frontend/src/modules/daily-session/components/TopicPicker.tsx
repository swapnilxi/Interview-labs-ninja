'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { TOPIC_OPTIONS, cleanTopic, isPresetTopic, readCustomTopics, writeCustomTopics } from '../topics';

interface Props {
  /** Selected topics: preset labels and/or custom topics. Empty means the standard mix. */
  value: string[];
  onChange: (next: string[]) => void;
}

/** Multi-select topic chips plus a box for adding a custom topic. */
export default function TopicPicker({ value, onChange }: Props) {
  const [customs, setCustoms] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setCustoms(readCustomTopics());
  }, []);

  // A custom topic that arrives through the selection (e.g. saved in My Space) is shown as a chip too.
  const extra = value.filter((t) => !isPresetTopic(t) && !customs.some((c) => c.toLowerCase() === t.toLowerCase()));
  const customChips = [...customs, ...extra];

  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) => onChange(has(t) ? value.filter((v) => v.toLowerCase() !== t.toLowerCase()) : [...value, t]);

  const addCustom = () => {
    const t = cleanTopic(draft);
    if (!t) return;
    setDraft('');
    if (isPresetTopic(t)) {
      if (!has(t)) onChange([...value, TOPIC_OPTIONS.find((o) => o.toLowerCase() === t.toLowerCase()) as string]);
      return;
    }
    if (!customChips.some((c) => c.toLowerCase() === t.toLowerCase())) {
      const next = [...customs, t];
      setCustoms(next);
      writeCustomTopics(next);
    }
    if (!has(t)) onChange([...value, t]);
  };

  const removeCustom = (t: string) => {
    const next = customs.filter((c) => c.toLowerCase() !== t.toLowerCase());
    setCustoms(next);
    writeCustomTopics(next);
    if (has(t)) onChange(value.filter((v) => v.toLowerCase() !== t.toLowerCase()));
  };

  const chip = (t: string, custom: boolean) => {
    const on = has(t);
    return (
      <span key={t} className="inline-flex items-center">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => toggle(t)}
          className={`ds-chip ds-chip-btn ${on ? 'ds-tone-indigo ds-chip-on' : ''} ${custom ? 'ds-chip-custom' : ''}`}
        >
          {on && <Icon name="CheckIcon" size={12} />}
          {t}
        </button>
        {custom && (
          <button type="button" aria-label={`Remove topic ${t}`} onClick={() => removeCustom(t)} className="ds-chip-x">
            <Icon name="XMarkIcon" size={12} />
          </button>
        )}
      </span>
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p id="ds-topics" className="text-sm font-semibold ds-ink">
          Topics <span className="font-normal ds-faint">(optional)</span>
        </p>
        {value.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="text-xs font-semibold ds-faint underline">
            Clear, use the standard mix
          </button>
        ) : (
          <span className="text-xs ds-faint">None picked: a balanced mix</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="ds-topics">
        {TOPIC_OPTIONS.map((t) => chip(t, false))}
        {customChips.map((t) => chip(t, true))}
      </div>
      <div className="mt-2.5 flex gap-2">
        <input
          type="text"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add your own topic, e.g. Kafka or Transformers"
          aria-label="Add a custom topic"
          className="ds-field"
        />
        <button type="button" onClick={addCustom} disabled={!cleanTopic(draft)} className="ds-btn ds-btn-secondary ds-btn-sm">
          <Icon name="PlusIcon" size={15} />
          Add
        </button>
      </div>
    </div>
  );
}
