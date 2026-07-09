'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  linkedinService,
  type LinkedInTemplate,
  type LinkedInTemplateType,
} from '@/lib/services/linkedinService';

const TYPE_META: Record<LinkedInTemplateType, { label: string; badgeClass: string }> = {
  prompt: { label: 'Prompt Template', badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  reference_post: { label: 'Reference Post', badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  creator_post: { label: 'Creator Post', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  writing_style: { label: 'AI Writing Style', badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  post_structure: { label: 'Post Structure', badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
  custom: { label: 'Custom Template', badgeClass: 'bg-muted text-muted-foreground' },
};

const TABS: Array<{ key: LinkedInTemplateType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'prompt', label: 'Prompt' },
  { key: 'reference_post', label: 'Reference Post' },
  { key: 'creator_post', label: 'Creator Post' },
  { key: 'writing_style', label: 'Writing Style' },
  { key: 'post_structure', label: 'Structure' },
  { key: 'custom', label: 'Custom' },
];

const inputClass =
  'w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring transition-smooth';

interface SaveDraft {
  type: LinkedInTemplateType;
  title: string;
  description: string;
  tags: string;
  content: string;
  styleAnalysis?: string;
}

interface TemplateLibraryModuleProps {
  onTemplatesChanged?: () => void;
}

export default function TemplateLibraryModule({ onTemplatesChanged }: TemplateLibraryModuleProps) {
  const [activeTab, setActiveTab] = useState<LinkedInTemplateType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [templates, setTemplates] = useState<LinkedInTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string; tags: string; content: string } | null>(null);

  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<SaveDraft>({ type: 'prompt', title: '', description: '', tags: '', content: '' });

  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<Awaited<ReturnType<typeof linkedinService.analyzePost>> | null>(null);
  const [saveDraft, setSaveDraft] = useState<SaveDraft | null>(null);
  const [saveOriginalAs, setSaveOriginalAs] = useState<'reference_post' | 'creator_post'>('creator_post');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await linkedinService.getTemplates({
        type: activeTab === 'all' ? undefined : activeTab,
        search: searchQuery || undefined,
        favoritesOnly,
      });
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, favoritesOnly]);

  useEffect(() => {
    const timeout = setTimeout(refresh, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const notifyChanged = () => {
    onTemplatesChanged?.();
    refresh();
  };

  const flash = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 2500);
  };

  // ── Template CRUD ──────────────────────────────────────────────────────────

  const startEdit = (tpl: LinkedInTemplate) => {
    setEditingId(tpl.id);
    setEditDraft({
      title: tpl.title,
      description: tpl.description || '',
      tags: tpl.tags.join(', '),
      content: tpl.content,
    });
  };

  const saveEdit = async () => {
    if (editingId === null || !editDraft) return;
    await linkedinService.updateTemplate(editingId, {
      title: editDraft.title,
      description: editDraft.description,
      tags: editDraft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      content: editDraft.content,
    });
    setEditingId(null);
    setEditDraft(null);
    flash('Template updated');
    notifyChanged();
  };

  const toggleFavorite = async (tpl: LinkedInTemplate) => {
    await linkedinService.updateTemplate(tpl.id, { isFavorite: !tpl.isFavorite });
    notifyChanged();
  };

  const handleDuplicate = async (id: number) => {
    await linkedinService.duplicateTemplate(id);
    flash('Template duplicated');
    notifyChanged();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    await linkedinService.deleteTemplate(id);
    flash('Template deleted');
    notifyChanged();
  };

  const submitNewTemplate = async () => {
    if (!newDraft.title.trim() || !newDraft.content.trim()) return;
    await linkedinService.addTemplate({
      type: newDraft.type,
      title: newDraft.title.trim(),
      description: newDraft.description.trim() || undefined,
      content: newDraft.content.trim(),
      tags: newDraft.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setCreating(false);
    setNewDraft({ type: 'prompt', title: '', description: '', tags: '', content: '' });
    flash('Template created');
    notifyChanged();
  };

  // ── Analyzer ───────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!analyzeText.trim()) return;
    setAnalyzing(true);
    setAnalyzeError('');
    setAnalyzeResult(null);
    try {
      const result = await linkedinService.analyzePost(analyzeText.trim());
      setAnalyzeResult(result);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Failed to analyze post.');
    } finally {
      setAnalyzing(false);
    }
  };

  const openSaveOriginal = () => {
    setSaveDraft({
      type: saveOriginalAs,
      title: analyzeText.slice(0, 48).trim() || 'Untitled post',
      description: '',
      tags: '',
      content: analyzeText.trim(),
    });
  };

  const openSaveStylePrompt = () => {
    if (!analyzeResult) return;
    setSaveDraft({
      type: 'writing_style',
      title: `Style: ${analyzeText.slice(0, 36).trim() || 'Untitled'}`,
      description: '',
      tags: '',
      content: analyzeResult.stylePrompt,
      styleAnalysis: JSON.stringify(analyzeResult.analysis),
    });
  };

  const handleSaveBoth = async () => {
    if (!analyzeResult) return;
    setSavingTemplate(true);
    try {
      const base = analyzeText.slice(0, 36).trim() || 'Untitled';
      await linkedinService.addTemplate({
        type: saveOriginalAs,
        title: `${base} — Post`,
        content: analyzeText.trim(),
      });
      await linkedinService.addTemplate({
        type: 'writing_style',
        title: `${base} — Style`,
        content: analyzeResult.stylePrompt,
        styleAnalysis: JSON.stringify(analyzeResult.analysis),
      });
      flash('Saved both as templates');
      notifyChanged();
    } finally {
      setSavingTemplate(false);
    }
  };

  const confirmSaveDraft = async () => {
    if (!saveDraft) return;
    setSavingTemplate(true);
    try {
      await linkedinService.addTemplate({
        type: saveDraft.type,
        title: saveDraft.title.trim() || 'Untitled',
        description: saveDraft.description.trim() || undefined,
        content: saveDraft.content,
        styleAnalysis: saveDraft.styleAnalysis,
        tags: saveDraft.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setSaveDraft(null);
      flash('Saved as template');
      notifyChanged();
    } finally {
      setSavingTemplate(false);
    }
  };

  const analysisEntries = useMemo(
    () =>
      analyzeResult
        ? (Object.entries(analyzeResult.analysis) as [string, string][]).filter(([, v]) => v)
        : [],
    [analyzeResult]
  );

  return (
    <div className="flex flex-col gap-6">
      {statusMessage && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Analyzer */}
      <div className="lab-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="SparklesIcon" size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Analyze Post with AI</h3>
        </div>
        <label htmlFor="analyzeText" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Paste a LinkedIn post to analyze
        </label>
        <textarea
          id="analyzeText"
          value={analyzeText}
          onChange={(e) => setAnalyzeText(e.target.value)}
          rows={5}
          placeholder="Paste any LinkedIn post here…"
          className={`${inputClass} resize-none`}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !analyzeText.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-smooth disabled:opacity-50"
          >
            <Icon name="MagnifyingGlassIcon" size={15} variant="outline" />
            {analyzing ? 'Analyzing…' : 'Analyze Writing Style'}
          </button>
          {analyzeText.trim() && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Save original as
              <select
                value={saveOriginalAs}
                onChange={(e) => setSaveOriginalAs(e.target.value as 'reference_post' | 'creator_post')}
                className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground focus-ring"
              >
                <option value="creator_post">Creator Post</option>
                <option value="reference_post">Reference Post</option>
              </select>
              <button
                type="button"
                onClick={openSaveOriginal}
                className="text-primary font-medium hover:opacity-80 transition-smooth"
              >
                Save Original Post
              </button>
            </div>
          )}
        </div>

        {analyzeError && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {analyzeError}
          </div>
        )}

        {analyzeResult && (
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                1. Original Post
              </h4>
              <p className="text-sm text-foreground whitespace-pre-wrap rounded-md bg-muted/40 p-3">{analyzeText}</p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                2. AI Writing Analysis
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysisEntries.map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold text-primary mb-1 capitalize">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  3. Generated Style Prompt
                </h4>
                <button
                  type="button"
                  onClick={openSaveStylePrompt}
                  className="text-xs font-medium text-primary hover:opacity-80 transition-smooth"
                >
                  Save Style Prompt
                </button>
              </div>
              <textarea
                value={analyzeResult.stylePrompt}
                onChange={(e) => setAnalyzeResult({ ...analyzeResult, stylePrompt: e.target.value })}
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveBoth}
                disabled={savingTemplate}
                className="rounded-md border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-smooth disabled:opacity-50"
              >
                Save Both
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save draft editor */}
      {saveDraft && (
        <div className="lab-card p-5 border-primary/40">
          <h3 className="text-sm font-semibold text-foreground mb-3">Save as Template</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <input
                value={saveDraft.title}
                onChange={(e) => setSaveDraft({ ...saveDraft, title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
              <input
                value={saveDraft.description}
                onChange={(e) => setSaveDraft({ ...saveDraft, description: e.target.value })}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tags (comma separated)</label>
              <input
                value={saveDraft.tags}
                onChange={(e) => setSaveDraft({ ...saveDraft, tags: e.target.value })}
                placeholder="e.g. hackathon, technical"
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmSaveDraft}
                disabled={savingTemplate}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-smooth disabled:opacity-50"
              >
                {savingTemplate ? 'Saving…' : 'Save Template'}
              </button>
              <button
                type="button"
                onClick={() => setSaveDraft(null)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-smooth"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library list */}
      <div className="lab-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-foreground">Templates</h3>
          <button
            type="button"
            onClick={() => setCreating((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 transition-smooth"
          >
            <Icon name="PlusIcon" size={14} variant="outline" />
            New Template
          </button>
        </div>

        {creating && (
          <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={newDraft.type}
                onChange={(e) => setNewDraft({ ...newDraft, type: e.target.value as LinkedInTemplateType })}
                className={inputClass}
              >
                {(Object.keys(TYPE_META) as LinkedInTemplateType[]).map((key) => (
                  <option key={key} value={key}>
                    {TYPE_META[key].label}
                  </option>
                ))}
              </select>
              <input
                value={newDraft.title}
                onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
                placeholder="Name"
                className={inputClass}
              />
            </div>
            <input
              value={newDraft.description}
              onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })}
              placeholder="Description (optional)"
              className={inputClass}
            />
            <textarea
              value={newDraft.content}
              onChange={(e) => setNewDraft({ ...newDraft, content: e.target.value })}
              placeholder="Template content…"
              rows={4}
              className={`${inputClass} resize-none`}
            />
            <input
              value={newDraft.tags}
              onChange={(e) => setNewDraft({ ...newDraft, tags: e.target.value })}
              placeholder="Tags, comma separated"
              className={inputClass}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitNewTemplate}
                disabled={!newDraft.title.trim() || !newDraft.content.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-smooth disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-smooth"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-smooth ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Icon
              name="MagnifyingGlassIcon"
              size={14}
              variant="outline"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates…"
              className={`${inputClass} pl-8`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFavoritesOnly((prev) => !prev)}
            className={`flex-shrink-0 rounded-md border px-2.5 py-2 transition-smooth ${
              favoritesOnly
                ? 'border-amber-400 bg-amber-400/10 text-amber-500'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Show favorites only"
            title="Favorites only"
          >
            <Icon name="StarIcon" size={16} variant={favoritesOnly ? 'solid' : 'outline'} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading templates…</p>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="ArchiveBoxIcon" size={28} className="text-muted-foreground" variant="outline" />
            <p className="text-sm text-muted-foreground">No templates yet. Analyze a post or create one above.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-md border border-border bg-card p-3">
                {editingId === tpl.id && editDraft ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      className={inputClass}
                    />
                    <input
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      placeholder="Description"
                      className={inputClass}
                    />
                    <textarea
                      value={editDraft.content}
                      onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })}
                      rows={4}
                      className={`${inputClass} resize-none`}
                    />
                    <input
                      value={editDraft.tags}
                      onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value })}
                      placeholder="Tags, comma separated"
                      className={inputClass}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-smooth"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditDraft(null); }}
                        className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-smooth"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_META[tpl.type].badgeClass}`}>
                            {TYPE_META[tpl.type].label}
                          </span>
                          <h4 className="text-sm font-medium text-foreground truncate">{tpl.title}</h4>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                        )}
                        {tpl.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tpl.tags.map((tag) => (
                              <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(tpl)}
                          aria-label="Toggle favorite"
                          className={tpl.isFavorite ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'}
                        >
                          <Icon name="StarIcon" size={15} variant={tpl.isFavorite ? 'solid' : 'outline'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                          aria-label="Preview"
                          className="text-muted-foreground hover:text-foreground transition-smooth"
                        >
                          <Icon name={expandedId === tpl.id ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={15} variant="outline" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(tpl)}
                          aria-label="Edit"
                          className="text-muted-foreground hover:text-foreground transition-smooth"
                        >
                          <Icon name="PencilSquareIcon" size={15} variant="outline" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(tpl.id)}
                          aria-label="Duplicate"
                          className="text-muted-foreground hover:text-foreground transition-smooth"
                        >
                          <Icon name="DocumentDuplicateIcon" size={15} variant="outline" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl.id)}
                          aria-label="Delete"
                          className="text-muted-foreground hover:text-destructive transition-smooth"
                        >
                          <Icon name="TrashIcon" size={15} variant="outline" />
                        </button>
                      </div>
                    </div>
                    {expandedId === tpl.id && (
                      <p className="mt-2.5 rounded-md bg-muted/40 p-2.5 text-xs text-foreground whitespace-pre-wrap">
                        {tpl.content}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
