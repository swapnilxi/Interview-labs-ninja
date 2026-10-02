'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type {
  BreakdownResult,
  DeeperExplanationResult,
  EasyReadResult,
  LmsClass,
  LmsLesson,
  LmsNavigation,
  LmsSubject,
  VisualExplanationResult,
} from '../types';
import ConfirmDialog from './ConfirmDialog';
import VoiceAssistant from './VoiceAssistant';
import { withVisibilitySafetyNet } from '../utils/lessonVisibilitySafetyNet';

interface LessonViewerProps {
  lesson: LmsLesson;
  navigation: LmsNavigation | null;
  lmsClass: LmsClass;
  subject?: LmsSubject | null;
}

import VisualizerPanel from './VisualizerPanel';
import EasyReadPanel from './EasyReadPanel';
import SwipeReadPanel from './SwipeReadPanel';
import DeeperExplanationPanel from './DeeperExplanationPanel';
import LessonHtmlEditor, { type LessonHtmlEditorHandle } from './LessonHtmlEditor';
import UpdateLessonPanel, { type LessonRevision } from './UpdateLessonPanel';
import BreakdownPanel from './BreakdownPanel';

type ViewMode = 'read' | 'easy' | 'visualize' | 'swipe' | 'deeper' | 'breakdown' | 'update';

const VIEW_MODES: { mode: ViewMode; label: string; icon: string; title?: string }[] = [
  { mode: 'read', label: 'Read', icon: 'BookOpenIcon' },
  {
    mode: 'easy',
    label: 'Easy Read',
    icon: 'DocumentTextIcon',
    title: 'A lighter, less text-heavy rewrite of this lesson',
  },
  { mode: 'visualize', label: 'Visualize', icon: 'SparklesIcon' },
  {
    mode: 'swipe',
    label: 'Swipe',
    icon: 'RectangleStackIcon',
    title: 'Swipe through this lesson as bite-sized cards',
  },
  {
    mode: 'deeper',
    label: 'Explain Deeper',
    icon: 'ArrowTrendingUpIcon',
    title: 'Extend this lesson with edge cases, mechanics, and trade-offs it skipped',
  },
  {
    mode: 'breakdown',
    label: 'Breakdown',
    icon: 'Squares2X2Icon',
    title: 'Condense this lesson into small, high-impact chunks',
  },
  {
    mode: 'update',
    label: 'Update',
    icon: 'PencilSquareIcon',
    title: 'Reprompt the AI to change or extend this lesson',
  },
];

