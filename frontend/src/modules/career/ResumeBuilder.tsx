'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from './store/resumeStore';
import ResumeEditor from './ResumeEditor';
import ResumePreview from './ResumePreview';
import VersionTimeline from './VersionTimeline';
import AnalysisPanel from './AnalysisPanel';
import ImportDialog from './ImportDialog';
import CareerCopilot from './CareerCopilot';

const SHORTCUTS = [
  { keys: '⌘/Ctrl + S', label: 'Save a version (checkpoint)' },
  { keys: '⌘/Ctrl + Z', label: 'Undo' },
  { keys: '⌘/Ctrl + ⇧ + Z', label: 'Redo' },
  { keys: '⌘/Ctrl + /', label: 'Toggle this shortcuts panel' },
];

function SaveStatusPill() {
  const status = useResumeStore((s) => s.saveStatus);
  if (status === 'saving') return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> Saving…</span>;
  if (status === 'saved') return <span className="text-xs text-success inline-flex items-center gap-1"><Icon name="CheckIcon" size={13} /> Saved</span>;
  if (status === 'error') return <span className="text-xs text-error inline-flex items-center gap-1"><Icon name="ExclamationTriangleIcon" size={13} /> Save failed</span>;
  return <span className="text-xs text-muted-foreground">All changes saved</span>;
}

function ToolbarButton({ icon, label, onClick, disabled, active }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg transition-smooth disabled:opacity-40 ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
    >
      <Icon name={icon as any} size={18} />
    </button>
  );
}

/** Shown when there's no masterId — a lightweight start screen. */
function BuilderChooser() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const create = async () => {
    setCreating(true);
    try {
      const r = await careerService.createResume('Untitled Resume');
      router.push(`/career/resume/${r.id}`);
    } catch {
      setCreating(false);
    }
  };
  return (
    <div className="pt-[60px] min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="lab-card p-8 text-center max-w-md">
        <Icon name="DocumentTextIcon" size={36} className="text-primary/70 mx-auto mb-3" />
        <h2 className="font-heading text-lg font-semibold text-foreground mb-1">Resume Builder</h2>
        <p className="text-sm text-muted-foreground mb-6">Create a new resume or open an existing one from your dashboard.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={create} disabled={creating} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
            <Icon name="PlusIcon" size={16} /> {creating ? 'Creating…' : 'New Resume'}
          </button>
          <button onClick={() => router.push('/career')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted">
            <Icon name="Squares2X2Icon" size={16} /> Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResumeBuilder({ masterId }: { masterId?: string }) {
  const router = useRouter();
  const resume = useResumeStore((s) => s.resume);
  const loading = useResumeStore((s) => s.loading);
  const error = useResumeStore((s) => s.error);
  const load = useResumeStore((s) => s.load);
  const setTitle = useResumeStore((s) => s.setTitle);
  const snapshot = useResumeStore((s) => s.snapshot);
  const undo = useResumeStore((s) => s.undo);
  const redo = useResumeStore((s) => s.redo);
  const canUndo = useResumeStore((s) => s.past.length > 0);
  const canRedo = useResumeStore((s) => s.future.length > 0);

  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    if (masterId) void load(masterId);
  }, [masterId, load]);

  // Auto-open the import dialog when arriving via "New from import".
  useEffect(() => {
    if (masterId && typeof window !== 'undefined' && window.location.search.includes('import=1')) {
      setImportOpen(true);
    }
  }, [masterId]);

  const handleSnapshot = useCallback(async () => {
    const v = await snapshot();
    if (v) showToast('Version saved ✓');
  }, [snapshot, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void handleSnapshot();
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSnapshot, undo, redo]);

  if (!masterId) return <BuilderChooser />;

  if (loading && !resume) {
    return (
      <div className="pt-[60px] h-screen flex items-center justify-center bg-background">
        <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !resume) {
    return (
      <div className="pt-[60px] min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="lab-card p-8 text-center max-w-md">
          <Icon name="ExclamationTriangleIcon" size={30} className="text-error mx-auto mb-2" />
          <p className="text-sm text-foreground mb-4">{error}</p>
          <button onClick={() => router.push('/career')} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted">Back to dashboard</button>
        </div>
      </div>
    );
  }

  if (!resume) return null;

  return (
    <div className="pt-[60px] h-screen flex flex-col bg-background">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium shadow-lg animate-fade-in">{toast}</div>
      )}

      {/* Toolbar */}
      <div className="h-[52px] flex items-center gap-2 px-3 sm:px-4 border-b border-border bg-card flex-shrink-0">
        <button onClick={() => router.push('/career')} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" title="Dashboard">
          <Icon name="ArrowLeftIcon" size={18} />
        </button>
        <input
          value={resume.title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 max-w-[280px] bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:bg-muted/50 rounded px-2 py-1"
          placeholder="Untitled Resume"
        />
        <div className="hidden sm:block"><SaveStatusPill /></div>

        {/* Mobile edit/preview switch */}
        <div className="lg:hidden flex items-center bg-muted rounded-lg p-0.5 ml-auto">
          <button onClick={() => setMobileTab('edit')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${mobileTab === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Edit</button>
          <button onClick={() => setMobileTab('preview')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${mobileTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Preview</button>
        </div>

        <div className="flex items-center gap-0.5 ml-auto lg:ml-2 overflow-x-auto scrollbar-clean">
          <ToolbarButton icon="ArrowUturnLeftIcon" label="Undo (⌘Z)" onClick={undo} disabled={!canUndo} />
          <ToolbarButton icon="ArrowUturnRightIcon" label="Redo (⌘⇧Z)" onClick={redo} disabled={!canRedo} />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarButton icon="BookmarkIcon" label="Save version (⌘S)" onClick={handleSnapshot} />
          <ToolbarButton icon="ClockIcon" label="Version history" onClick={() => setVersionsOpen(true)} active={versionsOpen} />
          <ToolbarButton icon="SparklesIcon" label="AI analysis" onClick={() => setAnalysisOpen(true)} active={analysisOpen} />
          <ToolbarButton icon="ArrowUpTrayIcon" label="Import" onClick={() => setImportOpen(true)} />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarButton icon="ChatBubbleLeftRightIcon" label="AI copilot" onClick={() => setCopilotOpen((v) => !v)} active={copilotOpen} />
          <ToolbarButton icon="QuestionMarkCircleIcon" label="Shortcuts (⌘/)" onClick={() => setShortcutsOpen(true)} />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex">
          {/* Editor */}
          <div className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 lg:border-r border-border`}>
            <div className="w-full max-w-[720px] mx-auto"><ResumeEditor /></div>
          </div>
          {/* Preview */}
          <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 bg-muted/30`}>
            <ResumePreview />
          </div>
        </div>

        {/* Copilot (right sidebar, lg+) */}
        {copilotOpen && (
          <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 border-l border-border bg-card">
            <CareerCopilot masterId={masterId} onCollapse={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>

      <VersionTimeline masterId={masterId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <AnalysisPanel masterId={masterId} open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
      <ImportDialog masterId={masterId} open={importOpen} onClose={() => setImportOpen(false)} />

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
              <button onClick={() => setShortcutsOpen(false)} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={16} /></button>
            </div>
            <div className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.label}</span>
                  <kbd className="text-xs bg-muted border border-border rounded px-2 py-0.5 text-foreground">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
