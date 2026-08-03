'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from './store/resumeStore';
import { SECTION_LABELS } from './types';

type Parsed = { section_type: string; title: string; content: any };

export default function ImportDialog({ masterId, open, onClose }: { masterId: string; open: boolean; onClose: () => void }) {
  const load = useResumeStore((s) => s.load);
  const [rawText, setRawText] = useState('');
  const [sections, setSections] = useState<Parsed[]>([]);
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setRawText('');
    setSections([]);
    setInclude({});
    setStep('input');
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { text } = await careerService.importExtract(file);
      setRawText(text);
    } catch (e: any) {
      setError(e?.message || 'Could not read file');
    } finally {
      setLoading(false);
    }
  };

  const structure = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { sections: parsed } = await careerService.importStructure(rawText);
      setSections(parsed || []);
      setInclude(Object.fromEntries((parsed || []).map((_, i) => [i, true])));
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'AI structuring failed');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setLoading(true);
    setError(null);
    try {
      const chosen = sections.filter((_, i) => include[i]);
      for (const s of chosen) {
        await careerService.addSection(masterId, s.section_type, s.title || SECTION_LABELS[s.section_type], s.content);
      }
      await load(masterId);
      close();
    } catch (e: any) {
      setError(e?.message || 'Failed to apply import');
      setLoading(false);
    }
  };

  const previewOf = (c: any): string => {
    if (c?.text) return String(c.text).slice(0, 120);
    if (Array.isArray(c?.items)) return `${c.items.length} entr${c.items.length === 1 ? 'y' : 'ies'}`;
    if (Array.isArray(c?.groups)) return `${c.groups.length} group(s)`;
    if (c?.name) return c.name;
    return '—';
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 h-[56px] border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="ArrowUpTrayIcon" size={18} className="text-primary" />
            <span className="font-heading text-sm font-semibold text-foreground">Import resume</span>
          </div>
          <button onClick={close} className="theme-toggle" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-clean p-5">
          {step === 'input' && (
            <div className="space-y-4">
              <div>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,text/plain,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} className="w-full py-6 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-smooth flex flex-col items-center gap-2 text-muted-foreground">
                  <Icon name="DocumentArrowUpIcon" size={28} />
                  <span className="text-sm font-medium">{loading ? 'Reading…' : 'Upload PDF, DOCX, or TXT'}</span>
                  <span className="text-xs">or paste the text below</span>
                </button>
              </div>
              <textarea
                className="w-full min-h-[180px] bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring resize-y"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste your resume text here…"
              />
              {error && <p className="text-xs text-error">{error}</p>}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Select the sections to add to your resume:</p>
              {sections.length === 0 && <p className="text-sm text-muted-foreground">No sections detected.</p>}
              {sections.map((s, i) => (
                <label key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" checked={!!include[i]} onChange={(e) => setInclude((v) => ({ ...v, [i]: e.target.checked }))} className="mt-1" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{s.title || SECTION_LABELS[s.section_type] || s.section_type}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{SECTION_LABELS[s.section_type] || s.section_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{previewOf(s.content)}</p>
                  </div>
                </label>
              ))}
              {error && <p className="text-xs text-error">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border flex-shrink-0">
          {step === 'preview' ? (
            <button onClick={() => setStep('input')} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Icon name="ArrowLeftIcon" size={14} /> Back</button>
          ) : (
            <span />
          )}
          {step === 'input' ? (
            <button onClick={structure} disabled={!rawText.trim() || loading} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              <Icon name="SparklesIcon" size={16} /> {loading ? 'Structuring…' : 'Structure with AI'}
            </button>
          ) : (
            <button onClick={apply} disabled={loading || !Object.values(include).some(Boolean)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              <Icon name="CheckIcon" size={16} /> {loading ? 'Adding…' : `Add ${Object.values(include).filter(Boolean).length} section(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
