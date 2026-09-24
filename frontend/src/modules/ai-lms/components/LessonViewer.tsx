'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsLesson, LmsNavigation, LmsSubject } from '../types';
import ManualLessonModal from './ManualLessonModal';
import ConfirmDialog from './ConfirmDialog';
import VoiceAssistant from './VoiceAssistant';

interface LessonViewerProps {
  lesson: LmsLesson;
  navigation: LmsNavigation | null;
  lmsClass: LmsClass;
  subject?: LmsSubject | null;
}

import VisualizerPanel from './VisualizerPanel';

export default function LessonViewer({
  lesson: initialLesson,
  navigation,
  lmsClass,
  subject,
}: LessonViewerProps) {
  const router = useRouter();
  const [currentLesson, setCurrentLesson] = useState<LmsLesson>(initialLesson);
  const [viewMode, setViewMode] = useState<'read' | 'visualize'>('read');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setCurrentLesson(initialLesson);
  }, [initialLesson]);

  const backHref = subject
    ? `/ai-lms/classes/${lmsClass.slug}/${subject.slug}`
    : `/ai-lms/classes/${lmsClass.slug}`;

  const prevHref = navigation?.previous
    ? subject
      ? `/ai-lms/classes/${lmsClass.slug}/${subject.slug}/${navigation.previous.slug}`
      : `/ai-lms/classes/${lmsClass.slug}/lesson/${navigation.previous.slug}`
    : null;

  const nextHref = navigation?.next
    ? subject
      ? `/ai-lms/classes/${lmsClass.slug}/${subject.slug}/${navigation.next.slug}`
      : `/ai-lms/classes/${lmsClass.slug}/lesson/${navigation.next.slug}`
    : null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await lmsService.downloadLessonHtml(currentLesson);
    } catch (err) {
      console.error('Failed to download lesson HTML', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await lmsService.deleteLesson(currentLesson.id);
      router.push(backHref);
    } catch (err) {
      console.error('Failed to delete lesson', err);
    }
  };

  const handleVisualEmbedded = async () => {
    try {
      const refreshed = await lmsService.getLesson(currentLesson.id);
      setCurrentLesson(refreshed);
    } catch {
      // Ignore
    }
  };

  return (
    <>
      <div
        className={`flex flex-col ${
          isFullscreen
            ? 'fixed inset-0 z-[250] bg-background'
            : 'w-full max-w-6xl mx-auto min-h-[calc(100vh-100px)] py-4 px-4 sm:px-6'
        }`}
      >
        {/* Top Control Bar: Breadcrumbs, Status, Mode Switcher, Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border mb-4 flex-shrink-0">
          {/* Breadcrumbs & Title */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
              {subject && (
                <>
                  <span>/</span>
                  <Link
                    href={`/ai-lms/classes/${lmsClass.slug}/${subject.slug}`}
                    className="hover:text-foreground transition-colors font-medium"
                  >
                    {subject.name}
                  </Link>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h1 className="font-heading text-lg sm:text-xl font-bold text-foreground truncate max-w-lg">
                {currentLesson.title}
              </h1>
              {navigation && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                  Lesson {navigation.current_index} of {navigation.total_lessons}
                </span>
              )}
            </div>
          </div>

          {/* Center Mode Switcher + Action Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* [ Read ] | [ ✨ Visualize ] Mode Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border">
              <button
                type="button"
                onClick={() => setViewMode('read')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'read'
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="BookOpenIcon" size={14} />
                <span>Read</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('visualize')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'visualize'
                    ? 'bg-card text-primary shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="SparklesIcon" size={14} className="text-primary" />
                <span>✨ Visualize</span>
              </button>
            </div>

            {/* Action Toolbar */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                title="Download standalone HTML document"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm"
              >
                <Icon name="ArrowDownTrayIcon" size={14} />
                <span className="hidden md:inline">{isDownloading ? 'Downloading...' : 'Download HTML'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit lesson content"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm"
              >
                <Icon name="PencilIcon" size={14} />
                <span className="hidden md:inline">Edit</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title={isFullscreen ? 'Exit full screen' : 'Full screen viewer'}
                className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name={isFullscreen ? 'ArrowsPointingInIcon' : 'ArrowsPointingOutIcon'} size={16} />
              </button>

              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(true)}
                title="Delete lesson"
                className="p-1.5 rounded-lg border border-border bg-card hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
              >
                <Icon name="TrashIcon" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Switching: Reader vs Interactive Visualizer */}
        {viewMode === 'read' ? (
          <div className="flex-1 w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden relative min-h-[620px] flex flex-col">
            <iframe
              srcDoc={currentLesson.generated_html}
              title={currentLesson.title}
              sandbox="allow-scripts"
              className="w-full h-full flex-1 border-0"
            />
          </div>
        ) : (
          <div className="flex-1 w-full">
            <VisualizerPanel
              lesson={currentLesson}
              onVisualEmbedded={handleVisualEmbedded}
              onSwitchToRead={() => setViewMode('read')}
            />
          </div>
        )}

        {/* Bottom Navigation Bar: Prev & Next within current subject */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-shrink-0">
          {prevHref ? (
            <Link
              href={prevHref}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/50 text-foreground transition-all group max-w-xs"
            >
              <Icon
                name="ChevronLeftIcon"
                size={18}
                className="group-hover:-translate-x-1 transition-transform text-primary"
              />
              <div className="text-left min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Previous Lesson
                </div>
                <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                  {navigation?.previous?.title}
                </div>
              </div>
            </Link>
          ) : (
            <div className="w-24" />
          )}

          <Link
            href={backHref}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-muted"
          >
            <Icon name="Squares2X2Icon" size={14} />
            <span>{subject ? subject.name : lmsClass.name} Overview</span>
          </Link>

          {nextHref ? (
            <Link
              href={nextHref}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/50 text-foreground transition-all group max-w-xs text-right"
            >
              <div className="text-right min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Next Lesson
                </div>
                <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                  {navigation?.next?.title}
                </div>
              </div>
              <Icon
                name="ChevronRightIcon"
                size={18}
                className="group-hover:translate-x-1 transition-transform text-primary"
              />
            </Link>
          ) : (
            <div className="w-24" />
          )}
        </div>
      </div>

      <VoiceAssistant 
        lessonTitle={currentLesson.title} 
        lessonContentHtml={currentLesson.generated_html || ''} 
      />

      {/* Edit Modal */}
      <ManualLessonModal
        isOpen={isEditModalOpen}
        targetClass={lmsClass}
        targetSubject={subject}
        lessonToEdit={currentLesson}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={(updated) => {
          setIsEditModalOpen(false);
          setCurrentLesson(updated);
          router.refresh();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Lesson"
        message={`Are you sure you want to delete "${currentLesson.title}"? This action cannot be undone.`}
        confirmLabel="Delete Lesson"
        isDestructive={true}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />
    </>
  );
}
