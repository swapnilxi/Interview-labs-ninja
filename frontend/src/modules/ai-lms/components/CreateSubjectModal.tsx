'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import ColorPickerInput from './ColorPickerInput';
import { lmsService } from '../services/lmsService';
import { extractMultipleFiles, mergeSourceNames } from '../utils/contextFiles';
import type { LmsClass, LmsSubject } from '../types';

interface CreateSubjectModalProps {
  isOpen: boolean;
  targetClass: LmsClass | null;
  onClose: () => void;
  onCreated: (createdSubject: LmsSubject) => void;
}

export default function CreateSubjectModal({
  isOpen,
  targetClass,
  onClose,
  onCreated,
}: CreateSubjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [accentColor, setAccentColor] = useState('#38bdf8');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !targetClass) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const { combinedText, fileNames, errors } = await extractMultipleFiles(files);
      if (combinedText) {
        setAiContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${combinedText}` : combinedText));
      }
      if (fileNames.length) {
        setSourceName((prev) => mergeSourceNames(prev, fileNames));
      }
      const errorEntries = Object.entries(errors);
      if (errorEntries.length) {
        setError(errorEntries.map(([n, msg]) => `${n}: ${msg}`).join(' '));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const created = await lmsService.createSubject(targetClass.id, {
        name: name.trim(),
        description: description.trim(),
        ai_context: aiContext.trim(),
        context_source_name: sourceName,
        accent_color: accentColor,
      });
      setName('');
      setDescription('');
      setAiContext('');
      setSourceName('');
      setAccentColor('#38bdf8');
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create subject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-[24px] transition-smooth max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Icon name="FolderIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Add Subject to {targetClass.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                A module or topic cluster inside this class
              </p>
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
              placeholder="e.g. Consistent Hashing & Sharding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Description{' '}
              <span className="text-muted-foreground font-normal lowercase">
                (for human-readable overview)
              </span>
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
                <span>
                  Context{' '}
                  <span className="text-emerald-500 font-normal lowercase">
                    (for AI generation)
                  </span>
                </span>
              </label>
              <span className="text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Subject AI Directives
              </span>
            </div>
            <textarea
              rows={3}
              placeholder="e.g. Include code implementations in Python/Go, highlight edge cases, memory layout diagrams, and interview drill questions..."
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.docx"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="create-subject-file-input"
              />
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted disabled:opacity-50 transition-colors shadow-sm"
              >
                {isUploading ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Reading Files...</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowUpTrayIcon" size={13} className="text-emerald-500" />
                    <span>Upload Documents</span>
                  </>
                )}
              </button>
              {sourceName && (
                <span className="text-[11px] text-muted-foreground truncate">
                  Extracted from <span className="font-semibold text-foreground">{sourceName}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Type directives directly, attach one or more documents (PDF / MD / TXT / DOCX), or
              both -- everything combines into one context, passed along with class context to the
              AI when generating lessons inside this subject.
            </p>
          </div>

          <ColorPickerInput
            value={accentColor}
            onChange={setAccentColor}
            label="Subject Accent Color"
            description="Card border tint, icons, and highlights for this subject"
          />

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
              {loading ? 'Creating...' : 'Create Subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
