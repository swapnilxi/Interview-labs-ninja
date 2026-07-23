'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  linkedinService,
  type LinkedInCategory,
  type LinkedInTemplate,
  type RefineAction,
} from '@/lib/services/linkedinService';
import TemplateLibraryModule from './TemplateLibraryModule';

const TONE_OPTIONS = [
  'Professional',
  'Conversational',
  'Storytelling',
  'Educational',
  'Inspirational',
  'Analytical',
  'Bold',
  'Thought Leadership',
  'Casual',
  'Humorous',
  'Custom',
];

const POST_TYPE_OPTIONS = [
  'Story Post',
  'Educational Post',
  'List Post',
  'Achievement Post',
  'Launch Announcement',
  'Personal Experience',
  'Contrarian Opinion',
  'Technical Explanation',
  'Case Study',
  'Lessons Learned',
  'Career Update',
  'Thought Leadership',
];

const inputClass =
  'w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth';

const REFINE_LABELS: Record<RefineAction, string> = {
  improve_hook: 'Improve Hook',
  shorten: 'Shorten',
  expand: 'Expand',
  change_tone: 'Change Tone',
};

const IDEAL_MIN = 1300;
const IDEAL_MAX = 2000;
const LINKEDIN_LIMIT = 3000;

function lengthGuidance(chars: number): { label: string; className: string } {
  if (chars === 0) return { label: '', className: 'text-muted-foreground' };
  if (chars > LINKEDIN_LIMIT) return { label: 'Over LinkedIn’s limit', className: 'text-destructive' };
  if (chars >= IDEAL_MIN && chars <= IDEAL_MAX) return { label: 'Ideal length for engagement', className: 'text-emerald-500' };
  if (chars < IDEAL_MIN) return { label: 'Could go longer for more reach', className: 'text-amber-500' };
  return { label: 'Longer than ideal — consider tightening', className: 'text-amber-500' };
}

