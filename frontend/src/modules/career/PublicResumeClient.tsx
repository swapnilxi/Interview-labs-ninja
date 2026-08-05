'use client';

/** Public, unauthenticated shared-resume page (/r/[slug]). Mirrors
 * PublicPortfolioClient.tsx, but the backend hands back pre-rendered HTML
 * (same renderer as the authenticated export) instead of widget JSON, so this
 * just drops it into an iframe — identical to how the editor's own live
 * preview already works. */

import { useEffect, useState } from 'react';
import { viewsService } from '@/lib/services/viewsService';
import type { PublicResume } from './types';

export default function PublicResumeClient({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicResume | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await viewsService.getPublicResume(slug);
        if (!cancelled) {
          setData(d);
          setState('ready');
          if (d.title) document.title = `${d.title} — Resume`;
        }
      } catch (e: any) {
        if (!cancelled) {
          setMessage(e?.message || 'This resume could not be found.');
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
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">Resume not found</h1>
          <p className="text-sm text-neutral-500">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100">
      <iframe title={data.title || 'Resume'} srcDoc={data.html} className="flex-1 w-full border-0 bg-white" />
      <p className="text-center text-[11px] text-neutral-400 py-4">Built with Career Studio</p>
    </div>
  );
}
