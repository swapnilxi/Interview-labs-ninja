'use client';

import React, { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { PdfDocument, ProcessingState } from './types';
import DocumentInputPanel from './components/DocumentInputPanel';
import PdfDeckReaderView from './components/PdfDeckReaderView';
import StorageManagerPanel from './components/StorageManagerPanel';
import { DEMO_PDF_DOCUMENTS } from './data/sampleDocs';
import { useReaderStorage } from './utils/useReaderStorage';
import type { ReaderDocMeta } from './utils/readerDb';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import { useSmartBack } from '@/lib/navigation/smartBack';
import { toast } from '@/lib/ui/toast';

export default function SwipePdfReaderModule() {
  const storage = useReaderStorage();
  const { get, update, pathname, searchParams } = useUrlState();
  const goBack = useSmartBack();

  // Which screen is showing lives in the URL:
  //   /swipe-pdf-reader                     the library (upload / paste / samples / recent)
  //   /swipe-pdf-reader?doc=<id>            a document being read; the reader itself keeps &card=<n> up to date
  // An unknown ?doc= falls back to the library. (Replaces the old "last open document" localStorage key.)
  const docParam = get('doc');
  const [loadedDoc, setLoadedDoc] = useState<PdfDocument | null>(null);
  const activeDocument = docParam && loadedDoc?.id === docParam ? loadedDoc : null;
  const libraryHref = buildUrl(pathname, searchParams, { doc: null, card: null });
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    progress: 0,
  });
  const [recentDocs, setRecentDocs] = useState<ReaderDocMeta[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [showStorageManager, setShowStorageManager] = useState(false);

  // Newest `update` / loader for the async effects below (their identities change with every URL change).
  const latest = useRef({ update, loadDocument: null as null | ((id: string, source?: string) => Promise<PdfDocument | null>) });
  latest.current.update = update;

  /** A document by id: bundled sample, then this device (IndexedDB), then — for cloud documents — the API. */
  const loadDocument = async (id: string, source?: string): Promise<PdfDocument | null> => {
    const demo = DEMO_PDF_DOCUMENTS.find((d) => d.id === id);
    if (demo) {
      // Demo docs have their chunks in memory; persist them to IDB too
      storage.saveFullDocument(demo);
      return demo;
    }
    let doc: PdfDocument | null = null;
    try {
      doc = (await storage.getFullDocumentAsync(id)) as PdfDocument | null;
    } catch {
      doc = null;
    }
    if ((!doc || doc.chunks.length === 0) && source !== 'local') {
      try {
        const res = await fetch(`/api/pdf/documents/${encodeURIComponent(id)}`);
        if (res.ok) {
          doc = await res.json();
          if (doc) await storage.saveFullDocument(doc, undefined, 'cloud');
        }
      } catch {
        // offline / backend unavailable: handled as "not found" below
      }
    }
    return doc && doc.chunks?.length > 0 ? doc : null;
  };
  latest.current.loadDocument = loadDocument;

  // Open the document named by ?doc= (a link, a refresh, Back/Forward). Documents opened from this page are already
  // in memory (see openDocument), so this only loads when the URL arrives first.
  const loadedDocId = useRef<string | null>(null);
  loadedDocId.current = loadedDoc?.id ?? null;
  useEffect(() => {
    if (!docParam) {
      setLoadedDoc(null);
      return;
    }
    if (loadedDocId.current === docParam) return;
    let cancelled = false;
    (async () => {
      const doc = await latest.current.loadDocument!(docParam);
      if (cancelled) return;
      if (doc) {
        setLoadedDoc(doc);
      } else {
        toast.error('That document is not on this device any more.');
        latest.current.update({ doc: null, card: null }, 'replace');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docParam]);

  // Back on the library after reading: forget the finished upload, and show the new progress.
  const wasReading = useRef(false);
  useEffect(() => {
    if (docParam) {
      wasReading.current = true;
      return;
    }
    if (!wasReading.current) return;
    wasReading.current = false;
    setProcessingState({ status: 'idle', progress: 0 });
    refreshRecent();
  }, [docParam]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Show a document: keep it in memory so the reader opens at once, then move the URL to it. */
  const openDocument = (doc: PdfDocument) => {
    setLoadedDoc(doc);
    update({ doc: doc.id, card: null });
  };

  // Load recent docs + progress on mount
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      // 1. Load recent docs metadata from IndexedDB
      const docs = await storage.getRecentDocsAsync();

      // 2. Fetch cloud documents from backend
      try {
        const res = await fetch('/api/pdf/documents');
        if (res.ok) {
          const cloudDocs: ReaderDocMeta[] = await res.json();
          const localIds = new Set(docs.map((d) => d.id));
          for (const c of cloudDocs) {
            if (!localIds.has(c.id)) {
              docs.push(c);
            }
          }
        }
      } catch {
        // Backend unavailable, fall back to IDB only
      }

      if (cancelled) return;
      setRecentDocs(docs);

      // 3. Load reading progress for each doc
      const pmap: Record<string, number> = {};
      await Promise.all(
        docs.map(async (d) => {
          const p = await storage.getProgressAsync(d.id);
          if (p && d.totalChunks > 0) {
            pmap[d.id] = Math.round((p.chunkIndex / d.totalChunks) * 100);
          }
        })
      );
      if (!cancelled) setProgressMap(pmap);
    }
    loadRecent();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Reload the recent list and the reading progress from this device. */
  function refreshRecent() {
    storage.getRecentDocsAsync().then(async (docs) => {
      setRecentDocs(docs);
      const pmap: Record<string, number> = {};
      await Promise.all(
        docs.map(async (d) => {
          const p = await storage.getProgressAsync(d.id);
          if (p && d.totalChunks > 0) {
            pmap[d.id] = Math.round((p.chunkIndex / d.totalChunks) * 100);
          }
        })
      );
      setProgressMap(pmap);
    });
  }

  const handleDocumentReady = (doc: PdfDocument) => {
    // Refresh recent docs after a new doc is processed
    storage.getRecentDocsAsync().then((docs) => {
      setRecentDocs(docs);
    });
    openDocument(doc);
  };

  // "Upload Different Document" on the finished screen: back to the library (history Back when it is the previous screen)
  const handleBackToInput = () => goBack(libraryHref);

  const handleLoadDemoDoc = (doc: PdfDocument) => {
    // Demo docs have their chunks in memory; persist them to IDB too
    storage.saveFullDocument(doc);
    storage.getRecentDocsAsync().then(setRecentDocs);
    openDocument(doc);
  };

  /**
   * Load a previously persisted user document from IndexedDB or Cloud backend.
   */
  const handleLoadRecentDoc = async (meta: ReaderDocMeta) => {
    // Check if it's a demo doc first (faster, no IDB round-trip)
    const demo = DEMO_PDF_DOCUMENTS.find((d) => d.id === meta.id);
    if (demo) {
      handleLoadDemoDoc(demo);
      return;
    }

    setLoadingDocId(meta.id);
    try {
      // IndexedDB first; only a cloud document may be fetched from the API
      const doc = await loadDocument(meta.id, meta.source === 'cloud' ? 'cloud' : 'local');
      if (doc) openDocument(doc);
    } catch (err) {
      console.error('Error loading recent doc:', err);
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleDeleteRecentDoc = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    try {
      await storage.deleteDocument(docId);
      setRecentDocs((prev) => prev.filter((d) => d.id !== docId));
      setProgressMap((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-background text-foreground py-4">
      {/* Storage Manager Modal */}
      {showStorageManager && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="w-full max-w-2xl">
            <StorageManagerPanel
              onClose={() => {
                setShowStorageManager(false);
                // Refresh recent docs after potential deletions
                storage.getRecentDocsAsync().then(setRecentDocs);
              }}
              onDataChanged={() => {
                storage.getRecentDocsAsync().then(async (docs) => {
                  setRecentDocs(docs);
                  const pmap: Record<string, number> = {};
                  await Promise.all(
                    docs.map(async (d) => {
                      const p = await storage.getProgressAsync(d.id);
                      if (p && d.totalChunks > 0) {
                        pmap[d.id] = Math.round((p.chunkIndex / d.totalChunks) * 100);
                      }
                    })
                  );
                  setProgressMap(pmap);
                });
              }}
            />
          </div>
        </div>
      )}

      {docParam && !activeDocument ? (
        // ?doc= names a document that is still being opened (a link or a refresh)
        <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Opening document">
          <Icon name="ArrowPathIcon" size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : !activeDocument ? (
        <div className="space-y-6">
          <DocumentInputPanel
            onDocumentReady={handleDocumentReady}
            processingState={processingState}
            setProcessingState={setProcessingState}
            onOpenStorageManager={() => setShowStorageManager(true)}
          />

          {/* ── Sample / Demo Documents + Recent ─────────────────────────── */}
          {processingState.status === 'idle' && (
            <div className="max-w-xl mx-auto px-4 space-y-3">
              {/* Quick demo links */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Or try a sample
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DEMO_PDF_DOCUMENTS.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleLoadDemoDoc(doc)}
                    className="group text-left p-3 rounded-2xl border border-border bg-card hover:bg-muted hover:border-blue-500/30 transition-all shadow-sm"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon
                          name={doc.sourceType === 'pdf' ? 'DocumentIcon' : 'ClipboardDocumentTextIcon'}
                          size={16}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {doc.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {doc.totalChunks} chunks
                          {doc.totalPages ? ` · ${doc.totalPages} pages` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Recent documents (loaded from IndexedDB) */}
              {recentDocs.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Recent
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                    {/* Storage manager shortcut */}
                    <button
                      type="button"
                      onClick={() => setShowStorageManager(true)}
                      title="Manage local storage"
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Icon name="Cog6ToothIcon" size={12} />
                      <span>Storage</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {recentDocs.slice(0, 5).map((recent) => {
                      const pct = progressMap[recent.id];
                      const isDemoDoc = DEMO_PDF_DOCUMENTS.some((d) => d.id === recent.id);
                      const isCloudDoc = recent.source === 'cloud';
                      const isClickable = isDemoDoc || isCloudDoc || recent.hasBlob || recent.sourceType === 'paste';
                      const isLoading = loadingDocId === recent.id;

                      return (
                        <div
                          key={recent.id}
                          onClick={isClickable ? () => handleLoadRecentDoc(recent) : undefined}
                          role={isClickable ? 'button' : undefined}
                          tabIndex={isClickable ? 0 : undefined}
                          onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleLoadRecentDoc(recent) : undefined}
                          className={`group flex items-center gap-3 p-3 rounded-2xl border border-border bg-card transition-all ${
                            isClickable
                              ? 'hover:bg-muted hover:border-blue-500/20 cursor-pointer'
                              : 'opacity-60'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                            {isLoading ? (
                              <Icon name="ArrowPathIcon" size={15} className="animate-spin" />
                            ) : (
                              <Icon
                                name={recent.sourceType === 'pdf' ? 'DocumentIcon' : 'ClipboardDocumentTextIcon'}
                                size={15}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-foreground truncate">{recent.name}</p>
                              {isCloudDoc ? (
                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-semibold">
                                  ☁️ Cloud
                                </span>
                              ) : (
                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold">
                                  📱 Local
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {recent.totalChunks} chunks
                              </span>
                              {pct !== undefined && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  · {pct}% read
                                </span>
                              )}
                              {!isClickable && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  (re-upload to continue)
                                </span>
                              )}
                            </div>
                            {pct !== undefined && (
                              <div className="w-full h-0.5 bg-muted mt-1.5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteRecentDoc(e, recent.id)}
                              title="Delete from local storage"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Icon name="TrashIcon" size={13} />
                            </button>
                            {isClickable && (
                              <Icon name="ChevronRightIcon" size={14} className="text-muted-foreground/50" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <PdfDeckReaderView
          key={activeDocument.id}
          document={activeDocument}
          routed={{ backHref: libraryHref, card: get('card') }}
          onBackToInput={handleBackToInput}
        />
      )}
    </div>
  );
}
