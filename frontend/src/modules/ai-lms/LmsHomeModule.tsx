'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from './context/LmsViewModeContext';
import { lmsService } from './services/lmsService';
import type { ContinueLearningItem, LmsClass } from './types';
import SearchBar from './components/SearchBar';
import ContinueLearningBanner from './components/ContinueLearningBanner';
import ClassCard from './components/ClassCard';
import CreateClassModal from './components/CreateClassModal';
import EditClassModal from './components/EditClassModal';
import ConfirmDialog from './components/ConfirmDialog';
import InstructorManagementTab from './components/InstructorManagementTab';
import { useLearningProgress } from './services/learningStateManager';
import { useLmsCopilotContext } from './context/LmsCopilotContext';
import { homeCopilotContext } from './utils/copilotContext';

export default function LmsHomeModule() {
  const { canEdit: canEditReal } = useAuth();
  const { isPreviewingAsStudent } = useLmsViewMode();
  const canEdit = canEditReal && !isPreviewingAsStudent;
  const [classes, setClasses] = useState<LmsClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Learning State & Tracks
  const {
    continueItem,
    recentItems,
    loading: continueLoading,
    selectActiveTrack,
  } = useLearningProgress();

  // Sub-tabs: 'classes' | 'instructors'
  const [activeTab, setActiveTab] = useState<'classes' | 'instructors'>('classes');

  // Sync tab with URL search parameter if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'instructors' || tabParam === 'instructor') {
        setActiveTab('instructors');
      }
    }
  }, []);

  const handleTabChange = (tab: 'classes' | 'instructors') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<LmsClass | null>(null);
  const [classToDelete, setClassToDelete] = useState<LmsClass | null>(null);
  const [isOrganizeMode, setIsOrganizeMode] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const clsData = await lmsService.getClasses();
      setClasses(clsData);
    } catch (err) {
      console.error('Failed to load classes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      await lmsService.deleteClass(classToDelete.id);
      setClassToDelete(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete class', err);
    }
  };

  const handleMoveClass = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= classes.length) return;

    const newClasses = [...classes];
    const temp = newClasses[index];
    newClasses[index] = newClasses[targetIndex];
    newClasses[targetIndex] = temp;

    setClasses(newClasses);

    try {
      await lmsService.reorderClasses(newClasses.map((c) => c.id));
    } catch (err) {
      console.error('Failed to reorder classes', err);
      loadData();
    }
  };

  useLmsCopilotContext(classes.length > 0 ? homeCopilotContext(classes) : null);

  const totalLessons = classes.reduce((sum, c) => sum + (c.lesson_count || 0), 0);
  const totalSubjects = classes.reduce((sum, c) => sum + (c.subject_count || 0), 0);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-[2rem] lg:px-[2.5rem] pt-[2rem] pb-[6rem] space-y-[2.5rem]">
      {/* Header: identity + primary actions, then segmented nav + stats */}
      <header className="space-y-[1.5rem]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[1.5rem]">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <div
              className="flex h-[3rem] w-[3rem] flex-shrink-0 items-center justify-center rounded-xl border text-primary"
              style={{
                background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
                borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
              }}
            >
              <Icon name="SparklesIcon" size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  AI Learning Platform
                </h1>
                <span
                  className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                  style={{
                    background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--color-primary) 28%, transparent)',
                  }}
                >
                  AI LMS 2.0
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Generate, organize, and consume interactive engineering lessons. Manage curriculum
                classes &amp; AI faculty personas.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:flex-shrink-0">
            <Link
              href="/ai-lms/landing"
              title="About AI LMS & all classes"
              className="lms-btn-secondary"
            >
              <Icon name="InformationCircleIcon" size={15} />
              <span>About AI LMS</span>
            </Link>

            {canEdit && activeTab === 'classes' && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="lms-btn-secondary"
              >
                <Icon name="PlusIcon" size={15} />
                <span>New Class</span>
              </button>
            )}

            {canEdit && (
              <Link href="/ai-lms/generate" className="lms-btn-primary">
                <Icon name="SparklesIcon" size={15} />
                <span>Generate Lesson</span>
              </Link>
            )}
          </div>
        </div>

        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t pt-[1.5rem]"
          style={{ borderColor: 'color-mix(in srgb, var(--color-foreground) 10%, transparent)' }}
        >
          <nav className="lms-segment w-fit max-w-full overflow-x-auto" aria-label="AI LMS sections">
            <button
              type="button"
              onClick={() => handleTabChange('classes')}
              aria-current={activeTab === 'classes'}
              className="lms-segment-item"
            >
              <Icon name="AcademicCapIcon" size={15} />
              <span>Class Management</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('instructors')}
              aria-current={activeTab === 'instructors'}
              className="lms-segment-item"
            >
              <Icon name="UserGroupIcon" size={15} />
              <span>Instructor Management</span>
            </button>
          </nav>

          {activeTab === 'classes' && (
            <dl className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Classes</dt>
                <dd className="font-semibold text-foreground">{classes.length}</dd>
                <span aria-hidden="true">classes</span>
              </div>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Subjects</dt>
                <dd className="font-semibold text-foreground">{totalSubjects}</dd>
                <span aria-hidden="true">subjects</span>
              </div>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <div className="flex items-baseline gap-1">
                <dt className="sr-only">Lessons</dt>
                <dd className="font-semibold text-foreground">{totalLessons}</dd>
                <span aria-hidden="true">lessons</span>
              </div>
            </dl>
          )}
        </div>
      </header>

      {/* Tab 1: Class Management View */}
      {activeTab === 'classes' && (
        <div className="space-y-[2.5rem] animate-fadeIn">
          <SearchBar />

          <ContinueLearningBanner
            item={continueItem}
            recentItems={recentItems}
            onSelectTrack={selectActiveTrack}
            loading={continueLoading}
          />

          {/* Classes Section */}
          <section className="space-y-[1.5rem]" aria-labelledby="curriculum-classes-heading">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2
                  id="curriculum-classes-heading"
                  className="font-heading text-xl md:text-2xl font-bold tracking-tight text-foreground"
                >
                  Curriculum Classes
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Browse structured technical domains, algorithms, and system design tracks
                </p>
              </div>

              {canEdit && classes.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsOrganizeMode(!isOrganizeMode)}
                  aria-pressed={isOrganizeMode}
                  className={isOrganizeMode ? 'lms-btn-primary' : 'lms-btn-secondary'}
                >
                  <Icon name="ArrowsUpDownIcon" size={15} />
                  <span>{isOrganizeMode ? 'Done Organizing' : 'Organize Classes'}</span>
                </button>
              )}
            </div>

            {/* Classes Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="lms-panel min-h-[260px] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                {classes.map((cls, idx) => (
                  <ClassCard
                    key={cls.id}
                    lmsClass={cls}
                    onEdit={canEdit ? (c) => setClassToEdit(c) : undefined}
                    onDelete={canEdit ? (c) => setClassToDelete(c) : undefined}
                    isOrganizeMode={isOrganizeMode}
                    orderIndex={idx}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < classes.length - 1}
                    onMoveLeft={() => handleMoveClass(idx, 'left')}
                    onMoveRight={() => handleMoveClass(idx, 'right')}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: Instructor Management View */}
      {activeTab === 'instructors' && (
        <InstructorManagementTab classes={classes} />
      )}

      {/* Inline Create Class Modal */}
      <CreateClassModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => loadData()}
      />

      {/* Inline Edit Class Modal */}
      <EditClassModal
        isOpen={!!classToEdit}
        lmsClass={classToEdit}
        onClose={() => setClassToEdit(null)}
        onUpdated={() => loadData()}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!classToDelete}
        title="Delete Class"
        message={`Are you sure you want to delete "${classToDelete?.name}"? All nested subjects and lessons will also be removed.`}
        confirmLabel="Delete Class"
        isDestructive={true}
        onConfirm={handleDeleteClass}
        onCancel={() => setClassToDelete(null)}
      />
    </div>
  );
}