function TemplateMultiSelect({
  templates,
  selectedIds,
  onChange,
}: {
  templates: LinkedInTemplate[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selected = templates.filter((t) => selectedIds.includes(t.id));

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${inputClass} flex items-center justify-between text-left`}
      >
        <span className="truncate text-muted-foreground">
          {selected.length === 0 ? 'Select templates…' : `${selected.length} template${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <Icon name="ChevronDownIcon" size={14} variant="outline" className="flex-shrink-0 text-muted-foreground" />
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((tpl) => (
            <span
              key={tpl.id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              {tpl.title}
              <button
                type="button"
                onClick={() => toggle(tpl.id)}
                aria-label={`Remove ${tpl.title}`}
                className="text-muted-foreground hover:text-destructive transition-smooth"
              >
                <Icon name="XMarkIcon" size={11} variant="outline" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto scrollbar-clean rounded-md border border-border bg-card shadow-lg">
          {templates.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No templates yet — create one in the library.</p>
          ) : (
            templates.map((tpl) => (
              <label
                key={tpl.id}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(tpl.id)}
                  onChange={() => toggle(tpl.id)}
                  className="accent-primary"
                />
                <span className="truncate">{tpl.title}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function LinkedInPostGeneratorModule() {
  const [pageTab, setPageTab] = useState<'generate' | 'templates'>('generate');
  const [topic, setTopic] = useState('');

  const [categories, setCategories] = useState<LinkedInCategory[]>([]);
  const [category, setCategory] = useState('');
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState('');
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tone, setTone] = useState(TONE_OPTIONS[0]);
  const [customTone, setCustomTone] = useState('');
  const [postType, setPostType] = useState(POST_TYPE_OPTIONS[0]);

  const [templates, setTemplates] = useState<LinkedInTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  const [generating, setGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState('');
  const [postHistory, setPostHistory] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [refiningAction, setRefiningAction] = useState<RefineAction | 'alternative' | null>(null);

  const effectiveTone = tone === 'Custom' ? customTone.trim() : tone;

  const refreshTemplates = () => {
    linkedinService.getTemplates().then(setTemplates);
  };

  useEffect(() => {
    linkedinService.getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setCategory((prev) => prev || cats[0].name);
    });
    refreshTemplates();
  }, []);

  const refreshCategories = async () => {
    const cats = await linkedinService.getCategories();
    setCategories(cats);
  };

  const handleAddCategory = async () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      await linkedinService.addCategory(name);
      setNewCategoryInput('');
      await refreshCategories();
    } catch (err) {
      console.error('Failed to add category:', err);
    } finally {
      setAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    setDeletingCategoryId(id);
    try {
      await linkedinService.deleteCategory(id);
      await refreshCategories();
    } catch (err) {
      console.error('Failed to delete category:', err);
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handlePdfSelect = async (file: File | null) => {
    if (!file) return;
    setPdfFile(file);
    setPdfError('');
    setExtractingPdf(true);
    try {
      const text = await linkedinService.extractPdf(file);
      setPdfText(text);
    } catch (err) {
      setPdfError('Could not extract text from this PDF.');
      setPdfFile(null);
      setPdfText('');
    } finally {
      setExtractingPdf(false);
    }
  };

  const clearPdf = () => {
    setPdfFile(null);
    setPdfText('');
    setPdfError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pushHistory = () => {
    setPostHistory((prev) => (generatedPost ? [...prev, generatedPost].slice(-10) : prev));
  };

  const runGenerate = async (variation = false) => {
    if (!topic.trim()) return;
    pushHistory();
    setGenerating(true);
    setGenerateError('');
    try {
      const post = await linkedinService.generatePost({
        topic: topic.trim(),
        category: category || undefined,
        tone: effectiveTone || undefined,
        postType,
        templateIds: selectedTemplateIds,
        context: context.trim() || undefined,
        pdfText: pdfText.trim() || undefined,
        variation,
      });
      setGeneratedPost(post);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate post.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async (action: RefineAction) => {
    if (!generatedPost) return;
    pushHistory();
    setRefiningAction(action);
    setGenerateError('');
    try {
      const post = await linkedinService.refinePost(generatedPost, action, effectiveTone || undefined);
      setGeneratedPost(post);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to refine post.');
    } finally {
      setRefiningAction(null);
    }
  };

  const handleGenerateAlternative = async () => {
    setRefiningAction('alternative');
    await runGenerate(true);
    setRefiningAction(null);
  };

  const handleUndo = () => {
    setPostHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setGeneratedPost(prev[prev.length - 1]);
      return next;
    });
  };

  const handleCopy = async () => {
    if (!generatedPost) return;
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    if (!generatedPost) return;
    const title = window.prompt('Save this post as a template — name it:', topic.slice(0, 40) || 'My post');
    if (!title) return;
    await linkedinService.addTemplate({ type: 'reference_post', title, content: generatedPost });
    refreshTemplates();
    setSaveStatus('Saved to templates');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 self-start">
        <button
          type="button"
          onClick={() => setPageTab('generate')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-smooth ${
            pageTab === 'generate'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="SparklesIcon" size={15} variant="outline" />
          Generate
        </button>
        <button
          type="button"
          onClick={() => setPageTab('templates')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-smooth ${
            pageTab === 'templates'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="ArchiveBoxIcon" size={15} variant="outline" />
          Templates
          {templates.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {pageTab === 'templates' ? (
        <TemplateLibraryModule onTemplatesChanged={refreshTemplates} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Left panel: configuration ── */}
        <div className="flex flex-col gap-6">
          <div className="lab-card p-5">
            <label htmlFor="topic" className="block text-sm font-medium text-foreground mb-2">
              What&apos;s your post about?
            </label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Share my experience building an AI-powered CFO assistant during a national hackathon."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="lab-card p-5">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="category" className="block text-sm font-medium text-foreground">
                Category
              </label>
              <button
                type="button"
                onClick={() => setManageCategoriesOpen((prev) => !prev)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-smooth"
              >
                <Icon name="Cog6ToothIcon" size={14} variant="outline" />
                Manage
              </button>
            </div>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            {manageCategoriesOpen && (
              <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {categories.map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                    >
                      {cat.name}
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        disabled={deletingCategoryId === cat.id}
                        aria-label={`Delete ${cat.name}`}
                        className="text-muted-foreground hover:text-destructive transition-smooth disabled:opacity-40"
                      >
                        <Icon name="XMarkIcon" size={12} variant="outline" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    placeholder="New category…"
                    className="flex-1 min-w-0 rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground focus-ring"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={addingCategory || !newCategoryInput.trim()}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-smooth disabled:opacity-50"
                  >
                    {addingCategory ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lab-card p-5">
            <button
              type="button"
              onClick={() => setContextOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-sm font-medium text-foreground"
            >
              <span>Add Context &amp; References</span>
              <Icon name={contextOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={16} variant="outline" />
            </button>

            {contextOpen && (
              <div className="mt-3">
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Add notes, paste a reference post, or any relevant background…"
                  rows={4}
                  className={`${inputClass} resize-none`}
                />

                <div className="mt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => handlePdfSelect(e.target.files?.[0] || null)}
                  />
                  {pdfFile ? (
                    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground">
                      <Icon name="DocumentTextIcon" size={14} variant="outline" />
                      {pdfFile.name}
                      {extractingPdf && <span className="text-muted-foreground">extracting…</span>}
                      <button
                        type="button"
                        onClick={clearPdf}
                        aria-label="Remove PDF"
                        className="text-muted-foreground hover:text-destructive transition-smooth"
                      >
                        <Icon name="XMarkIcon" size={12} variant="outline" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
                    >
                      <Icon name="PaperClipIcon" size={14} variant="outline" />
                      Upload PDF
                    </button>
                  )}
                  {pdfError && <p className="mt-1.5 text-xs text-destructive">{pdfError}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="lab-card p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">Style</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tone" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Tone
                </label>
                <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className={inputClass}>
                  {TONE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {tone === 'Custom' && (
                  <input
                    value={customTone}
                    onChange={(e) => setCustomTone(e.target.value)}
                    placeholder="Describe the tone…"
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>
              <div>
                <label htmlFor="postType" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Post Type
                </label>
                <select id="postType" value={postType} onChange={(e) => setPostType(e.target.value)} className={inputClass}>
                  {POST_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-muted-foreground">Select Templates</label>
                <button
                  type="button"
                  onClick={() => setPageTab('templates')}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80 transition-smooth"
                >
                  Manage Template Library
                  <Icon name="ArrowTopRightOnSquareIcon" size={11} variant="outline" />
                </button>
              </div>
              <TemplateMultiSelect
                templates={templates}
                selectedIds={selectedTemplateIds}
                onChange={setSelectedTemplateIds}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => runGenerate(false)}
            disabled={generating || !topic.trim()}
            className="w-full rounded-md bg-gradient-to-r from-violet-600 to-primary px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-smooth hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Icon name="SparklesIcon" size={18} variant="outline" />
            {generating ? 'Generating…' : 'Generate Post'}
          </button>
        </div>

        {/* ── Right panel: generated output ── */}
        <div className="lab-card p-5 lg:sticky lg:top-[76px]">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-medium text-foreground">Generated Post</h3>
            {generatedPost && (
              <div className="flex items-center gap-3">
                {saveStatus && (
                  <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                    <Icon name="CheckCircleIcon" size={13} variant="outline" />
                    {saveStatus}
                  </span>
                )}
                <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('edit')}
                    className={`rounded px-2 py-1 text-xs font-medium transition-smooth ${
                      viewMode === 'edit' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    className={`rounded px-2 py-1 text-xs font-medium transition-smooth ${
                      viewMode === 'preview' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Preview
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 transition-smooth"
                >
                  <Icon name={copied ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={14} variant="outline" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {generateError && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {generateError}
            </div>
          )}

          {generating && !generatedPost ? (
            <div className="flex flex-col gap-2 animate-pulse" aria-label="Generating post…">
              <div className="h-4 rounded bg-muted w-5/6" />
              <div className="h-4 rounded bg-muted w-full" />
              <div className="h-4 rounded bg-muted w-full" />
              <div className="h-4 rounded bg-muted w-2/3" />
              <div className="h-4 rounded bg-muted w-full mt-3" />
              <div className="h-4 rounded bg-muted w-4/5" />
              <div className="h-4 rounded bg-muted w-3/5" />
            </div>
          ) : !generatedPost ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Icon name="DocumentTextIcon" size={32} variant="outline" />
              <p className="text-sm">Your generated post will appear here.</p>
            </div>
          ) : (
            <>
              {viewMode === 'edit' ? (
                <textarea
                  value={generatedPost}
                  onChange={(e) => setGeneratedPost(e.target.value)}
                  rows={14}
                  className={`${inputClass} resize-y font-body`}
                />
              ) : (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="flex items-center gap-2.5 p-3.5 pb-2.5">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-primary text-sm font-semibold text-white">
                      <Icon name="UserIcon" size={20} variant="solid" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">Your Name</p>
                      <p className="text-xs text-muted-foreground">Your headline · Now</p>
                    </div>
                  </div>
                  <p className="px-3.5 pb-3.5 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {generatedPost}
                  </p>
                  <div className="flex items-center gap-5 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Icon name="HandThumbUpIcon" size={15} variant="outline" />
                      Like
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="ChatBubbleLeftIcon" size={15} variant="outline" />
                      Comment
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="ArrowPathRoundedSquareIcon" size={15} variant="outline" />
                      Repost
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="PaperAirplaneIcon" size={15} variant="outline" />
                      Send
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={lengthGuidance(generatedPost.length).className}>
                  {lengthGuidance(generatedPost.length).label}
                </span>
                <span className="text-muted-foreground">{generatedPost.length.toLocaleString()} characters</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-smooth"
                >
                  Save
                </button>
                {postHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-smooth"
                  >
                    <Icon name="ArrowUturnLeftIcon" size={12} variant="outline" />
                    Undo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runGenerate(false)}
                  disabled={generating}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-50"
                >
                  {generating ? '…' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAlternative}
                  disabled={refiningAction === 'alternative'}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-50"
                >
                  {refiningAction === 'alternative' ? '…' : 'Generate Alternative'}
                </button>
                {(Object.keys(REFINE_LABELS) as RefineAction[]).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleRefine(action)}
                    disabled={refiningAction === action}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-smooth disabled:opacity-50"
                  >
                    {refiningAction === action ? '…' : REFINE_LABELS[action]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
