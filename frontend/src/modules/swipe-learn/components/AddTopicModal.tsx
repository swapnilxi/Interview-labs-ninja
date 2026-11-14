'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { TopicMeta } from '../types';
import { SUGGESTED_CUSTOM_TOPICS } from '../data/defaultCards';

interface AddTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `generateStarter`: also write a first batch of cards for it. */
  onAddTopic: (topic: TopicMeta, generateStarter: boolean) => void;
  existingTopicIds: string[];
  customTopics: TopicMeta[];
  onRemoveCustomTopic: (topicId: string) => void;
  /** A Gemini key is available (otherwise the starter-cards option is hidden). */
  canGenerate: boolean;
}

// Topic icons are the user's pick, stored with the topic and shown on its pill.
const EMOJI_OPTIONS = [
  '💡',
  '⚡',
  '💻',
  '🏗️',
  '📊',
  '📈',
  '⚛️',
  '☁️',
  '☸️',
  '📐',
  '🧠',
  '🛡️',
  '🎯',
  '🧪',
  '🎨',
  '🌍',
]; // emoji-ok

const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function AddTopicModal({
  isOpen,
  onClose,
  onAddTopic,
  existingTopicIds,
  customTopics,
  onRemoveCustomTopic,
  canGenerate,
}: AddTopicModalProps) {
  const [topicName, setTopicName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('💡'); // emoji-ok
  const [errorMsg, setErrorMsg] = useState('');
  const [generateStarter, setGenerateStarter] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setTopicName('');
    setErrorMsg('');
  }, [isOpen]);

  const handleCreate = (name: string, emoji: string = selectedEmoji, color: string = '#6366f1') => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Enter a topic name.');
      return;
    }
    const slug = slugify(trimmed);
    if (!slug || slug === 'mixed') {
      setErrorMsg('Use letters or numbers in the name.');
      return;
    }
    if (existingTopicIds.includes(slug)) {
      setErrorMsg(`"${trimmed}" is already a topic.`);
      return;
    }
    onAddTopic(
      {
        id: slug,
        label: trimmed,
        emoji,
        color,
        bgActive: 'bg-indigo-600',
        textActive: 'text-white',
        isCustom: true,
      },
      canGenerate && generateStarter
    );
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="swipe-add-topic-title"
      backdropClassName="bg-black/50 backdrop-blur-[2px]"
      overlayClassName="flex items-end justify-center sm:items-center sm:p-4"
      className="notif-sheet flex w-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:max-w-[30rem]"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate(topicName);
        }}
      >
        <span className="swipe-sheet-handle" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div>
            <h2
              id="swipe-add-topic-title"
              className="font-heading text-lg font-bold text-foreground"
            >
              Add a topic
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Anything you want short daily cards on
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="swipe-icon-btn -mr-2 -mt-1"
            aria-label="Close"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-clean">
          <div>
            <label htmlFor="swipe-topic-name" className="swipe-field-label">
              Topic name
            </label>
            <div className="flex items-center gap-2">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-xl"
                aria-hidden="true"
              >
                {selectedEmoji}
              </span>
              <input
                id="swipe-topic-name"
                type="text"
                value={topicName}
                onChange={(e) => {
                  setTopicName(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="e.g. Rust, Statistics, AWS…"
                className="swipe-input"
                maxLength={40}
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
            {errorMsg && (
              <p
                className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                role="alert"
              >
                {errorMsg}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="swipe-field-label">Icon</legend>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setSelectedEmoji(em)}
                  aria-pressed={selectedEmoji === em}
                  aria-label={`Icon ${em}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition-colors ${
                    selectedEmoji === em
                      ? 'swipe-empty-icon ring-2 ring-primary'
                      : 'mix-bg-muted/60 hover:bg-muted'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="swipe-field-label">Suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_CUSTOM_TOPICS.map((sug) => {
                const exists = existingTopicIds.includes(slugify(sug.name));
                return (
                  <button
                    key={sug.name}
                    type="button"
                    disabled={exists}
                    onClick={() => handleCreate(sug.name, sug.emoji, sug.color)}
                    className="swipe-suggest"
                  >
                    <span aria-hidden="true">{sug.emoji}</span>
                    {sug.name}
                    {!exists && (
                      <Icon name="PlusIcon" size={14} className="text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {customTopics.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="swipe-field-label">Your topics ({customTopics.length})</p>
              <ul className="space-y-1">
                {customTopics.map((ct) => (
                  <li key={ct.id} className="flex items-center gap-2 rounded-xl py-1 pl-2 pr-1">
                    <span aria-hidden="true">{ct.emoji}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                      {ct.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveCustomTopic(ct.id)}
                      className="swipe-icon-btn"
                      aria-label={`Remove ${ct.label}`}
                      title={`Remove ${ct.label}`}
                    >
                      <Icon name="TrashIcon" size={17} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-border px-5 pb-4 pt-3">
          {canGenerate && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={generateStarter}
                onChange={(e) => setGenerateStarter(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Generate 5 starter cards for it
            </label>
          )}
          <button type="submit" disabled={!topicName.trim()} className="swipe-primary-btn w-full">
            <Icon name="PlusIcon" size={18} />
            Add topic
          </button>
        </div>
      </form>
    </Modal>
  );
}
