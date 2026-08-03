'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { portfolioService } from '@/lib/services/portfolioService';
import { usePortfolioStore } from './store/portfolioStore';
import { ACCENTS } from './types';
import WidgetCanvas from './WidgetCanvas';
import WidgetPalette from './WidgetPalette';
import PortfolioPreview from './PortfolioPreview';
import PortfolioVersionTimeline from './PortfolioVersionTimeline';
import PortfolioAnalysisPanel from './PortfolioAnalysisPanel';
import CareerCopilot from './CareerCopilot';

function SaveStatusPill() {
  const status = usePortfolioStore((s) => s.saveStatus);
  if (status === 'saving') return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> Saving…</span>;
  if (status === 'saved') return <span className="text-xs text-success inline-flex items-center gap-1"><Icon name="CheckIcon" size={13} /> Saved</span>;
  if (status === 'error') return <span className="text-xs text-error inline-flex items-center gap-1"><Icon name="ExclamationTriangleIcon" size={13} /> Save failed</span>;
  return <span className="text-xs text-muted-foreground">All changes saved</span>;
}

function TB({ icon, label, onClick, disabled, active }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`p-2 rounded-lg transition-smooth disabled:opacity-40 ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
      <Icon name={icon as any} size={18} />
    </button>
  );
}

function ThemeBar() {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const setTheme = usePortfolioStore((s) => s.setTheme);
  if (!portfolio) return null;
  const theme = portfolio.theme;
  return (
    <div className="lab-card p-3 flex flex-wrap items-center gap-3 mb-3">
      <span className="text-xs font-medium text-muted-foreground">Theme</span>
      <div className="flex items-center gap-1.5">
        {ACCENTS.map((a) => (
          <button key={a.id} onClick={() => setTheme({ accent: a.id })} title={a.label} className={`w-5 h-5 rounded-full ${a.dot} ${theme.accent === a.id ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40' : ''}`} />
        ))}
      </div>
      <div className="flex items-center bg-muted rounded-lg p-0.5">
        {['sans', 'serif'].map((f) => (
          <button key={f} onClick={() => setTheme({ font: f })} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${theme.font === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{f}</button>
        ))}
      </div>
    </div>
  );
}

function BuilderChooser() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const create = async () => {
    setCreating(true);
    try {
      const p = await portfolioService.createPortfolio('Untitled Portfolio');
      router.push(`/career/portfolio/${p.id}`);
    } catch {
      setCreating(false);
    }
  };
  return (
    <div className="pt-[60px] min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="lab-card p-8 text-center max-w-md">
        <Icon name="GlobeAltIcon" size={36} className="text-primary/70 mx-auto mb-3" />
        <h2 className="font-heading text-lg font-semibold text-foreground mb-1">Portfolio Builder</h2>
        <p className="text-sm text-muted-foreground mb-6">Create a new portfolio or open one from your dashboard.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={create} disabled={creating} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"><Icon name="PlusIcon" size={16} /> {creating ? 'Creating…' : 'New Portfolio'}</button>
          <button onClick={() => router.push('/career/portfolio')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted"><Icon name="Squares2X2Icon" size={16} /> Dashboard</button>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioBuilder({ masterId }: { masterId?: string }) {
  const router = useRouter();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const loading = usePortfolioStore((s) => s.loading);
  const error = usePortfolioStore((s) => s.error);
  const load = usePortfolioStore((s) => s.load);
  const setTitle = usePortfolioStore((s) => s.setTitle);
  const snapshot = usePortfolioStore((s) => s.snapshot);
  const undo = usePortfolioStore((s) => s.undo);
  const redo = usePortfolioStore((s) => s.redo);
  const canUndo = usePortfolioStore((s) => s.past.length > 0);
  const canRedo = usePortfolioStore((s) => s.future.length > 0);

  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    if (masterId) void load(masterId);
  }, [masterId, load]);

  const handleSnapshot = useCallback(async () => {
    if (await snapshot()) showToast('Version saved ✓');
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSnapshot, undo, redo]);

  if (!masterId) return <BuilderChooser />;
  if (loading && !portfolio) return <div className="pt-[60px] h-screen flex items-center justify-center bg-background"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (error && !portfolio) {
    return (
      <div className="pt-[60px] min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="lab-card p-8 text-center max-w-md">
          <Icon name="ExclamationTriangleIcon" size={30} className="text-error mx-auto mb-2" />
          <p className="text-sm text-foreground mb-4">{error}</p>
          <button onClick={() => router.push('/career/portfolio')} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted">Back to dashboard</button>
        </div>
      </div>
    );
  }
  if (!portfolio) return null;

  return (
    <div className="pt-[60px] h-screen flex flex-col bg-background">
      {toast && <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium shadow-lg animate-fade-in">{toast}</div>}

      <div className="h-[52px] flex items-center gap-2 px-3 sm:px-4 border-b border-border bg-card flex-shrink-0">
        <button onClick={() => router.push('/career/portfolio')} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" title="Dashboard"><Icon name="ArrowLeftIcon" size={18} /></button>
        <input value={portfolio.title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 max-w-[280px] bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:bg-muted/50 rounded px-2 py-1" placeholder="Untitled Portfolio" />
        <div className="hidden sm:block"><SaveStatusPill /></div>
        <div className="lg:hidden flex items-center bg-muted rounded-lg p-0.5 ml-auto">
          <button onClick={() => setMobileTab('edit')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${mobileTab === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Edit</button>
          <button onClick={() => setMobileTab('preview')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${mobileTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Preview</button>
        </div>
        <div className="flex items-center gap-0.5 ml-auto lg:ml-2 overflow-x-auto scrollbar-clean">
          <TB icon="ArrowUturnLeftIcon" label="Undo (⌘Z)" onClick={undo} disabled={!canUndo} />
          <TB icon="ArrowUturnRightIcon" label="Redo (⌘⇧Z)" onClick={redo} disabled={!canRedo} />
          <div className="w-px h-5 bg-border mx-1" />
          <TB icon="BookmarkIcon" label="Save version (⌘S)" onClick={handleSnapshot} />
          <TB icon="ClockIcon" label="Version history" onClick={() => setVersionsOpen(true)} active={versionsOpen} />
          <TB icon="SparklesIcon" label="AI analysis" onClick={() => setAnalysisOpen(true)} active={analysisOpen} />
          <div className="w-px h-5 bg-border mx-1" />
          <TB icon="ChatBubbleLeftRightIcon" label="AI copilot" onClick={() => setCopilotOpen((v) => !v)} active={copilotOpen} />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex">
          <div className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 lg:border-r border-border`}>
            <div className="w-full max-w-[720px] mx-auto">
              <ThemeBar />
              <div className="space-y-3"><WidgetCanvas /><WidgetPalette /></div>
            </div>
          </div>
          <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 bg-muted/30`}>
            <PortfolioPreview />
          </div>
        </div>
        {copilotOpen && (
          <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 border-l border-border bg-card">
            <CareerCopilot onCollapse={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>

      <PortfolioVersionTimeline masterId={masterId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <PortfolioAnalysisPanel masterId={masterId} open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
    </div>
  );
}
