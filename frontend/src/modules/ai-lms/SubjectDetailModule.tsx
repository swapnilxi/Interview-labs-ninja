'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from './services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from './types';
import LessonList from './components/LessonList';
import ManualLessonModal from './components/ManualLessonModal';
import EditSubjectModal from './components/EditSubjectModal';
import ConfirmDialog from './components/ConfirmDialog';
import EmptyState from './components/EmptyState';

interface SubjectDetailModuleProps {
  classSlug: string;
  subjectSlug: string;
}

export default function SubjectDetailModule({
  classSlug,
  subjectSlug,
}: SubjectDetailModuleProps) {
  const [subject, setSubject] = useState<LmsSubject | null>(null);
  const [lmsClass, setLmsClass] = useState<LmsClass | null>(null);
  const [lessons, setLessons] = useState<LmsLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isSubjectEditOpen, setIsSubjectEditOpen] = useState(false);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [lessonToEdit, setLessonToEdit] = useState<LmsLesson | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LmsLesson | null>(null);

  const loadSubject = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsService.getSubject(classSlug, subjectSlug);
      setSubject(data);
      setLmsClass(data.class || null);
      setLessons(data.lessons || []);
    } catch (err: any) {
      setError(err?.message || 'Subject not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubject();
  }, [classSlug, subjectSlug]);

  const handleDeleteLesson = async () => {
    if (!lessonToDelete) return;
    try {
      await lmsService.deleteLesson(lessonToDelete.id);
      setLessonToDelete(null);
      loadSubject();
    } catch (err) {
      console.error('Failed to delete lesson', err);
    }
  };

  const handleReorderLessons = async (newIds: string[]) => {
    try {
      await lmsService.reorderLessons(newIds);
      loadSubject();
    } catch (err) {
      console.error('Failed to reorder lessons', err);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-10 w-96 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
        <div className="space-y-3 pt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !subject || !lmsClass) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
        <EmptyState
          icon="ExclamationTriangleIcon"
          title="Subject Not Found"
          description={error || "The subject module you're looking for doesn't exist."}
          primaryAction={{
            label: 'Return to LMS Home',
            href: '/ai-lms',
            icon: 'ArrowLeftIcon',
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-8">
      {/* Breadcrumbs & Header */}
      <div className="space-y-4 pb-6 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href="/ai-lms" className="hover:text-foreground transition-colors">
            AI LMS
          </Link>
          <span>/</span>
          <Link
            href={`/ai-lms/classes/${lmsClass.slug}`}
            className="hover:text-foreground transition-colors font-medium"
          >
            {lmsClass.name}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{subject.name}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-foreground">
              {subject.name}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {subject.description || 'Structured sequence of curriculum lessons.'}
            </p>
            <div className="text-xs font-semibold text-primary pt-1">
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} in this module
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsSubjectEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
            >
              <Icon name="PencilSquareIcon" size={14} />
              <span>Edit Subject</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLessonToEdit(null);
                setIsLessonModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
            >
              <Icon name="PlusIcon" size={14} />
              <span>Create Lesson</span>
            </button>

            <Link
              href={`/ai-lms/generate?class=${lmsClass.slug}&subject=${subject.slug}`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/25 hover:bg-primary/90 transition-all hover:scale-102"
            >
              <Icon name="SparklesIcon" size={15} />
              <span>Generate with AI</span>
            </Link>
          </div>
        </div>

        {/* Subject AI Directives Card */}
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-500">
                <Icon name="SparklesIcon" size={12} />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                Subject AI Directives & Context
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-7">
              {subject.ai_context
                ? subject.ai_context
                : 'No specific subject AI directives configured. Lesson generation will inherit class context. Click "Edit AI Context" to specify custom focus areas, frameworks, or depth.'}
            </p>
            {lmsClass.ai_context && (
              <div className="pl-7 pt-1 text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                <span className="font-semibold text-primary">Inherits Class Guidance:</span>
                <span className="truncate max-w-md">{lmsClass.ai_context}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsSubjectEditOpen(true)}
            className="flex-shrink-0 self-start sm:self-auto text-xs font-semibold text-emerald-500 hover:underline flex items-center gap-1 pl-7 sm:pl-0"
          >
            <Icon name="PencilIcon" size={12} />
            <span>{subject.ai_context ? 'Edit AI Context' : 'Add AI Context'}</span>
          </button>
        </div>
      </div>

      {/* Lesson List */}
      <section className="space-y-4">
        {lessons.length === 0 ? (
          <EmptyState
            icon="DocumentTextIcon"
            title="No lessons in this subject yet"
            description="Generate your first interactive lesson using AI or create one manually with code/notes."
            primaryAction={{
              label: 'Generate Lesson with AI',
              href: `/ai-lms/generate?class=${lmsClass.slug}&subject=${subject.slug}`,
              icon: 'SparklesIcon',
            }}
            secondaryAction={{
              label: 'Create Lesson Manually',
              onClick: () => {
                setLessonToEdit(null);
                setIsLessonModalOpen(true);
              },
              icon: 'PlusIcon',
            }}
          />
        ) : (
          <LessonList
            lessons={lessons}
            classSlug={lmsClass.slug}
            subjectSlug={subject.slug}
            onEdit={(l) => {
              setLessonToEdit(l);
              setIsLessonModalOpen(true);
            }}
            onDelete={(l) => setLessonToDelete(l)}
            onReorder={handleReorderLessons}
          />
        )}
      </section>

      {/* Edit Subject Modal */}
      <EditSubjectModal
        isOpen={isSubjectEditOpen}
        subject={subject}
        onClose={() => setIsSubjectEditOpen(false)}
        onUpdated={() => loadSubject()}
      />

      {/* Manual Lesson Modal */}
      <ManualLessonModal
        isOpen={isLessonModalOpen}
        targetClass={lmsClass}
        targetSubject={subject}
        lessonToEdit={lessonToEdit}
        onClose={() => setIsLessonModalOpen(false)}
        onSaved={() => loadSubject()}
      />

      {/* Delete Lesson Dialog */}
      <ConfirmDialog
        isOpen={!!lessonToDelete}
        title="Delete Lesson"
        message={`Are you sure you want to delete "${lessonToDelete?.title}"?`}
        confirmLabel="Delete Lesson"
        isDestructive={true}
        onConfirm={handleDeleteLesson}
        onCancel={() => setLessonToDelete(null)}
      />
    </div>
  );
}
