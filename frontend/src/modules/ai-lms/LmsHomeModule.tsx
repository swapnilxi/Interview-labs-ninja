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

  const totalLessons = classes.reduce((sum, c) => sum + (c.lesson_count || 0), 0);
  const totalSubjects = classes.reduce((sum, c) => sum + (c.subject_count || 0), 0);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Compact Glassmorphic Hero & Sub-Tabs Header */}
      <div className="relative rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Header Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0 shadow-xs">
              <Icon name="SparklesIcon" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                  AI Learning Platform
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  AI LMS 2.0
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-body max-w-xl mt-0.5 line-clamp-1 sm:line-clamp-none">
                Generate, organize, and consume interactive engineering lessons. Manage curriculum classes & AI faculty personas.
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
            <Link
              href="/ai-lms/landing"
              title="About AI LMS & all classes"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground font-semibold text-xs transition-all shadow-xs"
            >
              <Icon name="InformationCircleIcon" size={14} />
              <span>About AI LMS</span>
            </Link>

            {canEdit && activeTab === 'classes' && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground font-semibold text-xs transition-all shadow-xs"
              >
                <Icon name="PlusIcon" size={14} />
                <span>New Class</span>
              </button>
            )}

            {canEdit && (
              <Link
                href="/ai-lms/generate"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:opacity-90 transition-all"
              >
                <Icon name="SparklesIcon" size={14} />
                <span>Generate Lesson</span>
              </Link>
            )}
          </div>
        </div>

        {/* Sub-Tabs Bar: | Class Management | Instructor Management | */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 w-fit">
            <button
              type="button"
              onClick={() => handleTabChange('classes')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'classes'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="AcademicCapIcon" size={15} />
              <span>Class Management</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('instructors')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'instructors'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="UserGroupIcon" size={15} />
              <span>Instructor Management</span>
            </button>
          </div>

          {activeTab === 'classes' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/60 px-3 py-1.5 rounded-xl border border-border/60 w-fit shadow-2xs">
              <span className="font-semibold text-foreground">{classes.length} classes</span>
              <span>•</span>
              <span>{totalSubjects} subjects</span>
              <span>•</span>
              <span>{totalLessons} lessons</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Class Management View */}
      {activeTab === 'classes' && (
        <div className="space-y-12 animate-fadeIn">
          {/* Scannable Search Bar */}
          <div className="flex justify-center">
            <SearchBar />
          </div>

          {/* Continue Learning Experience (Reactive & Guided) */}
          <section className="space-y-3">
            <ContinueLearningBanner
              item={continueItem}
              recentItems={recentItems}
              onSelectTrack={selectActiveTrack}
              loading={continueLoading}
            />
          </section>

          {/* Classes Section */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground">
                  Curriculum Classes
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Browse structured technical domains, algorithms, and system design tracks
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {canEdit && classes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsOrganizeMode(!isOrganizeMode)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      isOrganizeMode
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-card text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <Icon name="ArrowsUpDownIcon" size={14} />
                    <span>{isOrganizeMode ? 'Done Organizing' : 'Organize Classes'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Classes Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="min-h-[220px] rounded-2xl border border-border bg-card/60 p-[24px] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
