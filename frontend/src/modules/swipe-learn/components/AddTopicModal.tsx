'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { TopicMeta } from '../types';
import { SUGGESTED_CUSTOM_TOPICS } from '../data/defaultCards';

interface AddTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTopic: (topic: TopicMeta) => void;
  existingTopicIds: string[];
  customTopics: TopicMeta[];
  onRemoveCustomTopic: (topicId: string) => void;
}

export default function AddTopicModal({
  isOpen,
  onClose,
  onAddTopic,
  existingTopicIds,
  customTopics,
  onRemoveCustomTopic,
}: AddTopicModalProps) {
  const [topicName, setTopicName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('💡');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleCreate = (name: string, emoji: string = '💡', color: string = '#6366f1') => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a topic name.');
      return;
    }

    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (existingTopicIds.includes(slug)) {
      setErrorMsg(`Topic "${trimmed}" already exists.`);
      return;
    }

    const newTopic: TopicMeta = {
      id: slug,
      label: trimmed,
      emoji: emoji,
      color: color,
      bgActive: 'bg-indigo-600',
      textActive: 'text-white',
      isCustom: true,
    };

    onAddTopic(newTopic);
    setTopicName('');
    setErrorMsg('');
    onClose();
  };

  const EMOJI_OPTIONS = ['💡', '⚡', '💻', '🏗️', '📊', '📈', '⚛️', '☁️', '☸️', '📐', '🧠', '🛡️', '🎯'];

  return (
    <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-[500px] rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-slideUp sm:animate-scaleUp max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70">
          <div className="flex items-center gap-2">
            <span className="text-xl">＋</span>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                Add Learning Topic
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Create a custom topic pill and generate AI cards for it
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-toggle"
            aria-label="Close"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Custom Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Topic Name</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2.5 py-2 rounded-2xl bg-input border border-border text-lg">
                <span>{selectedEmoji}</span>
              </div>
              <input
                type="text"
                value={topicName}
                onChange={(e) => {
                  setTopicName(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="e.g. System Design, React, AWS..."
                className="flex-1 px-3.5 py-2.5 rounded-2xl bg-input border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                maxLength={40}
              />
            </div>
            {errorMsg && (
              <p className="text-xs text-rose-500 font-medium">{errorMsg}</p>
            )}
          </div>

          {/* Quick Emoji Picker */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground">Select Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setSelectedEmoji(em)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-transform ${
                    selectedEmoji === em ? 'bg-primary/20 scale-110 border border-primary' : 'bg-muted/60 hover:bg-muted'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Suggested Topics Pills */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Suggested Topics
            </label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CUSTOM_TOPICS.map((sug) => {
                const isExisting = existingTopicIds.includes(
                  sug.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                );
                return (
                  <button
                    key={sug.name}
                    type="button"
                    disabled={isExisting}
                    onClick={() => handleCreate(sug.name, sug.emoji, sug.color)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isExisting
                        ? 'opacity-40 border-border/40 text-muted-foreground line-through'
                        : 'bg-card border-border/80 text-foreground hover:border-primary/50 hover:bg-primary/5 active:scale-95 shadow-sm'
                    }`}
                  >
                    <span>{sug.emoji}</span>
                    <span>{sug.name}</span>
                    {!isExisting && <span className="text-primary font-bold ml-0.5">+</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Your Custom Topics (with remove option) */}
          {customTopics.length > 0 && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Your Custom Topics ({customTopics.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {customTopics.map((ct) => (
                  <div
                    key={ct.id}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
                  >
                    <span>{ct.emoji}</span>
                    <span>{ct.label}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveCustomTopic(ct.id)}
                      className="text-muted-foreground hover:text-rose-500 font-bold ml-1 p-0.5"
                      title={`Remove ${ct.label}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleCreate(topicName, selectedEmoji)}
            disabled={!topicName.trim()}
            className="px-5 py-2 rounded-2xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            Add Topic Pill
          </button>
        </div>
      </div>
    </div>
  );
}
