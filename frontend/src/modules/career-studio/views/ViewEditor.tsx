'use client';

/**
 * View editor for a resume/portfolio "view" — a live rendering of a chosen
 * Master Profile with a template. Controls (left): profile dropdown + edit
 * pencil, template picker, per-section show/hide + reorder, publish. Canvas
 * (right) has two modes, toggled from the toolbar:
 *  - Edit (default): the same profile-content editor ProfileEditorModal uses
 *    (ResumeEditor — add/edit/reorder/delete sections), embedded inline
 *    instead of behind a modal, so content editing happens directly on this
 *    page, Wix/Webflow-style, rather than requiring a trip to a separate
 *    editor. Section add/delete here refreshes this view's own sidebar list.
 *  - Preview: the real rendering a visitor would see — resumes get an iframe
 *    of the backend-rendered HTML (identical to the export — resumes have no
 *    live-component renderer); portfolios render the real
 *    PortfolioWidgetsView component directly, matching the published page
 *    exactly (Modern3D's Three.js/GSAP hero included) instead of a static
 *    fallback. Note: Modern3D's scroll-progress bar and horizontal
 *    project-rail pin assume the whole window scrolls, so those two effects
 *    specifically (not the rest of the page) can look slightly off inside
 *    this pane's own scroll container — cosmetic only, the published page
 *    scrolls normally.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { viewsService } from '@/lib/services/viewsService';
import { templatesService } from '@/lib/services/templatesService';
import { portfolioService } from '@/lib/services/portfolioService';
import { ACCENTS, PORTFOLIO_STYLE_TEMPLATES, type AnalyticsSummaryEntry, type CareerTemplate, type CareerView, type PortfolioPreviewData, type PublishHistoryEntry, type Resume, type TestimonialSubmission } from '../shared/types';
import { downloadBlob, printHtmlBlob } from '../shared/exportUtils';
import AnalysisPanel from '../resume/AnalysisPanel';
import ViewTailorPanel from './ViewTailorPanel';
import ProfileSelector from '../profile/ProfileSelector';
import ProfileEditorModal from '../profile/ProfileEditorModal';
import TemplateDesigner from '../templates-designer/TemplateDesigner';
import { TemplatePickerCard } from '../templates-designer/TemplatePreviewThumb';
import { openProfileEditor } from '../profile/profileEditorStore';
import { LIST as RESUME_TEMPLATES } from '../resume/templates';
import PortfolioWidgetsView from '../portfolio/PortfolioWidgetsView';
import { useResumeStore } from '../resume/store/resumeStore';
import ResumeEditor from '../resume/ResumeEditor';
import { setActiveProfile } from '../shared/activeProfileStore';

const SECTION_LABEL: Record<string, string> = {
  personal_info: 'Personal Info', summary: 'Summary', experience: 'Experience', education: 'Education',
  skills: 'Skills', projects: 'Projects', certifications: 'Certifications', awards: 'Awards',
  achievements: 'Achievements', research: 'Research', languages: 'Languages', volunteer: 'Volunteer', custom: 'Custom',
  grid: 'Grid', columns: 'Columns', row: 'Row', blank: 'Blank',
};

/** Slug for the `?template=` URL mirror below — a template's name reads better
 * in a shared URL than its raw id (a UUID for user-designed templates). */
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
}

