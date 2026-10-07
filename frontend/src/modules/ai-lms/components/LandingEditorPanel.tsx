'use client';

import React, { useEffect, useState } from 'react';
import { lmsService } from '../services/lmsService';
import type { LmsLanding, LmsLandingSection } from '../types';

type Tab = 'ai' | 'manual' | 'source' | 'sections';
type AiMode = 'edit' | 'section' | 'generate';

interface LandingEditorPanelProps {
  classSlug: string;
  landing: LmsLanding;
  /** Called with the saved page so the preview iframe re-renders. */
  onSaved: (landing: LmsLanding) => void;
  /** Shows an unsaved AI proposal in the page frame (null = back to the saved page). */
  onPreview: (html: string | null) => void;
}

const inputCls =
  'w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnCls =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50';
const primaryBtnCls =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50';

/**
 * Editor+ only (the page doesn't mount this for other roles; the API enforces it too).
 * Every change -- a manual section, an AI section, a prompt-driven rewrite, a source edit --
 * is saved through the same endpoints and can be repeated as often as needed.
 */
export default function LandingEditorPanel({ classSlug, landing, onSaved, onPreview }: LandingEditorPanelProps) {
  const [tab, setTab] = useState<Tab>('ai');
  const [sections, setSections] = useState<LmsLandingSection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [instruction, setInstruction] = useState('');
  const [aiMode, setAiMode] = useState<AiMode>('edit');
  const [after, setAfter] = useState('');
  const [proposal, setProposal] = useState<{ html: string; baseHash: string } | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState(landing.html);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState('');

  useEffect(() => {
    lmsService
      .listLandingSections(classSlug)
      .then((r) => setSections(r.sections))
      .catch(() => setSections([]));
    setSource(landing.html);
  }, [classSlug, landing.hash, landing.html]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const placement = () => (after ? { after_section_id: after } : { position: 'end' as const });

  const generate = () =>
    run('Preview ready — review it, then Apply or Discard.', async () => {
      const r = await lmsService.landingAi(classSlug, instruction, aiMode, aiMode === 'section' ? placement() : undefined);
      setProposal({ html: r.html, baseHash: r.base_hash });
      onPreview(r.html);
    });

  const apply = () =>
    run('Applied.', async () => {
      if (!proposal) return;
      const saved = await lmsService.saveLanding(classSlug, proposal.html, proposal.baseHash);
      setProposal(null);
      setInstruction('');
      onPreview(null);
      onSaved(saved);
    });

  const discard = () => {
    setProposal(null);
    onPreview(null);
    setNotice('Discarded.');
  };

  const addManual = () =>
    run('Section added.', async () => {
      const saved = await lmsService.addLandingSection(classSlug, {
        title,
        body_html: body,
        ...placement(),
      });
      setTitle('');
      setBody('');
      onSaved(saved);
    });

  const saveSource = () =>
    run('Source saved.', async () => {
      onSaved(await lmsService.saveLanding(classSlug, source, landing.hash));
    });

  const moveSection = (id: string, move: 'up' | 'down') =>
    run('Section moved.', async () => {
      onSaved(await lmsService.updateLandingSection(classSlug, id, { move }));
    });

  const saveSectionEdit = (id: string) =>
    run('Section updated.', async () => {
      onSaved(await lmsService.updateLandingSection(classSlug, id, { html: editHtml }));
      setEditingId(null);
    });

  const removeSection = (id: string) =>
    run('Section removed.', async () => {
      onSaved(await lmsService.deleteLandingSection(classSlug, id));
    });

  const placeSelect = (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground">Place after</span>
      <select data-testid="landing-after" value={after} onChange={(e) => setAfter(e.target.value)} className={inputCls}>
        <option value="">End of page</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title || s.id} ({s.source})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <aside data-testid="landing-editor" className="w-full md:w-[360px] flex-shrink-0 border-l border-border bg-card overflow-y-auto p-3 space-y-3 text-xs">
      <div className="flex gap-1 flex-wrap">
        {(
          [
            ['ai', 'AI prompt'],
            ['manual', 'Add section'],
            ['sections', `Sections (${sections.length})`],
            ['source', 'HTML'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`landing-tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2.5 py-1 rounded-lg font-semibold border ${tab === id ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ai' && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">What should the AI do?</span>
            <select data-testid="landing-ai-mode" value={aiMode} onChange={(e) => setAiMode(e.target.value as AiMode)} className={inputCls}>
              <option value="edit">Change the current page</option>
              <option value="section">Add a new AI section</option>
              <option value="generate">Redesign the page</option>
            </select>
          </label>
          {aiMode === 'section' && placeSelect}
          <textarea
            data-testid="landing-ai-instruction"
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Add a FAQ section about prerequisites"
            className={inputCls}
          />
          <div className="flex gap-2">
            <button type="button" data-testid="landing-ai-generate" disabled={busy || instruction.trim().length < 3} onClick={generate} className={primaryBtnCls}>
              {busy ? 'Working…' : 'Preview with AI'}
            </button>
            {proposal && (
              <>
                <button type="button" data-testid="landing-ai-apply" disabled={busy} onClick={apply} className={primaryBtnCls}>
                  Apply
                </button>
                <button type="button" data-testid="landing-ai-discard" disabled={busy} onClick={discard} className={btnCls}>
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'manual' && (
        <div className="space-y-2">
          {placeSelect}
          <input data-testid="landing-manual-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section title" maxLength={200} className={inputCls} />
          <textarea data-testid="landing-manual-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="<p>Section content (HTML)</p>" className={`${inputCls} font-mono`} />
          <button type="button" data-testid="landing-manual-add" disabled={busy || !title.trim() || !body.trim()} onClick={addManual} className={primaryBtnCls}>
            Add section
          </button>
        </div>
      )}

      {tab === 'sections' && (
        <ul className="space-y-1.5" data-testid="landing-sections">
          {sections.length === 0 && <li className="text-muted-foreground">No manual or AI sections yet.</li>}
          {sections.map((s, i) => (
            <li key={s.id} data-testid={`landing-section-${s.id}`} className="rounded-lg border border-border px-2.5 py-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="flex-1 min-w-0 truncate font-medium">{s.title || s.id}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.source}</span>
                <button type="button" disabled={busy || i === 0} onClick={() => moveSection(s.id, 'up')} aria-label={`Move ${s.title || s.id} up`} className={btnCls}>
                  ↑
                </button>
                <button type="button" disabled={busy || i === sections.length - 1} onClick={() => moveSection(s.id, 'down')} aria-label={`Move ${s.title || s.id} down`} className={btnCls}>
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(editingId === s.id ? null : s.id);
                    setEditHtml(s.html);
                  }}
                  aria-label={`Edit ${s.title || s.id}`}
                  className={btnCls}
                >
                  Edit
                </button>
                <button type="button" disabled={busy} onClick={() => removeSection(s.id)} aria-label={`Remove ${s.title || s.id}`} className={btnCls}>
                  Remove
                </button>
              </div>
              {editingId === s.id && (
                <div className="space-y-1.5">
                  <textarea data-testid="landing-section-edit" rows={8} value={editHtml} onChange={(e) => setEditHtml(e.target.value)} spellCheck={false} className={`${inputCls} font-mono`} />
                  <div className="flex gap-2">
                    <button type="button" data-testid="landing-section-save" disabled={busy || !editHtml.trim() || editHtml === s.html} onClick={() => saveSectionEdit(s.id)} className={primaryBtnCls}>
                      Save section
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className={btnCls}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'source' && (
        <div className="space-y-2">
          <textarea data-testid="landing-source" rows={16} value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} className={`${inputCls} font-mono`} />
          <button type="button" data-testid="landing-source-save" disabled={busy || source === landing.html} onClick={saveSource} className={primaryBtnCls}>
            Save HTML
          </button>
        </div>
      )}

      {error && <p data-testid="landing-error" role="alert" className="text-red-500">{error}</p>}
      {notice && !error && <p data-testid="landing-notice" className="text-muted-foreground">{notice}</p>}
    </aside>
  );
}
