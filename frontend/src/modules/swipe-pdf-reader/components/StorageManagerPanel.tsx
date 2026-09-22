'use client';

/**
 * StorageManagerPanel.tsx — Local Storage Management UI for the Swipe PDF Reader.
 *
 * Features:
 * - Storage usage estimate (navigator.storage.estimate)
 * - Per-document list with sizes
 * - Delete individual / selected / all documents
 * - Confirmation modals before any deletion
 * - Automatic cleanup policy setting (Never / 30 days / 90 days)
 * - Persistent storage request button
 * - Quota exceeded warning banner
 *
 * Architecture: all IndexedDB calls go through readerDb.ts — no IDB logic here.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import * as readerDb from '../utils/readerDb';
import type { ReaderDocMeta, CleanupPolicy, StorageEstimate } from '../utils/readerDb';

interface StorageManagerPanelProps {
  onClose: () => void;
  /** Called after any delete so parent can refresh its list */
  onDataChanged?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso?: string): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StorageManagerPanel({ onClose, onDataChanged }: StorageManagerPanelProps) {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<ReaderDocMeta[]>([]);
  const [docSizes, setDocSizes] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cleanupPolicy, setCleanupPolicyState] = useState<CleanupPolicy>('never');
  const [staleDocIds, setStaleDocIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [persistRequesting, setPersistRequesting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'deleteOne'; docId: string; docName: string }
    | { kind: 'deleteSelected'; count: number }
    | { kind: 'clearAll' }
    | null
  >(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [est, isP, allDocs, policy, staleDocs] = await Promise.all([
        readerDb.getStorageEstimate(),
        readerDb.isPersisted(),
        readerDb.getAllDocumentMeta(),
        Promise.resolve(readerDb.getCleanupPolicy()),
        readerDb.getSuggestedCleanupDocs(),
      ]);

      setEstimate(est);
      setPersisted(isP);
      setDocs(allDocs);
      setCleanupPolicyState(policy);
      setStaleDocIds(new Set(staleDocs.map((d) => d.id)));

      // Load per-document size estimates concurrently (non-blocking)
      const sizeEntries = await Promise.all(
        allDocs.map(async (d) => {
          const sz = await readerDb.estimateDocumentSize(d.id);
          return [d.id, sz] as [string, number];
        })
      );
      setDocSizes(Object.fromEntries(sizeEntries));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Toast helper ─────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleDeleteOne = async (docId: string) => {
    await readerDb.deleteDocument(docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(docId); return next; });
    setConfirmAction(null);
    onDataChanged?.();
    showToast('Document deleted.');
    // Refresh estimate
    readerDb.getStorageEstimate().then(setEstimate);
  };

  const handleDeleteSelected = async () => {
    await Promise.all([...selectedIds].map((id) => readerDb.deleteDocument(id)));
    setDocs((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setConfirmAction(null);
    onDataChanged?.();
    showToast(`${selectedIds.size} documents deleted.`);
    readerDb.getStorageEstimate().then(setEstimate);
  };

  const handleClearAll = async () => {
    await readerDb.clearAllReaderData();
    setDocs([]);
    setDocSizes({});
    setSelectedIds(new Set());
    setConfirmAction(null);
    onDataChanged?.();
    showToast('All local reader data cleared.');
    readerDb.getStorageEstimate().then(setEstimate);
  };

  const handleRequestPersist = async () => {
    setPersistRequesting(true);
    try {
      const granted = await readerDb.requestPersistentStorage();
      setPersisted(granted);
      showToast(granted ? 'Persistent storage granted! Your data is protected.' : 'Persistent storage was not granted by the browser.');
    } finally {
      setPersistRequesting(false);
    }
  };

  const handleCleanupPolicyChange = (policy: CleanupPolicy) => {
    readerDb.setCleanupPolicy(policy);
    setCleanupPolicyState(policy);
    // Re-evaluate stale docs
    readerDb.getSuggestedCleanupDocs().then((staleDocs) => {
      setStaleDocIds(new Set(staleDocs.map((d) => d.id)));
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === docs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(docs.map((d) => d.id)));
    }
  };

  // ── Storage bar color ────────────────────────────────────────────────────────

  const barColor =
    (estimate?.percent ?? 0) > 85
      ? 'bg-rose-500'
      : (estimate?.percent ?? 0) > 60
      ? 'bg-amber-500'
      : 'bg-blue-500';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-sm sm:max-w-md bg-card border-l border-border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Icon name="CircleStackIcon" size={16} />
            </div>
            <h2 className="text-sm font-bold text-foreground">Local Storage</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Icon name="ArrowPathIcon" size={28} className="animate-spin text-blue-500" />
              <p className="text-xs font-medium">Analysing storage…</p>
            </div>
          ) : (
            <>
              {/* ── Storage Estimate ── */}
              <section>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Storage Usage
                </h3>
                {estimate?.available ? (
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2.5">
                    {/* Bar */}
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(estimate.percent, 100)}%` }}
                      />
                    </div>
                    {/* Numbers */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-semibold">
                        {formatBytes(estimate.used)} used
                      </span>
                      <span className="text-muted-foreground">
                        {formatBytes(estimate.quota)} quota
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{docs.length} document{docs.length !== 1 ? 's' : ''} in local library</span>
                      <span className={`font-bold ${estimate.percent > 85 ? 'text-rose-500' : estimate.percent > 60 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {estimate.percent}% used
                      </span>
                    </div>
                    {estimate.percent > 85 && (
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                        <Icon name="ExclamationTriangleIcon" size={14} className="shrink-0 mt-0.5" />
                        <p className="text-[11px] font-medium leading-snug">
                          Storage is nearly full. Delete some documents or clear all local reader data to prevent write failures.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-muted/40 border border-border text-xs text-muted-foreground">
                    Storage estimate unavailable in this browser or mode.
                    <br />
                    {docs.length} document{docs.length !== 1 ? 's' : ''} in local library.
                  </div>
                )}
              </section>

              {/* ── Persistent Storage ── */}
              <section>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Persistent Storage
                </h3>
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2.5">
                  {persisted === null ? null : persisted ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                      <Icon name="CheckCircleIcon" size={15} />
                      <span className="font-semibold">Persistent storage active</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <Icon name="InformationCircleIcon" size={14} className="shrink-0 mt-0.5 text-blue-500" />
                      <p className="leading-snug">
                        Without persistent storage, the browser may clear local data under storage pressure. Request it below to protect your library.
                      </p>
                    </div>
                  )}
                  {!persisted && (
                    <button
                      type="button"
                      onClick={handleRequestPersist}
                      disabled={persistRequesting}
                      className="w-full py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                    >
                      {persistRequesting ? (
                        <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                      ) : (
                        <Icon name="LockClosedIcon" size={13} />
                      )}
                      Request Persistent Storage
                    </button>
                  )}
                </div>
              </section>

              {/* ── Documents List ── */}
              {docs.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Local Documents
                    </h3>
                    <div className="flex items-center gap-2">
                      {selectedIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setConfirmAction({ kind: 'deleteSelected', count: selectedIds.size })}
                          className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          Delete {selectedIds.size} selected
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {selectedIds.size === docs.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {docs.map((doc) => {
                      const isSelected = selectedIds.has(doc.id);
                      const isStale = staleDocIds.has(doc.id);
                      const sizeBytes = docSizes[doc.id];

                      return (
                        <div
                          key={doc.id}
                          onClick={() => toggleSelect(doc.id)}
                          className={`group flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500/40 bg-blue-500/8'
                              : 'border-border bg-muted/20 hover:bg-muted/40'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`w-4 h-4 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground/40'}`}>
                            {isSelected && <Icon name="CheckIcon" size={9} className="text-white" />}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate leading-tight">{doc.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {/* Source badge */}
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                                    doc.source === 'cloud'
                                      ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  }`}>
                                    {doc.source === 'cloud' ? '☁ Cloud' : '📱 Local'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {doc.totalChunks} chunks
                                    {doc.totalPages ? ` · ${doc.totalPages}p` : ''}
                                  </span>
                                  {sizeBytes != null && sizeBytes > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      · {formatBytes(sizeBytes)}
                                    </span>
                                  )}
                                  {isStale && (
                                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                      Unused
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Last opened: {formatDate(doc.lastOpenedAt || doc.updatedAt)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmAction({ kind: 'deleteOne', docId: doc.id, docName: doc.name });
                            }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                            title="Delete document"
                          >
                            <Icon name="TrashIcon" size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {docs.length === 0 && !loading && (
                <div className="text-center py-10 text-muted-foreground">
                  <Icon name="CircleStackIcon" size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">No local documents stored.</p>
                </div>
              )}

              {/* ── Auto-Cleanup Policy ── */}
              <section>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
                  Automatic Cleanup
                </h3>
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-3">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Suggest cleanup for documents not opened within a set period. <strong>No data is deleted automatically</strong> — you will be asked to confirm.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['never', '30days', '90days'] as CleanupPolicy[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleCleanupPolicyChange(p)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition-all ${
                          cleanupPolicy === p
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {p === 'never' ? 'Never' : p === '30days' ? 'After 30d' : 'After 90d'}
                      </button>
                    ))}
                  </div>
                  {staleDocIds.size > 0 && cleanupPolicy !== 'never' && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-1.5">
                        <Icon name="ClockIcon" size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          {staleDocIds.size} document{staleDocIds.size !== 1 ? 's' : ''} marked as unused
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIds(new Set(staleDocIds));
                          setConfirmAction({ kind: 'deleteSelected', count: staleDocIds.size });
                        }}
                        className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                      >
                        Review
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Danger Zone ── */}
              <section>
                <h3 className="text-[11px] font-bold text-rose-500 uppercase tracking-wider mb-2.5">
                  Danger Zone
                </h3>
                <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Clearing all data removes every local PDF, chunk, bookmark, and progress record from this device.
                    <strong> Cloud documents are not affected.</strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ kind: 'clearAll' })}
                    disabled={docs.length === 0}
                    className="w-full py-2 px-3.5 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Icon name="TrashIcon" size={13} />
                    Clear All Local Reader Data
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* ── Confirmation Modal ─────────────────────────────────────────────────── */}
      {confirmAction && (
        <div className="absolute inset-0 z-60 flex items-center justify-center px-4">
          <div className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Icon name="ExclamationTriangleIcon" size={18} />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {confirmAction.kind === 'deleteOne'
                  ? 'Delete document?'
                  : confirmAction.kind === 'deleteSelected'
                  ? `Delete ${confirmAction.count} document${confirmAction.count !== 1 ? 's' : ''}?`
                  : 'Clear all local data?'}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {confirmAction.kind === 'deleteOne'
                ? `"${confirmAction.docName}" and all its chunks, bookmarks, and reading progress will be permanently removed from this device.`
                : confirmAction.kind === 'deleteSelected'
                ? `All ${confirmAction.count} selected documents, their chunks, bookmarks, and reading progress will be permanently removed from this device.`
                : 'All local reader data — documents, chunks, bookmarks, and progress — will be permanently cleared. Cloud documents are not affected.'}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmAction.kind === 'deleteOne') {
                    await handleDeleteOne(confirmAction.docId);
                  } else if (confirmAction.kind === 'deleteSelected') {
                    await handleDeleteSelected();
                  } else {
                    await handleClearAll();
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-all"
              >
                {confirmAction.kind === 'clearAll' ? 'Clear All' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg animate-fadeIn z-70 flex items-center gap-1.5">
          <Icon name="CheckIcon" size={13} />
          {toastMsg}
        </div>
      )}
    </div>
  );
}
