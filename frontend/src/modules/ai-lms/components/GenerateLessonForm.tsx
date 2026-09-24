'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsSubject } from '../types';
import CreateClassModal from './CreateClassModal';
import CreateSubjectModal from './CreateSubjectModal';
import EditClassModal from './EditClassModal';
import EditSubjectModal from './EditSubjectModal';

interface GenerateLessonFormProps {
  initialClassSlug?: string;
  initialSubjectSlug?: string;
  onSuccess?: (createdLesson: any) => void;
}

type InputMode = 'topic' | 'text' | 'file';

const GENERATION_STEPS = [
  'Analyzing learning material & extracting concepts...',
  'Architecting curriculum & technical mental models...',
  'Authoring code examples & ByteByteGo-style visual diagrams...',
  'Building interactive knowledge check & self-assessment quizzes...',
  'Finalizing standalone HTML & persisting to your LMS...',
];

export default function GenerateLessonForm({
  initialClassSlug,
  initialSubjectSlug,
  onSuccess,
}: GenerateLessonFormProps) {
  const router = useRouter();

  const [classes, setClasses] = useState<LmsClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [subjects, setSubjects] = useState<LmsSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  const [contentInput, setContentInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    text: string;
    wordCount: number;
    preview: string;
  } | null>(null);

  const [customTitle, setCustomTitle] = useState('');

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isEditClassOpen, setIsEditClassOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isEditSubjectOpen, setIsEditSubjectOpen] = useState(false);

  // Loading & Step state
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load classes on mount
  useEffect(() => {
    async function loadClasses() {
      try {
        const clsList = await lmsService.getClasses();
        setClasses(clsList);

        if (initialClassSlug) {
          const match = clsList.find(
            (c) => c.slug === initialClassSlug || c.id === initialClassSlug
          );
          if (match) setSelectedClassId(match.id);
        } else if (clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
        }
      } catch (err) {
        console.error('Failed to load classes', err);
      }
    }
    loadClasses();
  }, [initialClassSlug]);

  // Load subjects when selected class changes
  useEffect(() => {
    if (!selectedClassId) {
      setSubjects([]);
      setSelectedSubjectId('');
      return;
    }

    async function loadSubjects() {
      try {
        const subjList = await lmsService.getSubjects(selectedClassId);
        setSubjects(subjList);

        if (initialSubjectSlug) {
          const match = subjList.find(
            (s) => s.slug === initialSubjectSlug || s.id === initialSubjectSlug
          );
          if (match) setSelectedSubjectId(match.id);
          else if (subjList.length > 0) setSelectedSubjectId(subjList[0].id);
          else setSelectedSubjectId('');
        } else if (subjList.length > 0) {
          setSelectedSubjectId(subjList[0].id);
        } else {
          setSelectedSubjectId('');
        }
      } catch (err) {
        console.error('Failed to load subjects', err);
      }
    }
    loadSubjects();
  }, [selectedClassId, initialSubjectSlug]);

  // Handle generation progress animation
  useEffect(() => {
    if (!isGenerating) {
      setCurrentStepIdx(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => {
        if (prev < GENERATION_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [isGenerating]);

  // Selected helpers
  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) || null;
  const isOtherClass = selectedClass?.slug === 'other';

  const handleClassUpdated = (updated: LmsClass) => {
    setClasses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleSubjectUpdated = (updated: LmsSubject) => {
    setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setError(null);
    try {
      const res = await lmsService.uploadSourceFile(file);
      setUploadedFile({
        name: res.filename,
        text: res.text,
        wordCount: res.word_count,
        preview: res.preview,
      });
      if (!customTitle) {
        setCustomTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to extract text from file.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Submit Generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      setError('Please select a Class.');
      return;
    }

    let content = contentInput.trim();
    let inputType: 'topic' | 'text' | 'file' = 'topic';

    if (uploadedFile?.text) {
      inputType = 'file';
      content = uploadedFile.text + (content ? `\n\nAdditional Guidance / Focus:\n${content}` : '');
    } else if (content.length > 120 || content.includes('\n')) {
      inputType = 'text';
    }

    if (!content) {
      setError('Please provide a topic, paste study notes, or upload a document.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const lesson = await lmsService.generateLesson({
        class_id: selectedClassId,
        subject_id: selectedSubjectId || undefined,
        input_type: inputType,
        content,
        title: customTitle.trim() || undefined,
      });

      if (onSuccess) {
        onSuccess(lesson);
      } else {
        // Redirect to lesson viewer
        const classSlug = lesson.class_slug || selectedClass?.slug || 'class';
        const subjSlug = lesson.subject_slug;
        const lessonSlug = lesson.slug;

        if (subjSlug) {
          router.push(`/ai-lms/classes/${classSlug}/${subjSlug}/${lessonSlug}`);
        } else {
          router.push(`/ai-lms/classes/${classSlug}/lesson/${lessonSlug}`);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate lesson. Please check your AI API key in Config.');
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="w-full max-w-3xl mx-auto rounded-2xl border border-border bg-card p-6 md:p-8 shadow-xl relative overflow-hidden">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-3">
            <Icon name="SparklesIcon" size={14} />
            <span>AI Lesson Engine</span>
          </div>
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
            Generate an Interactive Lesson
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Turn topics, technical notes, or uploaded documents into structured, interactive standalone lessons complete with diagrams and quizzes.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm flex items-start gap-3">
            <Icon name="ExclamationTriangleIcon" size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Class & Subject Selector Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Class Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Target Class *
                </label>
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(true)}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <Icon name="PlusIcon" size={12} />
                  <span>New Class</span>
                </button>
              </div>

              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} {cls.slug === 'other' ? '(Fallback / No Subject required)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Subject {isOtherClass ? '(Optional for Other)' : '*'}
                </label>
                {selectedClass && !isOtherClass && (
                  <button
                    type="button"
                    onClick={() => setIsSubjectModalOpen(true)}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <Icon name="PlusIcon" size={12} />
                    <span>New Subject</span>
                  </button>
                )}
              </div>

              {isOtherClass ? (
                <div className="px-3.5 py-2.5 rounded-xl border border-dashed border-border bg-muted/30 text-xs text-muted-foreground flex items-center gap-2">
                  <Icon name="FolderIcon" size={15} />
                  <span>Other class organizes lessons directly without a subject</span>
                </div>
              ) : (
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  disabled={isGenerating || subjects.length === 0}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                >
                  {subjects.length === 0 ? (
                    <option value="">No subjects yet — click &ldquo;+ New Subject&rdquo;</option>
                  ) : (
                    subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.lesson_count} lessons)
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Active AI & Domain Context Banner */}
          {(selectedClass || selectedSubject) && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/20 text-primary">
                    <Icon name="SparklesIcon" size={13} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Active AI Generation Context & Human Scope
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {selectedClass && (
                    <button
                      type="button"
                      onClick={() => setIsEditClassOpen(true)}
                      className="text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      <Icon name="PencilIcon" size={11} />
                      <span>Edit Class Context</span>
                    </button>
                  )}
                  {selectedSubject && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={() => setIsEditSubjectOpen(true)}
                        className="text-emerald-500 hover:underline flex items-center gap-1 font-medium"
                      >
                        <Icon name="PencilIcon" size={11} />
                        <span>Edit Subject Context</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                {/* Class Context Box */}
                <div className="rounded-lg bg-card/70 border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Icon name={(selectedClass?.icon || 'BookmarkIcon') as any} size={13} className="text-primary" />
                      <span>{selectedClass?.name || 'Class'}</span>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Class
                    </span>
                  </div>
                  {selectedClass?.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground">Human: </span>
                      {selectedClass.description}
                    </p>
                  )}
                  <p className="text-[11px] text-primary/90 font-mono bg-primary/5 p-1.5 rounded border border-primary/10">
                    <span className="font-bold">AI Directives: </span>
                    {selectedClass?.ai_context || 'Standard technical defaults'}
                  </p>
                </div>

                {/* Subject Context Box */}
                {selectedSubject ? (
                  <div className="rounded-lg bg-card/70 border border-border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Icon name="FolderIcon" size={13} className="text-emerald-500" />
                        <span>{selectedSubject.name}</span>
                      </span>
                      <span className="text-[10px] uppercase font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        Subject
                      </span>
                    </div>
                    {selectedSubject.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        <span className="font-medium text-foreground">Human: </span>
                        {selectedSubject.description}
                      </p>
                    )}
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10">
                      <span className="font-bold">AI Directives: </span>
                      {selectedSubject.ai_context || 'Inherits class directives'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-card/50 border border-dashed border-border p-3 flex items-center justify-center text-[11px] text-muted-foreground text-center">
                    {isOtherClass ? 'Lessons generated directly under Other class' : 'Select a subject to view its module context'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* One Text Box and One Upload Button */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
                Topic or Learning Material
              </label>
              <span className="text-[11px] text-muted-foreground">
                Enter a topic or paste study notes
              </span>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              onChange={handleFileUpload}
              className="hidden"
              id="generate-page-file-input"
            />

            {/* Uploaded File Chip (if attached) */}
            {uploadedFile && (
              <div className="flex items-center justify-between p-3 rounded-xl border border-primary/30 bg-primary/10 text-xs animate-fadeIn">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
                    <Icon name="DocumentCheckIcon" size={18} />
                  </div>
                  <div className="truncate">
                    <div className="font-semibold text-foreground truncate">{uploadedFile.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {uploadedFile.wordCount.toLocaleString()} words extracted
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  title="Remove document"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-2"
                >
                  <Icon name="XMarkIcon" size={14} />
                </button>
              </div>
            )}

            {/* The Unified Text Box */}
            <textarea
              rows={5}
              disabled={isGenerating}
              placeholder="e.g. CAP Theorem, Consistent Hashing, Vision Transformers, Raft Consensus, or paste full documentation/notes..."
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[110px]"
            />

            {/* One Upload Button Row */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={isGenerating || isUploadingFile}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted hover:border-primary/40 disabled:opacity-50 transition-all shadow-sm"
              >
                {isUploadingFile ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Extracting Document...</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowUpTrayIcon" size={14} className="text-primary" />
                    <span>{uploadedFile ? 'Replace Document' : 'Upload Document (PDF / Text / MD)'}</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
                Supports PDF, Markdown, Text, or Word
              </span>
            </div>
          </div>

          {/* Optional Custom Title */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Custom Title (Optional)
            </label>
            <input
              type="text"
              disabled={isGenerating}
              placeholder="Leave blank to let AI synthesize a polished title"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Generation Active State Banner */}
          {isGenerating && (
            <div className="p-5 rounded-2xl bg-primary/10 border border-primary/20 space-y-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="font-heading text-sm font-semibold text-primary">
                  Generating your interactive lesson...
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono pl-8">
                {GENERATION_STEPS[currentStepIdx]}
              </p>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-4 flex items-center justify-end">
            <button
              type="submit"
              disabled={isGenerating || isUploadingFile}
              className="w-full md:w-auto px-8 py-3.5 rounded-xl bg-primary text-white font-medium text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-102 flex items-center justify-center gap-2"
            >
              <Icon name="SparklesIcon" size={18} />
              <span>{isGenerating ? 'Generating Lesson...' : 'Generate Lesson'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Inline Create Modals */}
      <CreateClassModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        onCreated={(newCls) => {
          setClasses((prev) => [...prev, newCls]);
          setSelectedClassId(newCls.id);
        }}
      />

      <CreateSubjectModal
        isOpen={isSubjectModalOpen}
        targetClass={selectedClass}
        onClose={() => setIsSubjectModalOpen(false)}
        onCreated={(newSubj) => {
          setSubjects((prev) => [...prev, newSubj]);
          setSelectedSubjectId(newSubj.id);
        }}
      />

      {/* Inline Edit Modals */}
      <EditClassModal
        isOpen={isEditClassOpen}
        lmsClass={selectedClass}
        onClose={() => setIsEditClassOpen(false)}
        onUpdated={handleClassUpdated}
      />

      <EditSubjectModal
        isOpen={isEditSubjectOpen}
        subject={selectedSubject}
        onClose={() => setIsEditSubjectOpen(false)}
        onUpdated={handleSubjectUpdated}
      />
    </>
  );
}
