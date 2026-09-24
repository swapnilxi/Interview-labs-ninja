'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from './services/lmsService';
import type { ContinueLearningItem, LmsClass } from './types';
import SearchBar from './components/SearchBar';
import ContinueLearningBanner from './components/ContinueLearningBanner';
import ClassCard from './components/ClassCard';
import CreateClassModal from './components/CreateClassModal';
import EditClassModal from './components/EditClassModal';
import ConfirmDialog from './components/ConfirmDialog';

export default function LmsHomeModule() {
  const [classes, setClasses] = useState<LmsClass[]>([]);
  const [continueItem, setContinueItem] = useState<ContinueLearningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [continueLoading, setContinueLoading] = useState(true);

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

  const loadContinueLearning = async () => {
    setContinueLoading(true);
    try {
      const cont = await lmsService.getContinueLearning();
      setContinueItem(cont);
    } catch (err) {
      console.error('Failed to load continue learning item', err);
    } finally {
      setContinueLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadContinueLearning();
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12">
      {/* Hero Section: ByteByteGo / NeetCode modern style */}
      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <Icon name="SparklesIcon" size={14} />
            <span>AI-Powered Curriculum</span>
          </div>

          <h1 className="font-heading text-3xl md:text-5xl font-extrabold tracking-tight text-foreground">
            AI Learning Platform
          </h1>

          <p className="text-base text-muted-foreground font-body max-w-2xl leading-relaxed">
            Generate, organize, and consume interactive engineering lessons. Transform complex topics into standalone, structured modules.
          </p>
        </div>

        {/* Global Action CTAs */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm"
          >
            <Icon name="PlusIcon" size={15} />
            <span>New Class</span>
          </button>

          <Link
            href="/ai-lms/generate"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/25 hover:bg-primary/90 transition-all hover:scale-102"
          >
            <Icon name="SparklesIcon" size={16} />
            <span>Generate Lesson</span>
          </Link>
        </div>
      </div>

      {/* Scannable Search Bar */}
      <div className="flex justify-center">
        <SearchBar />
      </div>

      {/* Continue Learning Experience */}
      {continueItem && (
        <section className="space-y-3">
          <ContinueLearningBanner item={continueItem} loading={continueLoading} />
        </section>
      )}

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

          <div className="flex items-center gap-3">
            {classes.length > 1 && (
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

            {/* Aggregate counts */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {classes.length} classes
              </span>
              <span>•</span>
              <span>{totalSubjects} subjects</span>
              <span>•</span>
              <span>{totalLessons} lessons</span>
            </div>
          </div>
        </div>

        {/* Classes Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-48 rounded-2xl border border-border bg-card/60 p-6 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {classes.map((cls, idx) => (
              <ClassCard
                key={cls.id}
                lmsClass={cls}
                onEdit={(c) => setClassToEdit(c)}
                onDelete={(c) => setClassToDelete(c)}
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
