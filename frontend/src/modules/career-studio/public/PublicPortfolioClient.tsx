'use client';

/** Public, unauthenticated shared-portfolio page (/p/[slug]). */

import { useEffect, useState } from 'react';
import { portfolioService } from '@/lib/services/portfolioService';
import { downloadBlob } from '../shared/exportUtils';
import type { PublicPortfolio } from '../shared/types';
import PortfolioWidgetsView from '../portfolio/PortfolioWidgetsView';

export default function PublicPortfolioClient({ slug, version }: { slug: string; version?: number }) {
  const [data, setData] = useState<PublicPortfolio | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [quote, setQuote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitTestimonial = async () => {
    setSubmitError(null);
    if (!name.trim() || !quote.trim()) { setSubmitError('Both fields are required.'); return; }
    setSubmitting(true);
    try {
      await portfolioService.submitTestimonial(slug, name.trim(), quote.trim());
      setSubmitted(true);
      setName('');
      setQuote('');
    } catch (e: any) {
      setSubmitError(e?.message || 'Could not submit — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      downloadBlob(await portfolioService.downloadPublic(slug), `${(data?.title || 'portfolio').toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch { /* best-effort */ } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = version ? await portfolioService.getPublicVersion(slug, version) : await portfolioService.getPublic(slug);
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
  }, [slug, version]);

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
      {version != null && (
        <div className="bg-amber-50 text-amber-800 text-xs text-center py-1.5 border-b border-amber-200">Viewing a past version (v{version}) — this may not be the current portfolio.</div>
      )}
      <div className="flex justify-end px-4 pt-3">
        <button onClick={download} disabled={downloading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white shadow-sm ring-1 ring-black/5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
      <PortfolioWidgetsView widgets={data.widgets} theme={data.theme} emptyText="This portfolio is empty." />

      {version == null && (
        <div className="max-w-2xl w-full mx-auto px-4 pb-10">
          {!!data.approved_testimonials?.length && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">Recommendations</h2>
              <div className="space-y-3">
                {data.approved_testimonials.map((t) => (
                  <div key={t.id} className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4">
                    <p className="text-sm text-neutral-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                    <p className="text-xs text-neutral-400 mt-2">— {t.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-4">
            {submitted ? (
              <p className="text-sm text-neutral-600">Thanks — your recommendation was submitted and is awaiting review.</p>
            ) : showForm ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-neutral-700">Leave a recommendation</p>
                {submitError && <p className="text-xs text-red-600">{submitError}</p>}
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2" />
                <textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Write a short recommendation…" maxLength={1000} rows={4} className="w-full text-sm rounded-lg border border-neutral-200 px-3 py-2 resize-y" />
                <div className="flex items-center gap-2">
                  <button onClick={submitTestimonial} disabled={submitting} className="px-3 py-1.5 rounded-lg bg-neutral-800 text-white text-xs font-medium hover:bg-neutral-700 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit'}</button>
                  <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-700">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)} className="text-xs font-medium text-neutral-600 hover:text-neutral-800">+ Leave a recommendation</button>
            )}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-neutral-400 py-4">Built with Career Studio</p>
    </div>
  );
}
