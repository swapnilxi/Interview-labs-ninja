'use client';

/** Public, unauthenticated shared-portfolio page (/p/[slug]). */

import { useEffect, useState } from 'react';
import { portfolioService } from '@/lib/services/portfolioService';
import type { PublicPortfolio } from './types';
import PortfolioWidgetsView from './PortfolioWidgetsView';

export default function PublicPortfolioClient({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicPortfolio | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await portfolioService.getPublic(slug);
        if (!cancelled) {
          setData(d);
          setState('ready');
          if (d.title) document.title = `${d.title} — Portfolio`;
        }
      } catch (e: any) {
        if (!cancelled) {
          setMessage(e?.message || 'This portfolio could not be found.');
          setState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <span className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-8 text-center max-w-sm">
          <div className="text-4xl mb-2">🔍</div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">Portfolio not found</h1>
          <p className="text-sm text-neutral-500">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100">
      <PortfolioWidgetsView widgets={data.widgets} theme={data.theme} emptyText="This portfolio is empty." />
      <p className="text-center text-[11px] text-neutral-400 py-4">Built with Career Studio</p>
    </div>
  );
}
