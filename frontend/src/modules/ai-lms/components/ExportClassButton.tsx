'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';

interface ExportClassButtonProps {
  classSlug: string;
  className?: string;
}

/** Downloads the class as a deployable zip: a static site with vercel.json and a Cloud Run Dockerfile. */
export default function ExportClassButton({ classSlug, className }: ExportClassButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      await lmsService.exportClass(classSlug);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      title={
        error ??
        'Download this class as a static site: deploy it to Vercel, or build its Dockerfile for Google Cloud Run'
      }
      className={
        className ??
        'inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-sm disabled:opacity-60'
      }
    >
      <Icon name={error ? 'ExclamationTriangleIcon' : 'ArrowDownTrayIcon'} size={14} />
      <span>{isExporting ? 'Exporting…' : error ? 'Export failed — retry' : 'Export site'}</span>
    </button>
  );
}
