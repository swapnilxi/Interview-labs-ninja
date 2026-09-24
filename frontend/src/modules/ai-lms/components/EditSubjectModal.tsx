'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsSubject } from '../types';

interface EditSubjectModalProps {
  isOpen: boolean;
  subject: LmsSubject | null;
  onClose: () => void;
  onUpdated: (updatedSubject: LmsSubject) => void;
}

export default function EditSubjectModal({
  isOpen,
  subject,
  onClose,
  onUpdated,
}: EditSubjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subject) {
      setName(subject.name || '');
      setDescription(subject.description || '');
      setAiContext(subject.ai_context || '');
      setError(null);
    }
  }, [subject]);

  if (!isOpen || !subject) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await lmsService.updateSubject(subject.id, {
        name: name.trim(),
        description: description.trim(),
        ai_context: aiContext.trim(),
      });
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update subject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 transition-smooth max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Icon name="PencilSquareIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Edit Subject</h3>
              <p className="text-xs text-muted-foreground">Update subject overview and AI prompt instructions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Subject Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Description <span className="text-muted-foreground font-normal lowercase">(for human-readable overview)</span>
            </label>
            <textarea
              rows={2}
              placeholder="What will learners study in this subject..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Public summary displayed on subject cards and module headers.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="SparklesIcon" size={13} className="text-emerald-500" />
                <span>Context <span className="text-emerald-500 font-normal lowercase">(for AI generation)</span></span>
              </label>
              <span className="text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Subject AI Directives
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="e.g. Include code implementations in Python/Go, highlight edge cases, memory layout diagrams, and interview drill questions..."
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none placeholder:text-muted-foreground/60"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Passed along with class context to the AI when generating lessons inside this subject module.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