function SortableSectionRow({ id, hidden, children }: { id: string; hidden?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 bg-card ${hidden ? 'border-border opacity-55' : 'border-border'}`}>
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground hover:text-foreground touch-none" title="Drag to reorder" aria-label="Drag to reorder">
        <Icon name="Bars2Icon" size={14} />
      </button>
      {children}
    </div>
  );
}

export default function ViewEditor({ viewId }: { viewId: string }) {
  const router = useRouter();
  const [view, setView] = useState<CareerView | null>(null);
  const [profiles, setProfiles] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [portfolioPreview, setPortfolioPreview] = useState<PortfolioPreviewData | null>(null);
  const [publishInfo, setPublishInfo] = useState<{ slug: string; is_public: boolean; view_count: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [showPublishPopover, setShowPublishPopover] = useState(false);
  const publishPopoverRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PublishHistoryEntry[]>([]);
  const [stats, setStats] = useState<AnalyticsSummaryEntry | null>(null);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [testimonials, setTestimonials] = useState<TestimonialSubmission[]>([]);
  const [testimonialsLoading, setTestimonialsLoading] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CareerTemplate[]>([]);
  const [designerTemplate, setDesignerTemplate] = useState<CareerTemplate | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const lastUrl = useRef<string | null>(null);

  const isPortfolio = view?.kind === 'portfolio';
  const fallbackTemplates = isPortfolio ? PORTFOLIO_STYLE_TEMPLATES.map((t) => ({ id: t.id, name: t.name })) : RESUME_TEMPLATES;
  const templates = customTemplates.length ? customTemplates : fallbackTemplates;

  // Drives the inline "Edit" canvas below — the same profile-editing store
  // ProfileEditorModal uses, just embedded directly instead of behind a modal.
  const loadProfileIntoEditor = useResumeStore((s) => s.load);
  const editedResume = useResumeStore((s) => s.resume);

  // View-scoped AI: analyze/tailor operate on this view's visible sections and
  // (for tailor) write back to the underlying profile. Stable identities so the
  // AnalysisPanel effect doesn't re-fire.
  const analyzeView = useCallback((jd?: string) => viewsService.analyze(viewId, jd), [viewId]);
  const getViewAnalysis = useCallback(() => viewsService.getAnalysis(viewId), [viewId]);

  // Portfolios render the live PortfolioWidgetsView component (fed real data
  // from the backend) instead of an iframe of static HTML — kind is passed in
  // by each caller rather than read from `view` state, since that callback
  // would otherwise close over a stale kind on the very first load.
  const refreshPreview = useCallback(async (id: string, kind: 'resume' | 'portfolio') => {
    if (kind === 'portfolio') {
      try {
        setPortfolioPreview(await viewsService.getPortfolioPreview(id));
      } catch {
        /* preview best-effort */
      }
      return;
    }
    try {
      const blob = await viewsService.exportBlob(id, 'html');
      const url = URL.createObjectURL(blob);
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = url;
      setPreviewUrl(url);
    } catch {
      /* preview best-effort */
    }
  }, []);

  const applyAnalysisFix = useCallback(
    async (fix: { section_id: string; title?: string | null; content: any }) => {
      await viewsService.applyTailor(viewId, { updates: [fix], mode: 'in_place', jobLabel: 'AI Analyzer fix' });
      if (view) await refreshPreview(viewId, view.kind);
    },
    [viewId, refreshPreview, view?.kind],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, ps] = await Promise.all([viewsService.get(viewId), careerService.listProfiles()]);
      setView(v);
      setProfiles(ps);
      // The template picker offers the user's own templates for this kind
      // (built-in presets are seeded there too); best-effort.
      templatesService
        .list(v.kind)
        .then(setCustomTemplates)
        .catch(() => {});
      await refreshPreview(viewId, v.kind);
      const st = (await viewsService.getPublishStatus(viewId)) as any;
      setPublishInfo(st && st.slug ? st : null);
      setSlugInput(st?.slug || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [viewId, refreshPreview]);

  useEffect(() => {
    void load();
    return () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    };
  }, [load]);

  // Mirror the current template into a `?template=` query param so the URL
  // alone identifies which template a view is using — updates on load and
  // whenever the template is switched from the picker below. Uses the
  // template's name (slugified), not its raw id — built-in ids read fine
  // on their own ("modern3d") but a user-designed template's id is a UUID,
  // meaningless in a shared URL.
  useEffect(() => {
    if (!view?.template || typeof window === 'undefined') return;
    const label = templates.find((t) => t.id === view.template)?.name || view.template;
    const slug = slugify(label);
    const params = new URLSearchParams(window.location.search);
    if (params.get('template') === slug) return;
    params.set('template', slug);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }, [view?.template, templates, router]);

  // Hydrate the inline profile editor whenever the view's profile changes —
  // same store ProfileEditorModal uses, so edits made here or there stay in sync.
  useEffect(() => {
    if (!view?.profile_id) return;
    void loadProfileIntoEditor(view.profile_id);
    setActiveProfile({ id: view.profile_id, title: view.profile_title });
  }, [view?.profile_id, view?.profile_title, loadProfileIntoEditor]);

  useEffect(() => {
    if (!showPublishPopover) return;
    const onClickOutside = (e: MouseEvent) => {
      if (publishPopoverRef.current && !publishPopoverRef.current.contains(e.target as Node)) setShowPublishPopover(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showPublishPopover]);

  const patch = useCallback(
    async (fields: Parameters<typeof viewsService.update>[1], skipPreview = false) => {
      const updated = await viewsService.update(viewId, fields);
      setView(updated);
      if (!skipPreview) await refreshPreview(viewId, updated.kind);
    },
    [viewId, refreshPreview],
  );

  // The sidebar's Sections list (and the published portfolio, which resolves
  // through the same backend function) order by the VIEW's own config, not
  // the profile's live order — resolve_sections() only preserves order for
  // sections already known to that config; anything new just gets appended
  // after whatever was last configured, regardless of where it actually landed
  // in the profile. So any add/delete/reorder happening in the inline editor
  // (add-section, insert-between, or SectionManager's own drag-reorder) has to
  // resync the view's config to the profile's true order — otherwise inserting
  // a section "between two sections" here would visibly land somewhere else in
  // the sidebar and on the live page. Comparing full id+order (not just count)
  // catches reordering too, not just add/delete.
  useEffect(() => {
    if (!editedResume || editedResume.id !== view?.profile_id || !view?.sections) return;
    const profileIds = editedResume.sections.map((s) => s.id).join(',');
    const viewIds = view.sections.map((s) => s.id).join(',');
    if (profileIds === viewIds) return;
    const hiddenById = new Map(view.sections.map((s) => [s.id, s.hidden]));
    const items = editedResume.sections.map((s) => ({ section_id: s.id, hidden: hiddenById.get(s.id) ?? false }));
    void patch({ config: { items } }, true);
  }, [editedResume, view?.profile_id, view?.sections, patch]);

  const commitSections = (sections: NonNullable<CareerView['sections']>) => {
    setView((v) => (v ? { ...v, sections } : v));
    void patch({ config: { items: sections.map((s) => ({ section_id: s.id, hidden: s.hidden })) } });
  };

  const toggleSection = (idx: number) => {
    if (!view?.sections) return;
    const next = view.sections.map((s, i) => (i === idx ? { ...s, hidden: !s.hidden } : s));
    commitSections(next);
  };

  const sectionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!view?.sections || !over || active.id === over.id) return;
    const ids = view.sections.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    commitSections(arrayMove(view.sections, oldIndex, newIndex));
  };

  const changeProfile = async (profileId: string) => {
    setBusy('profile');
    try {
      await patch({ profile_id: profileId });
    } finally {
      setBusy(null);
    }
  };

  const refreshProfiles = useCallback(() => {
    careerService.listProfiles().then(setProfiles).catch(() => {});
  }, []);

  const doExport = async (kind: 'browser' | 'server' | 'html' | 'markdown' | 'docx') => {
    setBusy(kind);
    setError(null);
    const name = (view?.title || 'document').replace(/\s+/g, '-').toLowerCase();
    try {
      if (kind === 'server') downloadBlob(await viewsService.exportBlob(viewId, 'pdf'), `${name}.pdf`);
      else if (kind === 'html') downloadBlob(await viewsService.exportBlob(viewId, 'html'), `${name}.html`);
      else if (kind === 'markdown') downloadBlob(await viewsService.exportBlob(viewId, 'markdown'), `${name}.md`);
      else if (kind === 'docx') downloadBlob(await viewsService.exportBlob(viewId, 'docx'), `${name}.docx`);
      else await printHtmlBlob(await viewsService.exportBlob(viewId, 'html'));
    } catch (e: any) {
      setError(e?.message || 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const publish = async (customSlug?: string) => {
    setBusy('publish');
    setSlugError(null);
    try {
      const st = await viewsService.publish(viewId, customSlug);
      setPublishInfo(st);
      setSlugInput(st.slug);
      setShowPublishPopover(true);
    } catch (e: any) {
      if (customSlug) setSlugError(e?.message || 'Could not save that slug');
      else setError(e?.message || 'Publish failed');
    } finally {
      setBusy(null);
    }
  };
  const unpublish = async () => {
    setBusy('publish');
    try {
      await viewsService.unpublish(viewId);
      setPublishInfo((p) => (p ? { ...p, is_public: false } : p));
    } finally {
      setBusy(null);
    }
  };

  const onTemplateSaved = (saved: CareerTemplate) => {
    setCustomTemplates((ts) => (ts.some((x) => x.id === saved.id) ? ts.map((x) => (x.id === saved.id ? saved : x)) : [...ts, saved]));
    setDesignerTemplate(null);
  };

  const toggleHistory = async () => {
    setShowHistory((v) => !v);
    if (!showHistory && history.length === 0) {
      try {
        setHistory(await viewsService.getPublishHistory(viewId));
      } catch { /* best-effort */ }
    }
  };

  useEffect(() => {
    if (!publishInfo?.is_public) return;
    viewsService.getAnalyticsSummary()
      .then((rows) => setStats(rows.find((r) => r.master_id === viewId) || null))
      .catch(() => {});
  }, [publishInfo?.is_public, viewId]);

  const loadTestimonials = useCallback(async () => {
    setTestimonialsLoading(true);
    try {
      setTestimonials(await portfolioService.listTestimonials(viewId));
    } catch { /* best-effort */ } finally {
      setTestimonialsLoading(false);
    }
  }, [viewId]);

  const toggleTestimonials = () => {
    setShowTestimonials((v) => !v);
    if (!showTestimonials) void loadTestimonials();
  };

  const decideTestimonial = async (id: string, decision: 'approve' | 'reject') => {
    try {
      const updated = decision === 'approve' ? await portfolioService.approveTestimonial(viewId, id) : await portfolioService.rejectTestimonial(viewId, id);
      setTestimonials((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch { /* best-effort */ }
  };

  const removeTestimonial = async (id: string) => {
    try {
      await portfolioService.deleteTestimonial(viewId, id);
      setTestimonials((prev) => prev.filter((t) => t.id !== id));
    } catch { /* best-effort */ }
  };

  const publicUrl = publishInfo?.slug && typeof window !== 'undefined' ? `${window.location.origin}/${isPortfolio ? 'p' : 'r'}/${publishInfo.slug}` : '';
  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* blocked */ }
  };

  if (loading && !view) return <div className="pt-[60px] h-screen flex items-center justify-center bg-background"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (error && !view) {
    return (
      <div className="pt-[60px] min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="lab-card p-8 text-center max-w-md">
          <Icon name="ExclamationTriangleIcon" size={30} className="text-error mx-auto mb-2" />
          <p className="text-sm text-foreground mb-4">{error}</p>
          <button onClick={() => router.push('/career')} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted">Back to Career Studio</button>
        </div>
      </div>
    );
  }
  if (!view) return null;

  const backTab = isPortfolio ? 'portfolios' : 'resumes';

  return (
    <div className="pt-[60px] h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="h-[52px] flex items-center gap-2 px-3 sm:px-4 border-b border-border bg-card shadow-sm flex-shrink-0">
        <button onClick={() => router.push(`/career?tab=${backTab}`)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth" title="Back"><Icon name="ArrowLeftIcon" size={18} /></button>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2.5 py-1 rounded-full">
          <Icon name={isPortfolio ? 'GlobeAltIcon' : 'DocumentTextIcon'} size={13} /> {isPortfolio ? 'Portfolio' : 'Resume'}
        </span>
        <input
          value={view.title}
          onChange={(e) => setView((v) => (v ? { ...v, title: e.target.value } : v))}
          onBlur={(e) => patch({ title: e.target.value }, true)}
          className="min-w-0 flex-1 max-w-[280px] bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:bg-muted/50 rounded px-2 py-1"
          placeholder="Untitled"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setMode('edit')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-smooth ${mode === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="PencilSquareIcon" size={14} /> Edit
            </button>
            <button
              onClick={() => { setMode('preview'); void refreshPreview(viewId, view.kind); }}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-smooth ${mode === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="EyeIcon" size={14} /> Preview
            </button>
          </div>
          <span className="w-px h-5 bg-border mx-0.5" />
          <button onClick={() => setAnalysisOpen(true)} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5" title={isPortfolio ? 'AI portfolio analysis' : 'AI resume analysis'}><Icon name="ChartBarSquareIcon" size={14} /> Analyze</button>
          {!isPortfolio && (
            <>
              <button onClick={() => setTailorOpen(true)} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5" title="Tailor to a job description"><Icon name="BriefcaseIcon" size={14} /> Tailor</button>
            </>
          )}
          <span className="w-px h-5 bg-border mx-0.5" />
          <button onClick={() => doExport('browser')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="PrinterIcon" size={14} /> PDF</button>
          <button onClick={() => doExport('server')} disabled={!!busy} title="Server-rendered PDF" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="DocumentArrowDownIcon" size={17} /></button>
          <button onClick={() => doExport('html')} disabled={!!busy} title="Download HTML" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="CodeBracketIcon" size={17} /></button>
          {!isPortfolio && (
            <button onClick={() => doExport('docx')} disabled={!!busy} title="Download DOCX (Word)" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="DocumentTextIcon" size={17} /></button>
          )}
          <button onClick={() => doExport('markdown')} disabled={!!busy} title="Download Markdown" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="HashtagIcon" size={17} /></button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <div ref={publishPopoverRef} className="relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => publish()}
                disabled={!!busy}
                title={publishInfo?.is_public ? 'Publish latest changes to the live link' : 'Publish a public link'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 ${
                  publishInfo?.is_public ? 'border border-success/40 text-success hover:bg-success/10' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {publishInfo?.is_public && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                <Icon name="GlobeAltIcon" size={14} />
                {busy === 'publish' ? '…' : publishInfo?.is_public ? 'Update' : 'Publish'}
              </button>
              {publishInfo?.is_public && publicUrl && (
                <a href={publicUrl} target="_blank" rel="noreferrer" title="Open in new tab" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                  <Icon name="ArrowTopRightOnSquareIcon" size={16} />
                </a>
              )}
            </div>
            {showPublishPopover && publishInfo?.is_public && publicUrl && (
              <div className="absolute right-0 top-full mt-2 w-[280px] rounded-lg border border-border bg-card shadow-lg p-3 z-20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Published</span>
                  <button onClick={() => setShowPublishPopover(false)} className="text-muted-foreground hover:text-foreground"><Icon name="XMarkIcon" size={14} /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input readOnly value={publicUrl} className="flex-1 min-w-0 text-[11px] rounded-md border border-border bg-background px-2 py-1.5" />
                  <button onClick={copyLink} title="Copy" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground flex-shrink-0"><Icon name={copied ? 'CheckIcon' : 'ClipboardIcon'} size={14} /></button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" title="Open" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground flex-shrink-0"><Icon name="ArrowTopRightOnSquareIcon" size={14} /></a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex relative">
        {/* Controls */}
        {sidebarOpen && (
        <div className="w-[340px] max-w-[85vw] flex-shrink-0 border-r border-border overflow-y-auto scrollbar-clean p-4 space-y-5 bg-card">
          {/* Profile picker (switching auto-reloads this view from the new profile) */}
          <div>
            {profiles.length === 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Career Data Profile</p>
                <p className="text-sm text-foreground px-3 py-2.5 rounded-lg border border-border bg-background">{view.profile_title || 'Profile'}</p>
              </>
            ) : (
              <ProfileSelector
                value={view.profile_id}
                profiles={profiles}
                onChange={changeProfile}
                onProfilesChanged={refreshProfiles}
                showToast={(m, t) => (t === 'error' ? setError(m) : undefined)}
              />
            )}
            {!view.profile_title && <p className="text-[11px] text-error mt-1">This view's profile was deleted — pick another.</p>}
          </div>

          {/* Template */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Template</p>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <TemplatePickerCard
                  key={t.id}
                  kind={isPortfolio ? 'portfolio' : 'resume'}
                  name={t.name}
                  spec={(t as any).spec}
                  selected={view.template === t.id}
                  onClick={() => patch({ template: t.id })}
                  onEdit={customTemplates.length > 0 ? () => setDesignerTemplate(t as CareerTemplate) : undefined}
                />
              ))}
            </div>
          </div>
          {designerTemplate && (
            <TemplateDesigner
              kind={isPortfolio ? 'portfolio' : 'resume'}
              template={designerTemplate}
              profiles={profiles}
              initialProfileId={view.profile_id}
              onClose={() => setDesignerTemplate(null)}
              onSaved={onTemplateSaved}
            />
          )}

          {/* Portfolio-only theme controls */}
          {isPortfolio && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((a) => (
                  <button key={a.id} onClick={() => patch({ accent: a.id })} title={a.label} className={`w-5 h-5 rounded-full ${a.dot} ${view.accent === a.id ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/40' : ''}`} />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {['sans', 'serif'].map((f) => (
                  <button key={f} onClick={() => patch({ font: f })} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize border ${view.font === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{f}</button>
                ))}
                {['stack', 'centered', 'card'].map((l) => (
                  <button key={l} onClick={() => patch({ layout: l })} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize border ${view.layout === l ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{l}</button>
                ))}
              </div>
            </div>
          )}

          {/* Sections — drag to reorder */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Sections</p>
            <DndContext sensors={sectionSensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
              <SortableContext items={(view.sections || []).map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {(view.sections || []).map((s, i) => (
                    <SortableSectionRow key={s.id} id={s.id} hidden={s.hidden}>
                      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{s.title || SECTION_LABEL[s.section_type] || s.section_type}</span>
                      <button onClick={() => toggleSection(i)} title={s.hidden ? 'Show' : 'Hide'} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><Icon name={s.hidden ? 'EyeSlashIcon' : 'EyeIcon'} size={15} /></button>
                    </SortableSectionRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <p className="text-[11px] text-muted-foreground mt-2">Edit content directly in the canvas. Need import, versions, or AI copilot? <button onClick={() => openProfileEditor(view.profile_id)} className="text-primary hover:underline">Open full editor →</button></p>
          </div>

          {/* Publish a public link — works for both resumes and portfolios */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Share</p>
            {publishInfo?.is_public && publicUrl ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-success font-medium">
                  <span className="w-2 h-2 rounded-full bg-success" /> Live · {publishInfo.view_count} views{stats && stats.downloads > 0 ? ` · ${stats.downloads} downloads` : ''}
                </div>
                <div className="flex items-center gap-1.5">
                  <input readOnly value={publicUrl} className="flex-1 min-w-0 text-[11px] rounded-md border border-border bg-background px-2 py-1.5" />
                  <button onClick={copyLink} title="Copy" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Icon name={copied ? 'CheckIcon' : 'ClipboardIcon'} size={14} /></button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" title="Open" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Icon name="ArrowTopRightOnSquareIcon" size={14} /></a>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1">Custom slug</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={slugInput}
                      onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="flex-1 min-w-0 text-[11px] rounded-md border border-border bg-background px-2 py-1.5"
                    />
                    <button
                      onClick={() => slugInput.trim() && slugInput !== publishInfo.slug && publish(slugInput.trim())}
                      disabled={!!busy || !slugInput.trim() || slugInput === publishInfo.slug}
                      className="text-xs px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  {slugError && <p className="text-[10px] text-error mt-1">{slugError}</p>}
                </div>
                {stats && stats.top_referrers.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Top referrer: {stats.top_referrers[0].referrer}</p>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => publish()} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">{busy === 'publish' ? '…' : 'Update'}</button>
                  <button onClick={unpublish} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-error disabled:opacity-50">Unpublish</button>
                  <button onClick={toggleHistory} className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground ml-auto">{showHistory ? 'Hide history' : 'History'}</button>
                </div>
                {showHistory && (
                  <div className="pt-1.5 border-t border-border/60 space-y-1 max-h-32 overflow-y-auto">
                    {history.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">No snapshots yet.</p>
                    ) : (
                      history.map((h) => (
                        <a
                          key={h.id}
                          href={`${window.location.origin}/${isPortfolio ? 'p' : 'r'}/${h.slug}/v/${h.version_number}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 text-[10px] text-foreground hover:text-primary"
                        >
                          <span>v{h.version_number}</span>
                          <span className="text-muted-foreground truncate">{new Date(h.created_at.includes('T') ? h.created_at : h.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>
                        </a>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => publish()} disabled={!!busy} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Icon name="GlobeAltIcon" size={15} /> {busy === 'publish' ? 'Publishing…' : 'Publish public link'}</button>
            )}
          </div>

          {isPortfolio && publishInfo?.is_public && (
            <div>
              <button onClick={toggleTestimonials} className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground mb-1.5">
                <span>Recommendations</span>
                <Icon name="ChevronDownIcon" size={13} className={`transition-smooth ${showTestimonials ? 'rotate-180' : ''}`} />
              </button>
              {showTestimonials && (
                <div className="space-y-1.5">
                  {testimonialsLoading ? (
                    <p className="text-[11px] text-muted-foreground">Loading…</p>
                  ) : testimonials.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No submissions yet.</p>
                  ) : (
                    testimonials.map((t) => (
                      <div key={t.id} className="rounded-lg border border-border p-2 text-xs space-y-1">
                        <p className="text-foreground">&ldquo;{t.quote}&rdquo;</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">— {t.name}</span>
                          <div className="flex items-center gap-1.5">
                            {t.status === 'pending' ? (
                              <>
                                <button onClick={() => decideTestimonial(t.id, 'approve')} className="text-success hover:underline">Approve</button>
                                <button onClick={() => decideTestimonial(t.id, 'reject')} className="text-muted-foreground hover:text-error">Reject</button>
                              </>
                            ) : (
                              <span className={`px-1.5 py-0.5 rounded-full ${t.status === 'approved' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{t.status}</span>
                            )}
                            <button onClick={() => removeTestimonial(t.id)} className="text-muted-foreground hover:text-error" title="Delete"><Icon name="TrashIcon" size={11} /></button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        )}

        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          className={`absolute top-3 z-10 p-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm transition-smooth ${sidebarOpen ? 'left-[328px]' : 'left-3'}`}
        >
          <Icon name={sidebarOpen ? 'ChevronLeftIcon' : 'ChevronRightIcon'} size={14} />
        </button>

        {/* Canvas: inline editor by default, live preview behind the "Preview" toggle above */}
        <div className="flex-1 min-w-0 bg-muted/30 p-4 overflow-hidden flex flex-col gap-3">
          {mode === 'edit' ? (
            editedResume && editedResume.id === view.profile_id ? (
              <div className="w-full flex-1 min-h-0 overflow-y-auto scrollbar-clean rounded-lg border border-border bg-card shadow-sm p-4 sm:p-6">
                <div className="w-full max-w-[720px] mx-auto">
                  <ResumeEditor />
                </div>
              </div>
            ) : (
              <div className="w-full flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">Loading editor…</div>
            )
          ) : isPortfolio ? (
            portfolioPreview ? (
              <div className="w-full flex-1 min-h-0 rounded-lg border border-border bg-white shadow-sm overflow-y-auto">
                <PortfolioWidgetsView widgets={portfolioPreview.widgets} theme={portfolioPreview.theme} emptyText="This portfolio is empty." />
              </div>
            ) : (
              <div className="w-full flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">Rendering preview…</div>
            )
          ) : previewUrl ? (
            <iframe title="preview" src={previewUrl} className="w-full flex-1 min-h-0 rounded-lg border border-border bg-white shadow-sm" />
          ) : (
            <div className="w-full flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">Rendering preview…</div>
          )}
        </div>
      </div>

      <AnalysisPanel kind={isPortfolio ? 'portfolio' : 'resume'} open={analysisOpen} onClose={() => setAnalysisOpen(false)} analyze={analyzeView} getAnalysis={getViewAnalysis} onApplyFix={applyAnalysisFix} />
      {!isPortfolio && (
        <ViewTailorPanel viewId={viewId} open={tailorOpen} onClose={() => setTailorOpen(false)} onAppliedInPlace={load} />
      )}

      <ProfileEditorModal onClosed={load} />
    </div>
  );
}
