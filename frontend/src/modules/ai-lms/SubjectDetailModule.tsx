'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from './context/LmsViewModeContext';
import { lmsService } from './services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from './types';
import LessonList from './components/LessonList';
import ManualLessonModal from './components/ManualLessonModal';
import EditSubjectModal from './components/EditSubjectModal';
import ConfirmDialog from './components/ConfirmDialog';
import EmptyState from './components/EmptyState';
import QuickLessonGenerator from './components/QuickLessonGenerator';
import ProjectDetailModule from './components/ProjectDetailModule';

interface SubjectDetailModuleProps {
  classSlug: string;
  subjectSlug: string;
}

export default function SubjectDetailModule({ classSlug, subjectSlug }: SubjectDetailModuleProps) {
  const { canEdit: canEditReal } = useAuth();
  const { isPreviewingAsStudent } = useLmsViewMode();
  const canEdit = canEditReal && !isPreviewingAsStudent;
  const [subject, setSubject] = useState<LmsSubject | null>(null);
  const [lmsClass, setLmsClass] = useState<LmsClass | null>(null);
  const [lessons, setLessons] = useState<LmsLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isSubjectEditOpen, setIsSubjectEditOpen] = useState(false);
  const [projectTab, setProjectTab] = useState<'modules' | 'edit'>('modules');
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [lessonToEdit, setLessonToEdit] = useState<LmsLesson | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LmsLesson | null>(null);

  const loadSubject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsService.getSubject(classSlug, subjectSlug);
      setSubject(data);
      if (data.class) {
        setLmsClass(data.class);
      } else {
        const cls = await lmsService.getClass(classSlug);
        setLmsClass(cls);
      }
      setLessons(data.lessons || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Subject not found.');
    } finally {
      setLoading(false);
    }
  }, [classSlug, subjectSlug]);

  useEffect(() => {
    loadSubject();
  }, [loadSubject]);

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
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const reordered = newIds.map((id) => lessonMap.get(id)).filter(Boolean) as LmsLesson[];
    setLessons(reordered);

    try {
      await lmsService.reorderLessons(newIds);
    } catch (err) {
      console.error('Failed to reorder lessons', err);
      loadSubject();
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
          description={error || "The subject you're looking for doesn't exist."}
          primaryAction={{
            label: 'Return to LMS Home',
            href: '/ai-lms',
            icon: 'ArrowLeftIcon',
          }}
        />
      </div>
    );
  }

  const isProject = subject.kind === 'project';
  const subjectAccent = subject.accent_color || (isProject ? '#8b5cf6' : '#38bdf8');

  if (isProject) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-8">
        {/* Breadcrumbs & Header */}
        <div className="space-y-4 pb-6 border-b border-border">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
            <Link
              href={`/ai-lms/classes/${lmsClass.slug}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card/80 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shadow-2xs group"
              title={`Back to ${lmsClass.name}`}
            >
              <Icon name="ArrowLeftIcon" size={12} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>Back</span>
            </Link>
            <div className="h-3.5 w-px bg-border/80" />
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
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-[40px] w-[40px] items-center justify-center rounded-lg font-semibold text-xs border"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${subjectAccent} 14%, transparent)`,
                    borderColor: `color-mix(in srgb, ${subjectAccent} 30%, transparent)`,
                    color: subjectAccent,
                  }}
                >
                  <Icon name="CodeBracketSquareIcon" size={20} />
                </div>
                <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-foreground">
                  {subject.name}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                {subject.description || 'AI-generated implementation modules for this project.'}
              </p>
              <div className="text-xs font-semibold pt-1" style={{ color: subjectAccent }}>
                {(subject.project_plan || []).length}{' '}
                {(subject.project_plan || []).length === 1 ? 'module' : 'modules'} planned
              </div>
            </div>

            {canEdit && <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setProjectTab((t) => (t === 'edit' ? 'modules' : 'edit'))}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border font-medium text-xs transition-colors shadow-sm ${
                  projectTab === 'edit'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                <Icon name="PencilSquareIcon" size={14} />
                <span>{projectTab === 'edit' ? 'Editing Project' : 'Edit Project'}</span>
              </button>
            </div>}
          </div>
        </div>

        <ProjectDetailModule
          project={subject}
          lmsClass={lmsClass}
          onReload={() => loadSubject()}
          mode={projectTab}
          onDone={() => setProjectTab('modules')}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-8">
      {/* Breadcrumbs & Header */}
      <div className="space-y-4 pb-6 border-b border-border">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
          <Link
            href={`/ai-lms/classes/${lmsClass.slug}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card/80 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-all shadow-2xs group"
            title={`Back to ${lmsClass.name}`}
          >
            <Icon name="ArrowLeftIcon" size={12} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back</span>
          </Link>
          <div className="h-3.5 w-px bg-border/80" />
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
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-[40px] w-[40px] items-center justify-center rounded-lg font-semibold text-xs border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${subjectAccent} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${subjectAccent} 30%, transparent)`,
                  color: subjectAccent,
                }}
              >
                <Icon name="FolderIcon" size={20} />
              </div>
              <h1 className="font-heading text-2xl md:text-4xl font-extrabold text-foreground">
                {subject.name}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {subject.description || 'Structured sequence of curriculum lessons.'}
            </p>
            <div className="text-xs font-semibold pt-1" style={{ color: subjectAccent }}>
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} in this subject
            </div>
          </div>

          {/* Action CTAs */}
          {canEdit && (
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
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-sm hover:bg-primary/90 transition-all"
            >
              <Icon name="SparklesIcon" size={15} />
              <span>Generate with AI</span>
            </Link>
          </div>
          )}
        </div>

        {/* Subject AI Directives Card */}
        <div
          className="glow-card-wrap relative mt-4"
          style={{ '--card-accent': subjectAccent || '#38bdf8' } as React.CSSProperties}
        >
          <div className="glow-card relative rounded-xl border border-secondary/25 bg-secondary/5 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs">
            <span className="glow-card-rim" aria-hidden="true" />
            <div className="space-y-1 relative z-[2]">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-secondary/20 text-secondary">
                  <Icon name="SparklesIcon" size={12} />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
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
            {canEdit && (
            <button
              type="button"
              onClick={() => setIsSubjectEditOpen(true)}
              className="relative z-[2] flex-shrink-0 self-start sm:self-auto ml-7 sm:ml-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-secondary/30 bg-secondary/10 text-secondary text-xs font-semibold hover:bg-secondary/20 transition-colors"
            >
              <Icon name="PencilIcon" size={12} />
              <span>{subject.ai_context ? 'Edit AI Context' : 'Add AI Context'}</span>
            </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick AI Lesson Generator (One text box + One upload button) */}
      {canEdit && <QuickLessonGenerator
        classId={lmsClass.id}
        classSlug={lmsClass.slug}
        classNameText={lmsClass.name}
        subjectId={subject.id}
        subjectSlug={subject.slug}
        subjectNameText={subject.name}
        onLessonGenerated={() => loadSubject()}
      />}

      {/* Lesson List */}
      <section className="space-y-4">
        {lessons.length === 0 ? (
          <EmptyState
            icon="DocumentTextIcon"
            title="No lessons in this subject yet"
            description="Generate your first interactive lesson using AI or create one manually with code/notes."
            primaryAction={canEdit ? {
              label: 'Generate Lesson with AI',
              href: `/ai-lms/generate?class=${lmsClass.slug}&subject=${subject.slug}`,
              icon: 'SparklesIcon',
            } : undefined}
            secondaryAction={canEdit ? {
              label: 'Create Lesson Manually',
              onClick: () => {
                setLessonToEdit(null);
                setIsLessonModalOpen(true);
              },
              icon: 'PlusIcon',
            } : undefined}
          />
        ) : (
          <LessonList
            lessons={lessons}
            classSlug={lmsClass.slug}
            subjectSlug={subject.slug}
            onEdit={canEdit ? (l) => {
              setLessonToEdit(l);
              setIsLessonModalOpen(true);
            } : undefined}
            onDelete={canEdit ? (l) => setLessonToDelete(l) : undefined}
            onReorder={canEdit ? handleReorderLessons : undefined}
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
