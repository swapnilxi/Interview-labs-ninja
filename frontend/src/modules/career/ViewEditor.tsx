'use client';

/**
 * View editor for a resume/portfolio "view" — a live rendering of a chosen
 * Master Profile with a template. Controls (left): profile dropdown + edit
 * pencil, template picker, per-section show/hide + reorder. Preview (right): an
 * iframe of the backend-rendered HTML, so it's identical to the export.
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
import { ACCENTS, PORTFOLIO_STYLE_TEMPLATES, type CareerView, type Resume } from './types';
import { downloadBlob, printHtmlBlob } from './exportUtils';
import AnalysisPanel from './AnalysisPanel';
import ViewTailorPanel from './ViewTailorPanel';
import ProfileSelector from './ProfileSelector';
import ProfileEditorModal from './ProfileEditorModal';
import { openProfileEditor } from './profileEditorStore';

const RESUME_TEMPLATES = [
  { id: 'classic', name: 'Classic' },
  { id: 'modern', name: 'Modern' },
  { id: 'compact', name: 'Compact' },
  { id: 'elegant', name: 'Elegant' },
  { id: 'executive', name: 'Executive' },
  { id: 'minimalist', name: 'Minimalist' },
  { id: 'technical', name: 'Technical' },
];

const SECTION_LABEL: Record<string, string> = {
  personal_info: 'Personal Info', summary: 'Summary', experience: 'Experience', education: 'Education',
  skills: 'Skills', projects: 'Projects', certifications: 'Certifications', awards: 'Awards',
  achievements: 'Achievements', research: 'Research', languages: 'Languages', volunteer: 'Volunteer', custom: 'Custom',
};

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
  const [publishInfo, setPublishInfo] = useState<{ slug: string; is_public: boolean; view_count: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<{ id: string; name: string }[]>([]);
  const lastUrl = useRef<string | null>(null);

  const isPortfolio = view?.kind === 'portfolio';

  // View-scoped AI: analyze/tailor operate on this view's visible sections and
  // (for tailor) write back to the underlying profile. Stable identities so the
  // AnalysisPanel effect doesn't re-fire.
  const analyzeView = useCallback((jd?: string) => viewsService.analyze(viewId, jd), [viewId]);
  const getViewAnalysis = useCallback(() => viewsService.getAnalysis(viewId), [viewId]);

  const refreshPreview = useCallback(async (id: string) => {
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
      await refreshPreview(viewId);
    },
    [viewId, refreshPreview],
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
        .then((rows) => setCustomTemplates(rows.map((r) => ({ id: r.id, name: r.name }))))
        .catch(() => {});
      await refreshPreview(viewId);
      const st = (await viewsService.getPublishStatus(viewId)) as any;
      setPublishInfo(st && st.slug ? st : null);
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

  const patch = useCallback(
    async (fields: Parameters<typeof viewsService.update>[1], skipPreview = false) => {
      const updated = await viewsService.update(viewId, fields);
      setView(updated);
      if (!skipPreview) await refreshPreview(viewId);
    },
    [viewId, refreshPreview],
  );

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

  const publish = async () => {
    setBusy('publish');
    try {
      const st = await viewsService.publish(viewId);
      setPublishInfo(st);
    } catch (e: any) {
      setError(e?.message || 'Publish failed');
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
  const fallbackTemplates = isPortfolio ? PORTFOLIO_STYLE_TEMPLATES.map((t) => ({ id: t.id, name: t.name })) : RESUME_TEMPLATES;
  const templates = customTemplates.length ? customTemplates : fallbackTemplates;

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
          {!isPortfolio && (
            <>
              <button onClick={() => setAnalysisOpen(true)} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5" title="AI resume analysis"><Icon name="ChartBarSquareIcon" size={14} /> Analyze</button>
              <button onClick={() => setTailorOpen(true)} className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted inline-flex items-center gap-1.5" title="Tailor to a job description"><Icon name="BriefcaseIcon" size={14} /> Tailor</button>
              <span className="w-px h-5 bg-border mx-0.5" />
            </>
          )}
          <button onClick={() => doExport('browser')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="PrinterIcon" size={14} /> PDF</button>
          <button onClick={() => doExport('server')} disabled={!!busy} title="Server-rendered PDF" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="DocumentArrowDownIcon" size={17} /></button>
          <button onClick={() => doExport('html')} disabled={!!busy} title="Download HTML" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="CodeBracketIcon" size={17} /></button>
          {!isPortfolio && (
            <button onClick={() => doExport('docx')} disabled={!!busy} title="Download DOCX (Word)" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="DocumentTextIcon" size={17} /></button>
          )}
          <button onClick={() => doExport('markdown')} disabled={!!busy} title="Download Markdown" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"><Icon name="HashtagIcon" size={17} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Controls */}
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
            <div className="grid grid-cols-2 gap-1.5">
              {templates.map((t) => (
                <button key={t.id} onClick={() => patch({ template: t.id })} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-smooth ${view.template === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{t.name}</button>
              ))}
            </div>
          </div>

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
            <p className="text-[11px] text-muted-foreground mt-2">Content comes from the profile. <button onClick={() => openProfileEditor(view.profile_id)} className="text-primary hover:underline">Edit data →</button></p>
          </div>

          {/* Publish a public link — works for both resumes and portfolios */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Share</p>
            {publishInfo?.is_public && publicUrl ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-success font-medium"><span className="w-2 h-2 rounded-full bg-success" /> Live · {publishInfo.view_count} views</div>
                <div className="flex items-center gap-1.5">
                  <input readOnly value={publicUrl} className="flex-1 min-w-0 text-[11px] rounded-md border border-border bg-background px-2 py-1.5" />
                  <button onClick={copyLink} title="Copy" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Icon name={copied ? 'CheckIcon' : 'ClipboardIcon'} size={14} /></button>
                  <a href={publicUrl} target="_blank" rel="noreferrer" title="Open" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"><Icon name="ArrowTopRightOnSquareIcon" size={14} /></a>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={publish} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">{busy === 'publish' ? '…' : 'Update'}</button>
                  <button onClick={unpublish} disabled={!!busy} className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-error disabled:opacity-50">Unpublish</button>
                </div>
              </div>
            ) : (
              <button onClick={publish} disabled={!!busy} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Icon name="GlobeAltIcon" size={15} /> {busy === 'publish' ? 'Publishing…' : 'Publish public link'}</button>
            )}
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 bg-muted/30 p-4 overflow-hidden">
          {previewUrl ? (
            <iframe title="preview" src={previewUrl} className="w-full h-full rounded-lg border border-border bg-white shadow-sm" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Rendering preview…</div>
          )}
        </div>
      </div>

      {!isPortfolio && (
        <>
          <AnalysisPanel open={analysisOpen} onClose={() => setAnalysisOpen(false)} analyze={analyzeView} getAnalysis={getViewAnalysis} onApplyFix={applyAnalysisFix} />
          <ViewTailorPanel viewId={viewId} open={tailorOpen} onClose={() => setTailorOpen(false)} onAppliedInPlace={load} />
        </>
      )}

      <ProfileEditorModal onClosed={load} />
    </div>
  );
}
