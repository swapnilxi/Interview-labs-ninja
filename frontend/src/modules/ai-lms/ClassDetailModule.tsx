'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from './context/LmsViewModeContext';
import { lmsService } from './services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from './types';
import SubjectCard from './components/SubjectCard';
import LessonList from './components/LessonList';
import CreateSubjectModal from './components/CreateSubjectModal';
import CreateProjectModal from './components/CreateProjectModal';
import EditClassModal from './components/EditClassModal';
import EditSubjectModal from './components/EditSubjectModal';
import ManualLessonModal from './components/ManualLessonModal';
import ConfirmDialog from './components/ConfirmDialog';
import EmptyState from './components/EmptyState';
import ExportClassButton from './components/ExportClassButton';
import ClassMembershipButton from './components/ClassMembershipButton';
import ClassRemindersButton from './components/ClassRemindersButton';
import ImportLabModuleButton from './components/ImportLabModuleButton';
import LmsVideos from './components/LmsVideos';
import SendClassUpdateButton from './components/SendClassUpdateButton';
import ShareClassButton from './components/ShareClassButton';
import ClassWorkbooks from './workbooks/ClassWorkbooks';
import {
  LMS_TOOLBAR_BTN,
  LMS_TOOLBAR_BTN_ACCENT,
  LMS_TOOLBAR_BTN_PRIMARY,
} from './components/toolbarStyles';
import { useLmsCopilotContext } from './context/LmsCopilotContext';
import { classCopilotContext } from './utils/copilotContext';

interface ClassDetailModuleProps {
  classSlug: string;
}

