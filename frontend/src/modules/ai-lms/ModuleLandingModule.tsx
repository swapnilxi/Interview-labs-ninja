'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/ui/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from './context/LmsViewModeContext';
import { lmsService } from './services/lmsService';
import type { LandingEditorApi, LmsModuleLanding } from './types';
import LmsHtmlFrame from './components/LmsHtmlFrame';
import LandingEditorPanel from './components/LandingEditorPanel';
import { useDevContentRefresh } from './utils/useDevContentRefresh';

/**
 * Renders the AI LMS module-root landing page (frontend/src/modules/ai-lms/classes/
 * landingpage.html): the home/intro page for the whole module, not tied to any one
 * class. Edit it in the IDE and it refreshes here (dev), while its lms:auto regions
 * keep the list of classes and their counts current. Mirrors ClassLandingModule.
 */
export default function ModuleLandingModule() {
  const { canEdit: canEditReal } = useAuth();
  const { isPreviewingAsStudent } = useLmsViewMode();
  const canEdit = canEditReal && !isPreviewingAsStudent;
  const [landing, setLanding] = useState<LmsModuleLanding | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    lmsService
      .getModuleLanding()
      .then((data) => {
        setLanding(data);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'The AI LMS landing page is unavailable.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useDevContentRefresh({
    enabled: !!landing,
    currentHash: landing?.hash,
    check: () => lmsService.getModuleLandingStatus(),
    onChange: load,
  });

  const editorApi: LandingEditorApi<LmsModuleLanding> = useMemo(
    () => ({
      listSections: () => lmsService.listModuleLandingSections(),
      saveLanding: (html, baseHash) => lmsService.saveModuleLanding(html, baseHash),
      addSection: (payload) => lmsService.addModuleLandingSection(payload),
      updateSection: (id, payload) => lmsService.updateModuleLandingSection(id, payload),
      deleteSection: (id) => lmsService.deleteModuleLandingSection(id),
      landingAi: (instruction, mode, placement) => lmsService.moduleLandingAi(instruction, mode, placement),
    }),
    []
  );

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-2 border-b border-border bg-card text-xs flex-shrink-0">
        <BackButton href="/ai-lms" label="Back to AI LMS" className="-ml-2.5" />
        {landing?.file_sync && (
          <span
            className="hidden md:inline min-w-0 truncate text-muted-foreground"
            title="Edit this file in your IDE; the page refreshes when you save"
          >
            Edit:{' '}
            <code className="font-mono">
              frontend/src/modules/ai-lms/classes/{landing.file_path}
            </code>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit && landing && (
            <button
              type="button"
              data-testid="landing-edit-toggle"
              onClick={() => {
                setEditing((v) => !v);
                setPreviewHtml(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary font-medium text-xs hover:bg-primary/15 transition-colors"
            >
              {editing ? 'Done editing' : 'Edit page'}
            </button>
          )}
        </div>
      </div>
      {error && !landing ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : landing ? (
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <LmsHtmlFrame
            html={previewHtml ?? landing.html}
            filePath={landing.file_path}
            classSlug=""
            title="AI LMS landing page"
            docKey="ai-lms-home"
            className="w-full flex-1 border-0 bg-background"
          />
          {canEdit && editing && (
            <LandingEditorPanel
              landing={landing}
              api={editorApi}
              onSaved={(saved) => setLanding(saved)}
              onPreview={setPreviewHtml}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 animate-pulse bg-muted/40" />
      )}
    </div>
  );
}
