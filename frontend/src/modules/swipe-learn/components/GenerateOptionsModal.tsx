'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { GenerateFormat, FeedMode } from '../types';

interface GenerateOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: FeedMode;
  activeTopicLabel: string;
  onSelectFormat: (format: GenerateFormat) => void;
  isGenerating?: boolean;
}

interface FormatOption {
  id: GenerateFormat;
  label: string;
  emoji: string;
  description: string;
  badge?: string;
}

const GENERATE_OPTIONS: FormatOption[] = [
  {
    id: 'quick-concept',
    label: 'Quick Concept',
    emoji: '⚡',
    description: 'Crisp, bite-sized definition & core intuition in 2 sentences',
  },
  {
    id: 'code-example',
    label: 'Code Example',
    emoji: '💻',
    description: 'Clean executable snippet with practical explanation',
  },
  {
    id: 'interview-question',
    label: 'Interview Question',
    emoji: '🧠',
    description: 'Real-world FAANG scenario question with trade-off analysis',
  },
  {
    id: 'quiz',
    label: 'Interactive Quiz',
    emoji: '❓',
    description: 'Multiple-choice question with instant answer verification',
  },
  {
    id: 'advanced-concept',
    label: 'Advanced Concept',
    emoji: '🔥',
    description: 'Deep dive into internal architecture, gotchas, and edge cases',
    badge: 'Deep',
  },
  {
    id: 'recent-dev',
    label: 'Recent Development',
    emoji: '📰',
    description: 'Latest 2025/2026 industry release, update, or benchmark',
    badge: 'New',
  },
  {
    id: 'random',
    label: 'Surprise / Random',
    emoji: '🎯',
    description: 'Let AI choose the best format for this topic',
  },
];

export default function GenerateOptionsModal({
  isOpen,
  onClose,
  activeMode,
  activeTopicLabel,
  onSelectFormat,
  isGenerating = false,
}: GenerateOptionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-slideUp sm:animate-scaleUp flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-gradient-to-r from-primary/10 via-transparent to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                Generate with AI
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Targeting: <strong className="text-foreground">{activeTopicLabel}</strong>
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

        {/* Options List */}
        <div className="p-4 sm:p-5 space-y-2 max-h-[70vh] overflow-y-auto scrollbar-clean">
          {GENERATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={isGenerating}
              onClick={() => {
                onSelectFormat(opt.id);
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-2xl border border-border/70 bg-card hover:bg-muted/70 hover:border-primary/40 transition-all flex items-start gap-3 active:scale-[0.98] disabled:opacity-50 group"
            >
              <span className="text-2xl shrink-0 p-2 rounded-xl bg-muted/60 group-hover:scale-110 transition-transform">
                {opt.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    {opt.label}
                  </span>
                  {opt.badge && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-primary/15 text-primary">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {opt.description}
                </p>
              </div>
              <span className="text-muted-foreground text-xs self-center">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
