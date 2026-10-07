'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { lmsService } from './services/lmsService';
import type { LmsLanding } from './types';
import EmptyState from './components/EmptyState';
import ExportClassButton from './components/ExportClassButton';
import LmsHtmlFrame from './components/LmsHtmlFrame';
import LandingEditorPanel from './components/LandingEditorPanel';
import { useDevContentRefresh } from './utils/useDevContentRefresh';

interface ClassLandingModuleProps {
  classSlug: string;
}

/**
 * Renders the class's landingpage.html (frontend/src/modules/ai-lms/classes/<class>/).
 * The file is the page: edit it in the IDE and it refreshes here (dev), while its
 * lms:auto regions keep the subject / project / lesson lists current.
 */
export default function ClassLandingModule({ classSlug }: ClassLandingModuleProps) {
  const { canEdit } = useAuth();
  const [landing, setLanding] = useState<LmsLanding | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    lmsService
      .getLanding(classSlug)
      .then((data) => {
        setLanding(data);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Class not found.'));
  }, [classSlug]);

  useEffect(() => {
    load();
  }, [load]);

  useDevContentRefresh({
    enabled: !!landing,
    currentHash: landing?.hash,
    check: () => lmsService.getLandingStatus(classSlug),
    onChange: load,
  });

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
        <EmptyState
          icon="ExclamationTriangleIcon"
          title="Landing page unavailable"
          description={error}
          primaryAction={{ label: 'Return to LMS Home', href: '/ai-lms', icon: 'ArrowLeftIcon' }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-2 border-b border-border bg-card text-xs flex-shrink-0">
        <Link
          href={`/ai-lms/classes/${classSlug}`}
          className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          <span>Back to class</span>
        </Link>
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
          <ExportClassButton
            classSlug={classSlug}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors disabled:opacity-60"
          />
        </div>
      </div>
      {landing ? (
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <LmsHtmlFrame
          html={previewHtml ?? landing.html}
          filePath={landing.file_path}
          classSlug={landing.class_slug}
          title={`${landing.class_slug} landing page`}
          docKey={landing.class_id}
          className="w-full flex-1 border-0 bg-background"
        />
        {canEdit && editing && (
          <LandingEditorPanel
            classSlug={classSlug}
            landing={landing}
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
