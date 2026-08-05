'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from './store/resumeStore';
import { openProfileEditor } from './profileEditorStore';
import type { ResumeVersion } from './types';

function timeAgo(value: string): string {
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function VersionTimeline({ masterId, open, onClose }: { masterId: string; open: boolean; onClose: () => void }) {
  const snapshot = useResumeStore((s) => s.snapshot);
  const restore = useResumeStore((s) => s.restore);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setVersions(await careerService.listVersions(masterId));
    } finally {
      setLoading(false);
    }
  }, [masterId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleSnapshot = async () => {
    setBusy(true);
    const label = window.prompt('Name this checkpoint (optional):') ?? undefined;
    const v = await snapshot(label || undefined);
    if (v) await refresh();
    setBusy(false);
  };

  const handleRestore = async (versionId: string) => {
    if (!window.confirm('Restore this version into your working draft? Current unsaved edits will be overwritten.')) return;
    await restore(versionId);
    onClose();
  };

  const handleClone = async (versionId: string) => {
    const clone = await careerService.cloneVersion(versionId);
    openProfileEditor(clone.id);
  };

  const handleBranch = async (versionId: string) => {
    const name = window.prompt('Branch name (e.g. "faang", "startup"):');
    if (!name) return;
    const branch = await careerService.branchVersion(versionId, name);
    openProfileEditor(branch.id);
  };

  return (
    <>
      <div className={`fixed inset-0 z-[240] bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} />
      <aside className={`fixed top-0 right-0 z-[250] h-full w-[380px] max-w-[90vw] bg-card border-l border-border shadow-xl flex flex-col transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 h-[56px] border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="ClockIcon" size={18} className="text-primary" />
            <span className="font-heading text-sm font-semibold text-foreground">Version History</span>
          </div>
          <button onClick={onClose} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <div className="p-3 border-b border-border flex-shrink-0">
          <button onClick={handleSnapshot} disabled={busy} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
            <Icon name="BookmarkIcon" size={16} /> Save current as version
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-clean p-3 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
          ) : versions.length === 0 ? (
            <div className="text-center py-10">
              <Icon name="ClockIcon" size={28} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No checkpoints yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Save a version to snapshot your resume.</p>
            </div>
          ) : (
            versions.map((v, i) => (
              <div key={v.id} className="rounded-lg border border-border p-3 hover:border-primary/40 transition-smooth">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{v.label || v.branch_name || `Checkpoint ${versions.length - i}`}</span>
                </div>
                <p className="text-[11px] text-muted-foreground ml-4">{timeAgo(v.created_at)} · {v.section_count ?? 0} sections · {v.source}</p>
                <div className="flex items-center gap-1 mt-2 ml-4">
                  <button onClick={() => handleRestore(v.id)} className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted inline-flex items-center gap-1"><Icon name="ArrowUturnLeftIcon" size={12} /> Restore</button>
                  <button onClick={() => handleClone(v.id)} className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted inline-flex items-center gap-1"><Icon name="DocumentDuplicateIcon" size={12} /> Clone</button>
                  <button onClick={() => handleBranch(v.id)} className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted inline-flex items-center gap-1"><Icon name="ArrowsRightLeftIcon" size={12} /> Branch</button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
