'use client';

import { useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { VideoScript } from '@/lib/services/videoService';
import AiError from '@/modules/labs/common/AiError';
import Markdown from '@/modules/labs/common/Markdown';

/**
 * The page's AI-written video script, inline under the "Videos and links" header (no modal): a card with the same glow edge
 * as the link cards, a header with Copy, Download .md and Regenerate, and the script as markdown. It is collapsed when a saved
 * script is loaded and open while one is being written or has just been; a page load never writes one.
 *
 * Presentational: LabPageVideos owns the state and the call.
 */

export type ScriptStatus = 'idle' | 'generating' | 'error';

const BTN =
  'inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[2.25rem]';

/** "2026-11-18 07:38:11" (server, UTC) -> "18 Nov 2026" in the viewer's locale. */
function updatedOn(serverTime: string): string {
  const d = new Date(serverTime.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Two Pointers — Sliding window" -> "two-pointers-sliding-window" */
function fileStem(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || 'topic';
}

export default function VideoScriptPanel({
  script,
  status,
  error,
  open,
  onToggle,
  onRegenerate,
  pageName,
}: {
  script: VideoScript | null;
  status: ScriptStatus;
  error: string | null;
  open: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  /** The page's name, for the downloaded file. */
  pageName: string;
}) {
  const bodyId = useId();
  const [copyNote, setCopyNote] = useState('');
  const generating = status === 'generating';

  if (!script && status === 'idle') return null;

  const copy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.content);
      setCopyNote('Copied');
    } catch {
      setCopyNote('Copy failed');
    }
    window.setTimeout(() => setCopyNote(''), 1800);
  };

  const download = () => {
    if (!script) return;
    const blob = new Blob([script.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileStem(pageName)}-video-script.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const when = script ? updatedOn(script.updatedAt) : '';

  return (
    <section
      aria-label="Video script"
      className="lab-edge overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="todo-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left"
        >
          <Icon
            name="ChevronDownIcon"
            size={16}
            className={`flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">Video script</span>
            <span className="block text-xs text-muted-foreground">
              {generating
                ? 'Writing the script…'
                : when
                  ? `Written for this page, ${when}`
                  : 'Written for this page'}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {script && (
            <>
              <button
                type="button"
                className={BTN}
                onClick={() => void copy()}
                disabled={generating}
              >
                <Icon name="ClipboardDocumentIcon" size={14} />
                <span>{copyNote || 'Copy'}</span>
              </button>
              <button type="button" className={BTN} onClick={download} disabled={generating}>
                <Icon name="ArrowDownTrayIcon" size={14} />
                <span>Download .md</span>
              </button>
            </>
          )}
          <button type="button" className={BTN} onClick={onRegenerate} disabled={generating}>
            <Icon name="ArrowPathIcon" size={14} className={generating ? 'animate-spin' : ''} />
            <span>{generating ? 'Writing…' : 'Regenerate'}</span>
          </button>
        </div>
      </div>

      {error && !generating && (
        <div className="border-t border-border px-3 py-2.5">
          <AiError message={error} />
        </div>
      )}

      {open && (
        <div id={bodyId} className="border-t border-border p-3 sm:p-4">
          {generating && (
            <p
              role="status"
              className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <Icon
                name="ArrowPathIcon"
                size={16}
                className="animate-spin motion-reduce:animate-none"
              />
              Writing the script…
            </p>
          )}
          {script ? (
            <div className={generating ? 'opacity-50' : ''}>
              <Markdown content={script.content} />
            </div>
          ) : (
            !generating && <p className="text-sm text-muted-foreground">No script yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
