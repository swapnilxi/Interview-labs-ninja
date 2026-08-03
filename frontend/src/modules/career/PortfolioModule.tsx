'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { portfolioService } from '@/lib/services/portfolioService';
import type { Portfolio } from './types';

type Toast = { message: string; type: 'success' | 'error' } | null;

function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PortfolioModule() {
  const router = useRouter();
  const [items, setItems] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (!isLoggedIn()) {
      setAuthed(false);
      setLoading(false);
      return;
    }
    setAuthed(true);
    setLoading(true);
    try {
      setItems(await portfolioService.listPortfolios());
    } catch (e: any) {
      showToast(e?.message || 'Failed to load portfolios', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const p = await portfolioService.createPortfolio('Untitled Portfolio');
      router.push(`/career/portfolio/${p.id}`);
    } catch (e: any) {
      showToast(e?.message || 'Could not create portfolio', 'error');
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await portfolioService.deletePortfolio(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      showToast('Portfolio deleted');
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };

  if (!authed) {
    return (
      <div className="lab-card p-10 text-center max-w-lg mx-auto">
        <Icon name="LockClosedIcon" size={32} className="text-muted-foreground mx-auto mb-3" />
        <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Log in to build a portfolio</h3>
        <p className="text-sm text-muted-foreground mb-5">Your portfolios are saved to your account.</p>
        <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"><Icon name="UserCircleIcon" size={16} /> Log in</Link>
      </div>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div className={`fixed top-20 right-6 z-[300] px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg animate-fade-in ${toast.type === 'success' ? 'bg-success/10 text-success border border-success/30' : 'bg-error/10 text-error border border-error/30'}`}>{toast.message}</div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Your Portfolios</h2>
        <button onClick={handleCreate} disabled={creating} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
          <Icon name="PlusIcon" size={16} /> {creating ? 'Creating…' : 'New Portfolio'}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="lab-card p-5 animate-pulse"><div className="h-5 w-2/3 bg-muted rounded mb-4" /><div className="h-3 w-1/2 bg-muted rounded" /></div>)}
        </div>
      ) : items.length === 0 ? (
        <div className="lab-card p-12 text-center">
          <Icon name="GlobeAltIcon" size={40} className="text-primary/70 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold text-foreground mb-1">No portfolios yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">Build a one-page portfolio from widgets — hero, projects, skills, and more — with live preview, versioning, and AI review.</p>
          <button onClick={handleCreate} disabled={creating} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"><Icon name="PlusIcon" size={16} /> New Portfolio</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <div key={p.id} className="lab-card p-5 group hover:border-primary/40 transition-smooth flex flex-col">
              <button onClick={() => router.push(`/career/portfolio/${p.id}`)} className="text-left flex-1">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Icon name="GlobeAltIcon" size={18} className="text-primary" /></div>
                  <div className="min-w-0"><h3 className="font-heading text-sm font-semibold text-foreground truncate">{p.title}</h3><p className="text-xs text-muted-foreground mt-0.5">Updated {formatDate(p.updated_at)}</p></div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Icon name="RectangleGroupIcon" size={14} /> {p.widget_count ?? 0} widgets</span>
                  <span className="inline-flex items-center gap-1"><Icon name="ClockIcon" size={14} /> {p.version_count ?? 0} versions</span>
                </div>
              </button>
              <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-smooth">
                <button onClick={() => router.push(`/career/portfolio/${p.id}`)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5" title="Open"><Icon name="PencilSquareIcon" size={16} /></button>
                <button onClick={() => handleDelete(p.id, p.title)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5" title="Delete"><Icon name="TrashIcon" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
