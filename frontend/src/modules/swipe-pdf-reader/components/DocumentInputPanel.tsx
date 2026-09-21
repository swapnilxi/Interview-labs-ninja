'use client';

import React, { useState, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { PdfDocument, ProcessingState } from '../types';
import { extractPdfTextBestEffort, processDocumentChunks } from '../utils/pdfProcessor';
import { useReaderStorage } from '../utils/useReaderStorage';
import { QuotaError } from '../utils/readerDb';

interface DocumentInputPanelProps {
  onDocumentReady: (doc: PdfDocument) => void;
  processingState: ProcessingState;
  setProcessingState: React.Dispatch<React.SetStateAction<ProcessingState>>;
  /** Called when user opens Storage Manager from a quota error */
  onOpenStorageManager?: () => void;
}

export default function DocumentInputPanel({
  onDocumentReady,
  processingState,
  setProcessingState,
  onOpenStorageManager,
}: DocumentInputPanelProps) {
  const storage = useReaderStorage();
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [storageMode, setStorageMode] = useState<'local' | 'cloud'>('local');

  // PDF state
  const [dragActive, setDragActive] = useState(false);
  const [keepOffline, setKeepOffline] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelledRef = useRef(false);

  // Text paste state
  const [docTitleInput, setDocTitleInput] = useState('');
  const [pastedText, setPastedText] = useState('');

  // ── PDF processing ─────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setProcessingState({
        status: 'error',
        progress: 0,
        error: 'Please select a valid PDF file (.pdf)',
      });
      return;
    }

    cancelledRef.current = false;
    setQuotaError(false);
    setPendingFile(file);

    setProcessingState({
      status: 'uploading',
      progress: 5,
      message: storageMode === 'cloud' ? `Uploading ${file.name} to Cloud…` : `Opening ${file.name}…`,
    });

    try {
      let processedDoc: PdfDocument;

      if (storageMode === 'cloud') {
        // ── Cloud Upload Flow ────────────────────────────────────────────────
        const formData = new FormData();
        formData.append('file', file);

        setProcessingState({
          status: 'processing',
          progress: 25,
          message: 'Uploading document to cloud server…',
        });

        const res = await fetch('/api/pdf/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error (${res.status}) while uploading PDF.`);
        }

        setProcessingState({
          status: 'processing',
          progress: 75,
          message: 'Server extracted text & generated swipe cards…',
        });

        const cloudDoc = await res.json();
        processedDoc = {
          id: cloudDoc.id,
          name: cloudDoc.name,
          type: 'pdf',
          sourceType: 'pdf',
          source: 'cloud',
          syncStatus: 'synced',
          totalPages: cloudDoc.totalPages,
          totalChunks: cloudDoc.totalChunks,
          extractedText: cloudDoc.extractedText || '',
          chunks: cloudDoc.chunks || [],
          createdAt: cloudDoc.createdAt || new Date().toISOString(),
          updatedAt: cloudDoc.updatedAt,
        } as unknown as PdfDocument;

      } else {
        // ── Local Processing Flow ───────────────────────────────────────────
        const onProgress = (currentPage: number, totalPages: number) => {
          if (cancelledRef.current) return;
          const pct = Math.round(5 + (currentPage / totalPages) * 60);
          setProcessingState({
            status: 'processing',
            progress: pct,
            message: `Extracting text — page ${currentPage} of ${totalPages}…`,
          });
        };

        setProcessingState({
          status: 'processing',
          progress: 10,
          message: 'Starting local text extraction…',
        });

        const { pageTexts } = await extractPdfTextBestEffort(file, onProgress);

        if (cancelledRef.current) return;

        setProcessingState({
          status: 'processing',
          progress: 70,
          message: 'Splitting into swipeable chunks…',
        });

        const docId = `pdf-${Date.now()}`;
        processedDoc = processDocumentChunks(docId, file.name, 'pdf', pageTexts);
      }

      if (cancelledRef.current) return;

      setProcessingState({
        status: 'processing',
        progress: 85,
        message: 'Saving to local reader database…',
      });

      // Persist to IndexedDB — respect keepOffline choice for local mode
      try {
        await storage.saveFullDocument(
          processedDoc,
          storageMode === 'local' && keepOffline ? file : undefined,
          storageMode,
        );
      } catch (err) {
        if (err instanceof QuotaError) {
          setQuotaError(true);
        } else {
          throw err;
        }
      }

      if (cancelledRef.current) return;

      setProcessingState({
        status: 'success',
        progress: 100,
        message: 'Processing complete!',
        document: processedDoc,
      });
    } catch (err: unknown) {
      if (cancelledRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to process PDF.';
      setProcessingState({
        status: 'error',
        progress: 0,
        error: msg,
      });
    }
  }, [keepOffline, storageMode, storage]);

  const handleCancel = () => {
    cancelledRef.current = true;
    setPendingFile(null);
    setProcessingState({ status: 'idle', progress: 0 });
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  // ── Paste text processing ──────────────────────────────────────────────────

  const handleProcessPastedText = () => {
    const title = docTitleInput.trim() || 'Pasted Document';
    const text = pastedText.trim();

    if (!text) {
      setProcessingState({
        status: 'error',
        progress: 0,
        error: 'Please paste some document text before processing.',
      });
      return;
    }

    setProcessingState({
      status: 'processing',
      progress: 50,
      message: 'Processing text into swipeable chunks…',
    });

    setTimeout(() => {
      const docId = `paste-${Date.now()}`;
      const pageTexts = [{ pageNumber: 1, text }];
      const processedDoc = processDocumentChunks(docId, title, 'paste', pageTexts);

      storage.saveFullDocument(processedDoc);

      setProcessingState({
        status: 'success',
        progress: 100,
        message: 'Document ready!',
        document: processedDoc,
      });
    }, 300);
  };

  const handleReset = () => {
    cancelledRef.current = true;
    setPendingFile(null);
    setQuotaError(false);
    setProcessingState({ status: 'idle', progress: 0 });
    setPastedText('');
    setDocTitleInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const doc = processingState.document;
  const isProcessing = processingState.status === 'uploading' || processingState.status === 'processing';

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold mb-2">
          <Icon name="DocumentTextIcon" size={16} />
          <span>Swipe PDF &amp; Document Reader</span>
        </div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground">
          Turn Long Documents Into Swipe Cards
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Upload a PDF or paste notes — processed locally into bite-sized swipeable cards.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden transition-all">

        {/* ── Success screen ─────────────────────────────────────────────── */}
        {processingState.status === 'success' && doc ? (
          <div className="p-6 text-center space-y-5 animate-fadeIn">
            {/* Quota warning (non-blocking — reader still works) */}
            {quotaError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs text-left">
                <Icon name="ExclamationTriangleIcon" size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Device storage is full — document not saved offline.</p>
                  <p className="mt-0.5 text-amber-500/80">You can still read now, but progress won't be saved after closing.</p>
                </div>
                {onOpenStorageManager && (
                  <button
                    type="button"
                    onClick={onOpenStorageManager}
                    className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/10 transition-all"
                  >
                    Manage
                  </button>
                )}
              </div>
            )}

            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Icon name="CheckCircleIcon" size={32} />
            </div>

            <div>
              <h2 className="text-xl font-bold text-foreground font-heading">{doc.name}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Successfully processed into swipeable micro-learning cards.
              </p>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex flex-col items-center justify-center p-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Source</span>
                <span className="text-sm font-bold text-foreground capitalize mt-0.5 flex items-center gap-1">
                  {doc.sourceType === 'pdf' ? (
                    <><Icon name="DocumentIcon" size={14} className="text-rose-500" /> PDF</>
                  ) : (
                    <><Icon name="ClipboardDocumentTextIcon" size={14} className="text-blue-500" /> Paste</>
                  )}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 border-x border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pages</span>
                <span className="text-sm font-bold text-foreground mt-0.5">
                  {doc.totalPages ? `${doc.totalPages}` : 'N/A'}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Chunks</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {doc.totalChunks} Cards
                </span>
              </div>
            </div>

            {/* Save for offline toggle */}
            {doc.sourceType === 'pdf' && pendingFile && (
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-2.5">
                  <Icon name="ArrowDownTrayIcon" size={16} className="text-blue-500" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-foreground">Save PDF for offline reading</p>
                    <p className="text-[10px] text-muted-foreground">
                      Keeps the original file on this device
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keepOffline}
                  onClick={() => {
                    const next = !keepOffline;
                    setKeepOffline(next);
                    // Re-save with updated blob preference (fire and forget)
                    if (next && pendingFile) {
                      storage.saveFullDocument(doc, pendingFile);
                    } else {
                      // Remove blob — re-save without it
                      storage.saveFullDocument(doc);
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                    keepOffline ? 'bg-blue-600' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      keepOffline ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-1/3 py-2.5 px-4 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-all"
              >
                Open Another
              </button>
              <button
                type="button"
                onClick={() => onDocumentReady(doc)}
                className="w-full sm:w-2/3 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
              >
                <span>Start Reading</span>
                <Icon name="ArrowRightIcon" size={18} />
              </button>
            </div>
          </div>

        ) : isProcessing ? (
          /* ── Processing / loading state ───────────────────────────────── */
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center animate-spin">
              <Icon name="ArrowPathIcon" size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {processingState.message || 'Processing document…'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Formatted locally on this device — not uploaded
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${processingState.progress}%` }}
              />
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Cancel
            </button>
          </div>

        ) : (
          /* ── Input tabs (idle / error state) ─────────────────────────── */
          <div>
            {/* Tab bar */}
            <div className="flex border-b border-border bg-muted/30">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
                  activeTab === 'upload'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-card'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="ArrowUpTrayIcon" size={16} />
                <span>Open PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
                  activeTab === 'paste'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-card'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name="ClipboardDocumentTextIcon" size={16} />
                <span>Paste Text</span>
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {/* Error alert */}
              {processingState.status === 'error' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <Icon name="ExclamationTriangleIcon" size={16} className="shrink-0" />
                  <span>{processingState.error}</span>
                </div>
              )}

              {activeTab === 'upload' ? (
                <div className="space-y-3">
                  {/* Mode Selector: Local vs Cloud */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-xl border border-border text-xs">
                    <button
                      type="button"
                      onClick={() => setStorageMode('local')}
                      className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        storageMode === 'local'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name="DevicePhoneMobileIcon" size={14} className="text-emerald-500" />
                      <span>Open Locally</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageMode('cloud')}
                      className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        storageMode === 'cloud'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name="CloudArrowUpIcon" size={14} className="text-blue-500" />
                      <span>Upload to Cloud</span>
                    </button>
                  </div>

                  {/* Mode description badge */}
                  {storageMode === 'local' ? (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Icon name="LockClosedIcon" size={12} />
                      <span>Processed on this device — file stays local &amp; 100% private.</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      <Icon name="CloudIcon" size={12} />
                      <span>Uploaded to server — saved to SQLite &amp; synced across devices.</span>
                    </div>
                  )}

                  {/* Drop zone / file picker */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="Open PDF from device"
                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all select-none ${
                      dragActive
                        ? 'border-blue-500 bg-blue-500/5 scale-[0.99]'
                        : 'border-border hover:border-blue-500/50 hover:bg-muted/40'
                    }`}
                  >
                    {/* Hidden file input — no capture attr so Android uses file picker (not camera) */}
                    <input
                      ref={fileInputRef}
                      id="pdf-file-input"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFile(e.target.files[0]);
                        }
                      }}
                    />

                    <div className="w-14 h-14 mx-auto rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                      <Icon name="DocumentArrowUpIcon" size={28} />
                    </div>

                    <p className="text-sm font-semibold text-foreground">
                      Open PDF from device
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tap to open file picker · or drag &amp; drop · up to 50 MB
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-2">
                      Works with Downloads, Files, Drive &amp; other apps on Android
                    </p>
                  </div>

                  {/* Save offline toggle (shown before upload too) */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon name="ArrowDownTrayIcon" size={13} />
                      <span>Save PDF for offline reading after opening</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={keepOffline}
                      onClick={() => setKeepOffline((v) => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                        keepOffline ? 'bg-blue-600' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                          keepOffline ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              ) : (
                /* ── Paste text form ──────────────────────────────────────── */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Document Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. System Design Interview Notes"
                      value={docTitleInput}
                      onChange={(e) => setDocTitleInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Document Text / Article Content
                    </label>
                    <textarea
                      rows={6}
                      placeholder="Paste your raw text, study notes, or document content here…"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleProcessPastedText}
                    disabled={!pastedText.trim()}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
                  >
                    <Icon name="SparklesIcon" size={18} />
                    <span>Process Text &amp; Create Cards</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