export default function ClassDetailModule({ classSlug }: ClassDetailModuleProps) {
  const { user, canEdit: canEditReal } = useAuth();
  const { isPreviewingAsStudent } = useLmsViewMode();
  const canEdit = canEditReal && !isPreviewingAsStudent;
  const [lmsClass, setLmsClass] = useState<LmsClass | null>(null);
  const isOwner = Boolean(user?.id && lmsClass?.owner_id === user.id);
  const canEditClass = canEdit || isOwner;
  useLmsCopilotContext(lmsClass ? classCopilotContext(lmsClass) : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isClassEditOpen, setIsClassEditOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [subjectToEdit, setSubjectToEdit] = useState<LmsSubject | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<LmsSubject | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<LmsLesson | null>(null);
  const [lessonToEdit, setLessonToEdit] = useState<LmsLesson | null>(null);
  const [isOrganizeSubjects, setIsOrganizeSubjects] = useState(false);

  const loadClass = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsService.getClass(classSlug);
      setLmsClass(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Class not found.');
    } finally {
      setLoading(false);
    }
  }, [classSlug]);

  useEffect(() => {
    loadClass();
  }, [loadClass]);

  // Reloads the class without swapping the page for its loading skeleton: the import dialog stays open on its
  // result screen while the new subject appears behind it.
  const refreshClass = useCallback(async () => {
    try {
      setLmsClass(await lmsService.getClass(classSlug));
    } catch {
      /* keep showing what is already there */
    }
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
    if (!lmsClass || !lmsClass.direct_lessons) return;
    const lessonMap = new Map(lmsClass.direct_lessons.map((l) => [l.id, l]));
    const reordered = newIds.map((id) => lessonMap.get(id)).filter(Boolean) as LmsLesson[];
    setLmsClass({ ...lmsClass, direct_lessons: reordered });

    try {
      await lmsService.reorderLessons(newIds);
    } catch (err) {
      console.error('Failed to reorder lessons', err);
      loadClass();
    }
  };

  const handleMoveSubject = async (index: number, direction: 'left' | 'right') => {
    if (!lmsClass || !lmsClass.subjects) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lmsClass.subjects.length) return;

    const newSubjects = [...lmsClass.subjects];
    const temp = newSubjects[index];
    newSubjects[index] = newSubjects[targetIndex];
    newSubjects[targetIndex] = temp;

    setLmsClass({ ...lmsClass, subjects: newSubjects });

    try {
      await lmsService.reorderSubjects(newSubjects.map((s) => s.id));
    } catch (err) {
      console.error('Failed to reorder subjects', err);
      loadClass();
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl animate-pulse space-y-[1.5rem] px-4 py-10 sm:px-[1.5rem] lg:px-8">
        <div className="h-4 w-[12rem] max-w-full rounded bg-muted" />
        <div className="h-10 w-[24rem] max-w-full rounded bg-muted" />
        <div className="h-[1.5rem] w-full max-w-xl rounded bg-muted" />
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
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 pb-[8rem] pt-[2rem] sm:px-[1.5rem] md:pt-[3rem] lg:px-8">
      {/* Header: where you are, what this class is, what you can do with it, how the AI is guided */}
      <header className="space-y-[1.25rem] border-b border-border pb-[1.75rem]">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
          <BackButton href="/ai-lms" label="Back" className="-ml-2.5" />
          <div className="h-3.5 w-px bg-border/80" />
          <Link href="/ai-lms" className="lms-crumb -my-2.5 py-2.5 transition-colors hover:text-foreground">
            AI LMS
          </Link>
          <span>/</span>
          <span className="min-w-0 break-words font-semibold text-foreground">{lmsClass.name}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center rounded-xl border shadow-sm transition-colors"
              style={{
                backgroundColor: `color-mix(in srgb, ${lmsClass.accent_color || '#6366f1'} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${lmsClass.accent_color || '#6366f1'} 30%, transparent)`,
                color: lmsClass.accent_color || '#6366f1',
              }}
            >
              <Icon name={lmsClass.icon || 'BookmarkIcon'} size={22} />
            </div>
            <h1 className="min-w-0 break-words font-heading text-2xl font-extrabold text-foreground md:text-4xl">
              {lmsClass.name}
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {lmsClass.description || 'Curated modules and structured technical lesson sequences.'}
          </p>
        </div>

        {/* Actions. Everyone's first, then the instructor's; each group wraps as a unit, so a row never
            splits a set of buttons beside the title the way it did when they all sat next to it. */}
        <div className="flex flex-wrap items-center gap-x-[1.5rem] gap-y-[0.625rem]">
          <div className="flex flex-wrap items-center gap-2">
            <ClassMembershipButton classSlug={lmsClass.slug} />
            <ClassRemindersButton classSlug={lmsClass.slug} className={lmsClass.name} />
            <ShareClassButton classSlug={lmsClass.slug} className={lmsClass.name} />
            <Link href={`/ai-lms/classes/${lmsClass.slug}/landing`} className={LMS_TOOLBAR_BTN}>
              <Icon name="GlobeAltIcon" size={14} />
              <span>Landing Page</span>
            </Link>
            <ExportClassButton classSlug={lmsClass.slug} className={LMS_TOOLBAR_BTN} />
          </div>

          {canEditClass && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/ai-lms/generate?class=${lmsClass.slug}`} className={LMS_TOOLBAR_BTN_PRIMARY}>
                <Icon name="SparklesIcon" size={14} />
                <span>Generate Lesson</span>
              </Link>
              {!isOtherClass && (
                <button type="button" onClick={() => setIsSubjectModalOpen(true)} className={LMS_TOOLBAR_BTN}>
                  <Icon name="PlusIcon" size={14} />
                  <span>New Subject</span>
                </button>
              )}
              {!isOtherClass && (
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(true)}
                  className={LMS_TOOLBAR_BTN_ACCENT}
                >
                  <Icon name="CodeBracketSquareIcon" size={14} />
                  <span>Add Project</span>
                </button>
              )}
              {isOtherClass && (
                <button
                  type="button"
                  onClick={() => {
                    setLessonToEdit(null);
                    setIsLessonModalOpen(true);
                  }}
                  className={LMS_TOOLBAR_BTN}
                >
                  <Icon name="PlusIcon" size={14} />
                  <span>Add Lesson</span>
                </button>
              )}
              {!isOtherClass && (
                <ImportLabModuleButton
                  targetClass={lmsClass}
                  existingSubjects={subjects}
                  onImported={refreshClass}
                />
              )}
              <SendClassUpdateButton classSlug={lmsClass.slug} className={lmsClass.name} />
              <button type="button" onClick={() => setIsClassEditOpen(true)} className={LMS_TOOLBAR_BTN}>
                <Icon name="PencilSquareIcon" size={14} />
                <span>Edit Class</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Guidance Context Card */}
        <div className="glow-card-wrap relative" style={{ '--card-accent': '#8b5cf6' } as React.CSSProperties}>
          <div className="glow-card relative flex flex-col justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-start">
            <span className="glow-card-rim" aria-hidden="true" />
            <div className="relative z-[2] min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary">
                  <Icon name="SparklesIcon" size={12} />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                  AI Generation Guidance Context
                </h3>
              </div>
              <p className="break-words pl-7 text-xs leading-relaxed text-muted-foreground">
                {lmsClass.ai_context
                  ? lmsClass.ai_context
                  : 'No custom AI instructions set. AI will use standard defaults. Click "Edit Context" to provide domain depth, target audience, or stack requirements.'}
              </p>
            </div>
            {canEditClass && (
              <button
                type="button"
                onClick={() => setIsClassEditOpen(true)}
                className="relative z-[2] ml-7 inline-flex min-h-[2.25rem] flex-shrink-0 items-center gap-1.5 self-start rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 sm:ml-0 sm:self-auto"
              >
                <Icon name="PencilIcon" size={12} />
                <span>{lmsClass.ai_context ? 'Edit AI Context' : 'Add AI Context'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <LmsVideos scope="class" refId={lmsClass.id} canEdit={canEditClass} />

      {/* Normal Classes: Show Subjects Grid */}
      {!isOtherClass && (
        <section className="space-y-[1.5rem]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold text-foreground">
                Subjects & Projects ({subjects.length})
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Topic modules for concepts, or projects for AI-planned implementation roadmaps
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {canEdit && subjects.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsOrganizeSubjects(!isOrganizeSubjects)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all ${
                    isOrganizeSubjects
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon name="ArrowsUpDownIcon" size={14} />
                  <span>{isOrganizeSubjects ? 'Done Organizing' : 'Organize Subjects'}</span>
                </button>
              )}

              <span className="text-xs font-medium text-muted-foreground">
                {lmsClass.lesson_count} total lessons in this class
              </span>
            </div>
          </div>

          {subjects.length === 0 ? (
            <EmptyState
              icon="FolderIcon"
              title="No subjects or projects created yet"
              description={`Add a subject to teach concepts, or a project to generate a step-by-step implementation roadmap under ${lmsClass.name}.`}
              primaryAction={canEditClass ? {
                label: 'Create Subject',
                onClick: () => setIsSubjectModalOpen(true),
                icon: 'PlusIcon',
              } : undefined}
              secondaryAction={canEditClass ? {
                label: 'Add Project',
                onClick: () => setIsProjectModalOpen(true),
                icon: 'CodeBracketSquareIcon',
              } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subj, idx) => (
                <SubjectCard
                  key={subj.id}
                  subject={subj}
                  classSlug={lmsClass.slug}
                  onEdit={canEditClass ? (s) => setSubjectToEdit(s) : undefined}
                  onDelete={canEditClass ? (s) => setSubjectToDelete(s) : undefined}
                  isOrganizeMode={isOrganizeSubjects}
                  orderIndex={idx}
                  canMoveLeft={idx > 0}
                  canMoveRight={idx < subjects.length - 1}
                  // Reordering changes shared content: only instructors get the arrows (a learner's tap would be a 403).
                  onMoveLeft={canEditClass ? () => handleMoveSubject(idx, 'left') : undefined}
                  onMoveRight={canEditClass ? () => handleMoveSubject(idx, 'right') : undefined}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Fallback "Other" Class: Direct Lessons Sequence */}
      {isOtherClass && (
        <section className="space-y-[1.5rem]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Standalone Lessons ({directLessons.length})
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Uncategorized lessons stored directly under the Other fallback class
              </p>
            </div>
          </div>

          {directLessons.length === 0 ? (
            <EmptyState
              icon="DocumentTextIcon"
              title="No standalone lessons yet"
              description="Generate a lesson under the Other class without needing to specify a subject."
              primaryAction={canEditClass ? {
                label: 'Generate Lesson',
                href: `/ai-lms/generate?class=${lmsClass.slug}`,
                icon: 'SparklesIcon',
              } : undefined}
              secondaryAction={canEditClass ? {
                label: 'Create Manually',
                onClick: () => {
                  setLessonToEdit(null);
                  setIsLessonModalOpen(true);
                },
                icon: 'PlusIcon',
              } : undefined}
            />
          ) : (
            <LessonList
              lessons={directLessons}
              classSlug={lmsClass.slug}
              onEdit={canEditClass ? (l) => {
                setLessonToEdit(l);
                setIsLessonModalOpen(true);
              } : undefined}
              onDelete={canEditClass ? (l) => setLessonToDelete(l) : undefined}
              onReorder={canEditClass ? handleReorderDirectLessons : undefined}
            />
          )}
        </section>
      )}

      {/* Workbooks: books and lessons turned into interactive exercises (private answers per learner) */}
      <ClassWorkbooks classSlug={lmsClass.slug} className={lmsClass.name} />

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

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        targetClass={lmsClass}
        onClose={() => setIsProjectModalOpen(false)}
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
