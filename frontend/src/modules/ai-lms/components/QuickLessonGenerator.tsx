'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsLesson } from '../types';

interface QuickLessonGeneratorProps {
  classId: string;
  classSlug: string;
  classNameText: string;
  subjectId?: string;
  subjectSlug?: string;
  subjectNameText?: string;
  onLessonGenerated: (lesson: LmsLesson) => void;
  placeholder?: string;
}

const GENERATION_STEPS = [
  'Analyzing context & learning material...',
  'Architecting technical curriculum outline...',
  'Authoring code examples & visual diagrams...',
  'Building interactive knowledge check quizzes...',
  'Compiling lesson & adding to your curriculum...',
];

export default function QuickLessonGenerator({
  classId,
  classSlug,
  classNameText,
  subjectId,
  subjectSlug,
  subjectNameText,
  onLessonGenerated,
  placeholder,
}: QuickLessonGeneratorProps) {
  const [content, setContent] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    text: string;
    wordCount: number;
    preview: string;
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [latestGeneratedLesson, setLatestGeneratedLesson] = useState<LmsLesson | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cycle through step animations during generation
  useEffect(() => {
    if (!isGenerating) {
      setCurrentStepIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => (prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev));
    }, 2800);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const res = await lmsService.uploadSourceFile(file);
      setUploadedFile({
        name: res.filename,
        text: res.text,
        wordCount: res.word_count,
        preview: res.preview,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to extract text from file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isGenerating) return;

    const trimmedText = content.trim();
    const hasFile = Boolean(uploadedFile?.text);

    if (!trimmedText && !hasFile) {
      setError('Please type a topic, paste study text, or upload a document.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setLatestGeneratedLesson(null);

    try {
      // Determine input type & combined content
      let inputType: 'topic' | 'text' | 'file' = 'topic';
      let finalContent = trimmedText;

      if (hasFile) {
        inputType = 'file';
        finalContent = uploadedFile!.text + (trimmedText ? `\n\nAdditional Focus Instructions:\n${trimmedText}` : '');
      } else if (trimmedText.length > 120 || trimmedText.includes('\n')) {
        inputType = 'text';
      }

      const newLesson = await lmsService.generateLesson({
        class_id: classId,
        subject_id: subjectId,
        input_type: inputType,
        content: finalContent,
      });

      setLatestGeneratedLesson(newLesson);
      setContent('');
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      onLessonGenerated(newLesson);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate lesson. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const defaultPlaceholder =
    placeholder ||
    (subjectNameText
      ? `Type a topic or paste notes to generate a lesson in ${subjectNameText}... (e.g. 'Anthropic Claude Code CLI Architecture', 'Raft Consensus Algorithm', or paste notes)`
      : `Type a topic or paste notes to generate a lesson in ${classNameText}... (e.g. 'Microservices Ingress Controllers', or paste notes)`);

  return (
    <div className="relative rounded-2xl border border-primary/35 bg-gradient-to-b from-card via-card to-card/95 shadow-md shadow-primary/5 p-4 sm:p-5 transition-all">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
        className="hidden"
        id="quick-lesson-file-input"
      />

      {/* Header bar */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Icon name="SparklesIcon" size={15} />
          </div>
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-foreground">
            Generate Lesson with AI
          </span>
        </div>

        <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
          One text box for topic or pasted notes • Attach document anytime
        </span>
      </div>

      {/* Uploaded File Chip (if attached) */}
      {uploadedFile && (
        <div className="mb-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-xs animate-fadeIn">
          <div className="flex items-center gap-2 truncate">
            <Icon name="DocumentTextIcon" size={15} className="text-primary flex-shrink-0" />
            <span className="font-semibold text-foreground truncate">{uploadedFile.name}</span>
            <span className="text-muted-foreground text-[11px]">({uploadedFile.wordCount} words attached)</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setUploadedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            title="Remove attachment"
            className="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-2"
          >
            <Icon name="XMarkIcon" size={13} />
          </button>
        </div>
      )}

      {/* The Single Text Box */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          placeholder={defaultPlaceholder}
          className="w-full rounded-xl border border-input bg-background/90 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-y min-h-[72px]"
        />
      </div>

      {/* Action Row: One Upload Button + One Generate Button */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* One Upload Button */}
          <button
            type="button"
            disabled={isGenerating || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted hover:border-primary/40 disabled:opacity-50 transition-all shadow-sm"
          >
            {isUploading ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Reading File...</span>
              </>
            ) : (
              <>
                <Icon name="ArrowUpTrayIcon" size={13} className="text-primary" />
                <span>{uploadedFile ? 'Change File' : 'Upload Document'}</span>
              </>
            )}
          </button>

          <span className="hidden md:inline-block text-[11px] text-muted-foreground/60 font-mono">
            Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">⌘</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">Enter</kbd>
          </span>
        </div>

        {/* Generate Button */}
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={isGenerating || (!content.trim() && !uploadedFile)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-102 flex-shrink-0"
        >
          {isGenerating ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Generating Lesson...</span>
            </>
          ) : (
            <>
              <Icon name="SparklesIcon" size={14} />
              <span>Generate Lesson</span>
            </>
          )}
        </button>
      </div>

      {/* Real-time Generation Progress Bar */}
      {isGenerating && (
        <div className="mt-3.5 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3 animate-fadeIn">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">
              Step {currentStepIdx + 1} of {GENERATION_STEPS.length}: {GENERATION_STEPS[currentStepIdx]}
            </div>
          </div>
          <div className="w-20 sm:w-28 bg-muted/60 h-1.5 rounded-full overflow-hidden flex-shrink-0">
            <div
              className="bg-primary h-full transition-all duration-500 rounded-full"
              style={{ width: `${((currentStepIdx + 1) / GENERATION_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="ExclamationTriangleIcon" size={14} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {latestGeneratedLesson && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500 flex-shrink-0">
              <Icon name="CheckCircleIcon" size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
                Lesson Generated & Added to Sequence!
              </div>
              <div className="text-xs text-foreground font-semibold truncate">
                {latestGeneratedLesson.title}
              </div>
            </div>
          </div>

          <Link
            href={
              subjectSlug
                ? `/ai-lms/classes/${classSlug}/${subjectSlug}/${latestGeneratedLesson.slug}`
                : `/ai-lms/classes/${classSlug}/lesson/${latestGeneratedLesson.slug}`
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-medium text-xs hover:bg-emerald-600 transition-colors shadow-sm flex-shrink-0 self-end sm:self-auto"
          >
            <span>Open Lesson</span>
            <Icon name="ArrowRightIcon" size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
