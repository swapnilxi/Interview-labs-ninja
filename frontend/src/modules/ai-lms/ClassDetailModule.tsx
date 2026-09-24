'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from './services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from './types';
import SubjectCard from './components/SubjectCard';
import LessonList from './components/LessonList';
import CreateSubjectModal from './components/CreateSubjectModal';
import EditClassModal from './components/EditClassModal';
import EditSubjectModal from './components/EditSubjectModal';
import ManualLessonModal from './components/ManualLessonModal';
import ConfirmDialog from './components/ConfirmDialog';
import EmptyState from './components/EmptyState';

interface ClassDetailModuleProps {
  classSlug: string;
}

export default function ClassDetailModule({ classSlug }: ClassDetailModuleProps) {
  const [lmsClass, setLmsClass] = useState<LmsClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isClassEditOpen, setIsClassEditOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [subjectToEdit, setSubjectToEdit] = useState<LmsSubject | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<LmsSubject | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LmsLesson | null>(null);
  const [lessonToEdit, setLessonToEdit] = useState<LmsLesson | null>(null);

  const loadClass = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsService.getClass(classSlug);
      setLmsClass(data);
    } catch (err: any) {
      setError(err?.message || 'Class not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClass();
  }, [classSlug]);

  const handleDeleteSubject = async () => {
    if (!subjectToDelete) return;
    try {
      await lmsService.deleteSubject(subjectToDelete.id);
      setSubjectToDelete(null);
      loadClass();
    } catch (err) {
      console.error('Failed to delete subject', err);
    }
  };

  const handleDeleteLesson = async () => {
    if (!lessonToDelete) return;
    try {
      await lmsService.deleteLesson(lessonToDelete.id);
      setLessonToDelete(null);
      loadClass();
    } catch (err) {
      console.error('Failed to delete lesson', err);
    }
  };

  const handleReorderDirectLessons = async (newIds: string[]) => {
    try {
      await lmsService.reorderLessons(newIds);
      loadClass();
    } catch (err) {
      console.error('Failed to reorder lessons', err);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-10 w-96 bg-muted rounded" />
        <div className="h-6 w-full max-w-xl bg-muted rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !lmsClass) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
        <EmptyState
          icon="ExclamationTriangleIcon"
          title="Class Not Found"
          description={error || "The class you're looking for doesn't exist or has been removed."}
          primaryAction={{
            label: 'Return to LMS Home',
            href: '/ai-lms',
            icon: 'ArrowLeftIcon',
          }}
        />
      </div>
    );
  }

  const isOtherClass = lmsClass.slug === 'other';
  const subjects = lmsClass.subjects || [];
  const directLessons = lmsClass.direct_lessons || [];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-10">
      {/* Header & Breadcrumbs */}
      <div className="space-y-4 pb-6 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/ai-lms" className="hover:text-foreground transition-colors flex items-center gap-1">
            <Icon name="ArrowLeftIcon" size={12} />
            <span>AI LMS</span>
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{lmsClass.name}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Icon name={(lmsClass.icon || 'BookmarkIcon') as any} size={22} />
              </div>
              <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-foreground">
                {lmsClass.name}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {lmsClass.description || 'Curated modules and structured technical lesson sequences.'}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsClassEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
            >
              <Icon name="PencilSquareIcon" size={14} />
              <span>Edit Class</span>
            </button>

            {!isOtherClass && (
              <button
                type="button"
                onClick={() => setIsSubjectModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
              >
                <Icon name="PlusIcon" size={14} />
                <span>New Subject</span>
              </button>
            )}

            {isOtherClass && (
              <button
                type="button"
                onClick={() => {
                  setLessonToEdit(null);
                  setIsLessonModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
              >
                <Icon name="PlusIcon" size={14} />
                <span>Add Lesson</span>
              </button>
            )}

            <Link
              href={`/ai-lms/generate?class=${lmsClass.slug}`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/25 hover:bg-primary/90 transition-all hover:scale-102"
            >
              <Icon name="SparklesIcon" size={15} />
              <span>Generate Lesson</span>
            </Link>
          </div>
        </div>

        {/* AI Guidance Context Card */}
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/20 text-primary">
                <Icon name="SparklesIcon" size={12} />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                AI Generation Guidance Context
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pl-7">
              {lmsClass.ai_context
                ? lmsClass.ai_context
                : 'No custom AI instructions set. AI will use standard defaults. Click "Edit Context" to provide domain depth, target audience, or stack requirements.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsClassEditOpen(true)}
            className="flex-shrink-0 self-start sm:self-auto text-xs font-semibold text-primary hover:underline flex items-center gap-1 pl-7 sm:pl-0"
          >
            <Icon name="PencilIcon" size={12} />
            <span>{lmsClass.ai_context ? 'Edit AI Context' : 'Add AI Context'}</span>
          </button>
        </div>
      </div>

      {/* Normal Classes: Show Subjects Grid */}
      {!isOtherClass && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-bold text-foreground">
              Module Subjects ({subjects.length})
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              {lmsClass.lesson_count} total lessons in this class
            </span>
          </div>

          {subjects.length === 0 ? (
            <EmptyState
              icon="FolderIcon"
              title="No subjects created yet"
              description={`Add your first subject module under ${lmsClass.name}, or generate an interactive lesson with AI.`}
              primaryAction={{
                label: 'Create Subject',
                onClick: () => setIsSubjectModalOpen(true),
                icon: 'PlusIcon',
              }}
              secondaryAction={{
                label: 'Generate Lesson with AI',
                href: `/ai-lms/generate?class=${lmsClass.slug}`,
                icon: 'SparklesIcon',
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {subjects.map((subj) => (
                <SubjectCard
                  key={subj.id}
                  subject={subj}
                  classSlug={lmsClass.slug}
                  onEdit={(s) => setSubjectToEdit(s)}
                  onDelete={(s) => setSubjectToDelete(s)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Fallback "Other" Class: Direct Lessons Sequence */}
      {isOtherClass && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Standalone Lessons ({directLessons.length})
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Uncategorized lessons stored directly under the Other fallback class
              </p>
            </div>
          </div>

          {directLessons.length === 0 ? (
            <EmptyState
              icon="DocumentTextIcon"
              title="No standalone lessons yet"
              description="Generate a lesson under the Other class without needing to specify a subject."
              primaryAction={{
                label: 'Generate Lesson',
                href: `/ai-lms/generate?class=${lmsClass.slug}`,
                icon: 'SparklesIcon',
              }}
              secondaryAction={{
                label: 'Create Manually',
                onClick: () => {
                  setLessonToEdit(null);
                  setIsLessonModalOpen(true);
                },
                icon: 'PlusIcon',
              }}
            />
          ) : (
            <LessonList
              lessons={directLessons}
              classSlug={lmsClass.slug}
              onEdit={(l) => {
                setLessonToEdit(l);
                setIsLessonModalOpen(true);
              }}
              onDelete={(l) => setLessonToDelete(l)}
              onReorder={handleReorderDirectLessons}
            />
          )}
        </section>
      )}

      {/* Edit Class Modal */}
      <EditClassModal
        isOpen={isClassEditOpen}
        lmsClass={lmsClass}
        onClose={() => setIsClassEditOpen(false)}
        onUpdated={() => loadClass()}
      />

      {/* Create Subject Modal */}
      <CreateSubjectModal
        isOpen={isSubjectModalOpen}
        targetClass={lmsClass}
        onClose={() => setIsSubjectModalOpen(false)}
        onCreated={() => loadClass()}
      />

      {/* Edit Subject Modal */}
      <EditSubjectModal
        isOpen={!!subjectToEdit}
        subject={subjectToEdit}
        onClose={() => setSubjectToEdit(null)}
        onUpdated={() => loadClass()}
      />

      {/* Manual Lesson Modal (for Other direct lessons) */}
      <ManualLessonModal
        isOpen={isLessonModalOpen}
        targetClass={lmsClass}
        targetSubject={null}
        lessonToEdit={lessonToEdit}
        onClose={() => setIsLessonModalOpen(false)}
        onSaved={() => loadClass()}
      />

      {/* Delete Subject Dialog */}
      <ConfirmDialog
        isOpen={!!subjectToDelete}
        title="Delete Subject"
        message={`Are you sure you want to delete "${subjectToDelete?.name}"? All lessons in this subject will be deleted.`}
        confirmLabel="Delete Subject"
        isDestructive={true}
        onConfirm={handleDeleteSubject}
        onCancel={() => setSubjectToDelete(null)}
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
