'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';

interface RagIndexPanelProps {
  subjectId: string;
  /** "README / project context" or "AI generation guidance context" -- used in copy. */
  fieldLabel: string;
}

/**
 * Retrieval-augmented generation status + controls for one Project/Subject's
 * context. Independent of ContextSummaryPanel: the summary carries the big
 * picture on every generation call; this index lets generation additionally pull
 * the specific, grounded excerpt each module/lesson actually needs. Either, both,
 * or neither can be active for a given row -- they don't conflict.
 */
export default function RagIndexPanel({ subjectId, fieldLabel }: RagIndexPanelProps) {
  const [chunkCount, setChunkCount] = useState<number | null>(null); // null while loading
  const [isBuilding, setIsBuilding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await lmsService.getRagIndexStatus(subjectId);
      setChunkCount(res.rag_chunk_count);
    } catch {
      setChunkCount(0);
    }
  }, [subjectId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleBuild = async () => {
    setIsBuilding(true);
    setError(null);
    try {
      const res = await lmsService.buildRagIndex(subjectId);
      setChunkCount(res.rag_chunk_count);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to build search index.');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setError(null);
    try {
      await lmsService.clearRagIndex(subjectId);
      setChunkCount(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear search index.');
    } finally {
      setIsClearing(false);
    }
  };

  if (chunkCount === null) return null; // avoid a flash of "not indexed" while loading

  const isIndexed = chunkCount > 0;

  return (
    <div
      className={`mt-2 rounded-xl border p-3 text-xs ${
        isIndexed ? 'border-blue-500/25 bg-blue-500/5' : 'border-border bg-muted/20'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-1.5">
          <Icon
            name="CircleStackIcon"
            size={13}
            className={`mt-0.5 flex-shrink-0 ${isIndexed ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}
          />
          {isIndexed ? (
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              Search Index Active -- {chunkCount} chunk{chunkCount === 1 ? '' : 's'} indexed. Generation
              pulls the most relevant excerpts for each module/lesson automatically.
            </span>
          ) : (
            <span className="text-muted-foreground">
              No search index yet -- build one to ground generation in precise excerpts from this{' '}
              {fieldLabel}, on top of the summary above.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isIndexed && (
            <button
              type="button"
              disabled={isClearing || isBuilding}
              onClick={handleClear}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-muted-foreground text-[11px] font-medium hover:text-destructive hover:border-destructive/40 disabled:opacity-50 transition-colors"
            >
              {isClearing ? 'Clearing...' : 'Clear'}
            </button>
          )}
          <button
            type="button"
            disabled={isBuilding || isClearing}
            onClick={handleBuild}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-medium hover:bg-blue-500/15 disabled:opacity-50 transition-colors"
          >
            {isBuilding ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <span>Indexing...</span>
              </>
            ) : (
              <>
                <Icon name="MagnifyingGlassIcon" size={12} />
                <span>{isIndexed ? 'Rebuild Index' : 'Build Search Index'}</span>
              </>
            )}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