export default function LessonViewer({
  lesson: initialLesson,
  navigation,
  lmsClass,
  subject,
}: LessonViewerProps) {
  const router = useRouter();
  const [currentLesson, setCurrentLesson] = useState<LmsLesson>(initialLesson);
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  // Lifted out of VisualizerPanel/EasyReadPanel so the generated content survives a
  // mode toggle -- switching tabs mounts/unmounts those panels below, which used to
  // reset and silently re-trigger a fresh (costly) AI call every time.
  const [visual, setVisual] = useState<VisualExplanationResult | null>(null);
  const [easyRead, setEasyRead] = useState<EasyReadResult | null>(null);
  const [deeper, setDeeper] = useState<DeeperExplanationResult | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null);
  const [revision, setRevision] = useState<LessonRevision | null>(null);
  // In-place editing (title / read time / summary / WYSIWYG body) -- no popup.
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editReadTime, setEditReadTime] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editorRef = useRef<LessonHtmlEditorHandle>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setCurrentLesson(initialLesson);
  }, [initialLesson]);

  useEffect(() => {
    setVisual(null);
    setEasyRead(null);
    setDeeper(null);
    setBreakdown(null);
    setRevision(null);
  }, [currentLesson.id]);

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

  // Keyboard shortcuts: arrow keys move between lessons (Read mode only -- Swipe mode
  // already binds its own arrow-key card navigation, so this would double-fire there),
  // Escape exits full screen. Skipped while the user is typing anywhere.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (isTyping) return;

      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      if (viewMode !== 'read') return;
      if (e.key === 'ArrowLeft' && prevHref) {
        router.push(prevHref);
      } else if (e.key === 'ArrowRight' && nextHref) {
        router.push(nextHref);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevHref, nextHref, isFullscreen, viewMode, router]);

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

  const startEditing = () => {
    setEditTitle(currentLesson.title);
    setEditSummary(currentLesson.summary || '');
    setEditReadTime(currentLesson.read_time_minutes || 5);
    setEditError(null);
    setViewMode('read');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setEditError('Title is required.');
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await lmsService.updateLesson(currentLesson.id, {
        title: editTitle.trim(),
        summary: editSummary.trim(),
        read_time_minutes: Math.max(1, Math.round(editReadTime) || 1),
        generated_html: editorRef.current?.getHtml(),
      });
      setCurrentLesson(updated);
      setEasyRead(null);
      setDeeper(null);
      setBreakdown(null);
      setIsEditing(false);
      router.refresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
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

  const progressPct = navigation
    ? Math.round((navigation.current_index / Math.max(navigation.total_lessons, 1)) * 100)
    : null;

  const safeLessonHtml = useMemo(
    () => withVisibilitySafetyNet(currentLesson.generated_html),
    [currentLesson.generated_html]
  );

  return (
    <>
      <div
        className={`flex flex-col ${
          isFullscreen
            ? 'fixed inset-0 z-[250] bg-background p-4 sm:p-6 overflow-y-auto'
            : 'w-full max-w-6xl mx-auto min-h-[calc(100vh-100px)] py-4 px-4 sm:px-6'
        }`}
      >
        {/* Header Card: Breadcrumbs, Title, Progress, Mode Switcher, Actions */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-5 mb-4 flex-shrink-0 space-y-4">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <Link
              href="/ai-lms"
              className="flex items-center gap-1 hover:text-foreground transition-colors flex-shrink-0"
            >
              <Icon name="HomeIcon" size={12} />
              <span>AI LMS</span>
            </Link>
            <Icon name="ChevronRightIcon" size={10} className="flex-shrink-0 opacity-60" />
            <Link
              href={`/ai-lms/classes/${lmsClass.slug}`}
              className="hover:text-foreground transition-colors font-medium truncate max-w-[10rem]"
            >
              {lmsClass.name}
            </Link>
            {subject && (
              <>
                <Icon name="ChevronRightIcon" size={10} className="flex-shrink-0 opacity-60" />
                <Link
                  href={`/ai-lms/classes/${lmsClass.slug}/${subject.slug}`}
                  className="hover:text-foreground transition-colors font-medium truncate max-w-[10rem]"
                >
                  {subject.name}
                </Link>
              </>
            )}
          </div>

          {/* Title + progress */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 flex-wrap">
              {isEditing ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  aria-label="Lesson title"
                  className="flex-1 min-w-0 font-heading text-xl sm:text-2xl font-bold text-foreground leading-snug bg-background border border-primary/40 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground leading-snug break-words">
                  {currentLesson.title}
                </h1>
              )}
              {navigation && (
                <span className="mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                  Lesson {navigation.current_index} of {navigation.total_lessons}
                </span>
              )}
            </div>
            {isEditing && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
                <textarea
                  rows={2}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder="Short summary"
                  aria-label="Lesson summary"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-primary/40 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Est. read</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={editReadTime}
                    onChange={(e) => setEditReadTime(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded-lg border border-primary/40 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span>min</span>
                </label>
              </div>
            )}
            {editError && <div className="text-xs text-destructive">{editError}</div>}
            {progressPct !== null && navigation && navigation.total_lessons > 1 && (
              <div className="h-1.5 w-full max-w-xs rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Mode Switcher + Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            {/* [ Read ] | [ Easy Read ] | [ ✨ Visualize ] | [ Swipe ] | [ Explain Deeper ] | [ Breakdown ] Mode Switcher */}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border w-full sm:w-auto">
              {VIEW_MODES.map(({ mode, label, icon, title }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  title={title}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    viewMode === mode
                      ? `bg-card shadow-sm border border-border ${mode === 'visualize' ? 'text-primary' : 'text-foreground'}`
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon
                    name={icon}
                    size={14}
                    className={mode === 'visualize' ? 'text-primary' : undefined}
                  />
                  <span>{mode === 'visualize' ? '✨ Visualize' : label}</span>
                </button>
              ))}
            </div>

            {/* Action Toolbar */}
            <div className="flex items-center gap-1.5 justify-end flex-wrap">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                title="Download standalone HTML document"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm disabled:opacity-50"
              >
                <Icon name="ArrowDownTrayIcon" size={14} />
                <span className="hidden sm:inline">
                  {isDownloading ? 'Downloading...' : 'Download'}
                </span>
              </button>

              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm disabled:opacity-50"
                  >
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Icon name="CheckIcon" size={14} />
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  title="Edit title, summary, read time and lesson content on the page"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm"
                >
                  <Icon name="PencilIcon" size={14} />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen viewer'}
                aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon
                  name={isFullscreen ? 'ArrowsPointingInIcon' : 'ArrowsPointingOutIcon'}
                  size={16}
                />
              </button>

              <div className="w-px h-5 bg-border mx-0.5" />

              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(true)}
                title="Delete lesson"
                aria-label="Delete lesson"
                className="p-1.5 rounded-lg border border-border bg-card hover:bg-destructive/10 hover:border-destructive/30 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Icon name="TrashIcon" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Switching: Reader vs Easy Read vs Interactive Visualizer vs Swipe vs Explain Deeper vs Breakdown */}
        {isEditing ? (
          <LessonHtmlEditor ref={editorRef} html={currentLesson.generated_html} />
        ) : viewMode === 'read' ? (
          <div className="flex-1 w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden relative min-h-[70vh] sm:min-h-[620px] flex flex-col">
            <iframe
              srcDoc={safeLessonHtml}
              title={currentLesson.title}
              sandbox="allow-scripts"
              className="w-full h-full flex-1 border-0"
            />
          </div>
        ) : viewMode === 'easy' ? (
          <div className="flex-1 w-full">
            <EasyReadPanel
              lesson={currentLesson}
              easyRead={easyRead}
              onEasyReadChange={setEasyRead}
              onSwitchToRead={() => setViewMode('read')}
            />
          </div>
        ) : viewMode === 'visualize' ? (
          <div className="flex-1 w-full">
            <VisualizerPanel
              lesson={currentLesson}
              visual={visual}
              onVisualChange={setVisual}
              onVisualEmbedded={handleVisualEmbedded}
              onSwitchToRead={() => setViewMode('read')}
            />
          </div>
        ) : viewMode === 'swipe' ? (
          <SwipeReadPanel lesson={currentLesson} onExit={() => setViewMode('read')} />
        ) : viewMode === 'deeper' ? (
          <div className="flex-1 w-full">
            <DeeperExplanationPanel
              lesson={currentLesson}
              deeper={deeper}
              onDeeperChange={setDeeper}
              onSwitchToRead={() => setViewMode('read')}
            />
          </div>
        ) : viewMode === 'update' ? (
          <div className="flex-1 w-full">
            <UpdateLessonPanel
              lesson={currentLesson}
              revision={revision}
              onRevisionChange={setRevision}
              onApplied={(updated) => {
                setCurrentLesson(updated);
                setEasyRead(null);
                setDeeper(null);
                setBreakdown(null);
                setViewMode('read');
              }}
            />
          </div>
        ) : (
          <div className="flex-1 w-full">
            <BreakdownPanel
              lesson={currentLesson}
              breakdown={breakdown}
              onBreakdownChange={setBreakdown}
              onSwitchToRead={() => setViewMode('read')}
            />
          </div>
        )}

        {/* Bottom Navigation Bar: Prev & Next within current subject */}
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-stretch sm:items-center gap-3 sm:justify-between flex-shrink-0">
          {prevHref ? (
            <Link
              href={prevHref}
              className="order-1 flex-1 sm:flex-none sm:max-w-xs flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm text-foreground transition-all group min-w-0"
            >
              <Icon
                name="ChevronLeftIcon"
                size={18}
                className="flex-shrink-0 group-hover:-translate-x-1 transition-transform text-primary"
              />
              <div className="text-left min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Previous
                </div>
                <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                  {navigation?.previous?.title}
                </div>
              </div>
            </Link>
          ) : (
            <div className="hidden sm:block sm:w-24 order-1" />
          )}

          <Link
            href={backHref}
            className="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          >
            <Icon name="Squares2X2Icon" size={14} />
            <span>{subject ? subject.name : lmsClass.name} Overview</span>
          </Link>

          {nextHref ? (
            <Link
              href={nextHref}
              className="order-2 sm:order-3 flex-1 sm:flex-none sm:max-w-xs flex items-center justify-end gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm text-foreground transition-all group text-right min-w-0"
            >
              <div className="text-right min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Next
                </div>
                <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                  {navigation?.next?.title}
                </div>
              </div>
              <Icon
                name="ChevronRightIcon"
                size={18}
                className="flex-shrink-0 group-hover:translate-x-1 transition-transform text-primary"
              />
            </Link>
          ) : (
            <div className="hidden sm:block sm:w-24 order-3" />
          )}
        </div>
      </div>

      <VoiceAssistant
        lessonTitle={currentLesson.title}
        lessonContentHtml={currentLesson.generated_html || ''}
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
