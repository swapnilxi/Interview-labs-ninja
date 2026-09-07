'use client';

/**
 * Master Profile editor — the single place a user fills their data. Reuses the
 * resume section editor / preview / store (a profile is a resume_master row), so
 * every resume/portfolio VIEW that references this profile updates live.
 *
 * Renders as a full-screen MODAL (mirrors TemplateDesigner.tsx's chrome), not
 * a routed page — see profileEditorStore.ts. That's what lets it open from
 * anywhere (the Profiles tab, ViewEditor's "Edit data" link, ProfileSelector's
 * pencil icon, a version's Clone/Branch) without losing whatever page you
 * were on.
 */

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from '../resume/store/resumeStore';
import ResumeEditor from '../resume/ResumeEditor';
import ResumePreview from '../resume/ResumePreview';
import CareerCopilot from '../views/CareerCopilot';
import ProfileImportDialog from './ProfileImportDialog';
import ProfileEnrichDialog from './ProfileEnrichDialog';
import ProfileMetadataPanel from './ProfileMetadataPanel';
import ProfileSelector from './ProfileSelector';
import VersionTimeline from '../resume/VersionTimeline';
import { setActiveProfile } from '../shared/activeProfileStore';
import { closeProfileEditor, openProfileEditor } from './profileEditorStore';
import type { Resume } from '../shared/types';

function SaveStatusPill() {
  const status = useResumeStore((s) => s.saveStatus);
  if (status === 'saving') return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> Saving…</span>;
  if (status === 'saved') return <span className="text-xs text-success inline-flex items-center gap-1"><Icon name="CheckIcon" size={13} /> Saved</span>;
  if (status === 'error') return <span className="text-xs text-error inline-flex items-center gap-1"><Icon name="ExclamationTriangleIcon" size={13} /> Save failed</span>;
  return <span className="text-xs text-muted-foreground">All changes saved</span>;
}

export default function ProfileEditor({ profileId }: { profileId: string }) {
  const resume = useResumeStore((s) => s.resume);
  const loading = useResumeStore((s) => s.loading);
  const error = useResumeStore((s) => s.error);
  const load = useResumeStore((s) => s.load);
  const setTitle = useResumeStore((s) => s.setTitle);
  const undo = useResumeStore((s) => s.undo);
  const redo = useResumeStore((s) => s.redo);
  const canUndo = useResumeStore((s) => s.past.length > 0);
  const canRedo = useResumeStore((s) => s.future.length > 0);
  const flushPendingSaves = useResumeStore((s) => s.flushPendingSaves);
  const discardPendingSaves = useResumeStore((s) => s.discardPendingSaves);

  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Resume[]>([]);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  const refreshProfiles = useCallback(() => {
    careerService.listProfiles().then(setProfiles).catch(() => {});
  }, []);

  useEffect(() => {
    if (profileId) void load(profileId);
    setActiveProfile({ id: profileId });
    refreshProfiles();
  }, [profileId, load, refreshProfiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useResumeStore.getState().saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const guardedNavigate = useCallback((action: () => void) => {
    if (useResumeStore.getState().saveStatus === 'saving') {
      setPendingNav(() => action);
    } else {
      action();
    }
  }, []);

  const close = useCallback(() => guardedNavigate(() => closeProfileEditor()), [guardedNavigate]);

  // Keep the cached active-profile title fresh once the profile itself has loaded.
  useEffect(() => {
    if (resume?.id === profileId && resume.title) setActiveProfile({ id: profileId, title: resume.title });
  }, [profileId, resume?.id, resume?.title]);

  const switchProfile = (id: string) => {
    if (id === profileId) return;
    guardedNavigate(() => openProfileEditor(id));
  };

  if (loading && !resume) return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (error && !resume) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-background">
        <div className="lab-card p-8 text-center max-w-md">
          <Icon name="ExclamationTriangleIcon" size={30} className="text-error mx-auto mb-2" />
          <p className="text-sm text-foreground mb-4">{error}</p>
          <button onClick={close} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted">Close</button>
        </div>
      </div>
    );
  }
  if (!resume) return null;

  return (
    <div className="fixed inset-0 z-[300] h-screen flex flex-col bg-background">
      <div className="h-[52px] flex items-center gap-2 px-3 sm:px-4 border-b border-border bg-card shadow-sm flex-shrink-0">
        <button onClick={close} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth" title="Close" aria-label="Close"><Icon name="XMarkIcon" size={18} /></button>
        <span className="cs-icon-chip w-8 h-8 hidden sm:flex"><Icon name="IdentificationIcon" size={16} className="text-primary" /></span>
        <input value={resume.title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 max-w-[220px] bg-transparent text-sm font-semibold text-foreground focus:outline-none focus:bg-muted/50 rounded px-2 py-1 transition-smooth" placeholder="My Profile" />
        {profiles.length > 0 && (
          <ProfileSelector compact value={profileId} profiles={profiles} onChange={switchProfile} onProfilesChanged={refreshProfiles} />
        )}
        <div className="hidden sm:block pl-2 ml-1 border-l border-border"><SaveStatusPill /></div>
        <div className="lg:hidden flex items-center bg-muted rounded-lg p-0.5 ml-auto">
          <button onClick={() => setMobileTab('edit')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-smooth ${mobileTab === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Edit</button>
          <button onClick={() => setMobileTab('preview')} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-smooth ${mobileTab === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Preview</button>
        </div>
        <div className="flex items-center gap-0.5 ml-auto lg:ml-2 pl-2 border-l border-border">
          <button onClick={() => setImportOpen(true)} title="Import from resume, JSON, or text" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"><Icon name="ArrowDownTrayIcon" size={16} /><span className="hidden sm:inline">Import</span></button>
          <button onClick={() => setEnrichOpen(true)} title="Enrich with another document (AI merges + flags conflicts)" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-smooth"><Icon name="SparklesIcon" size={16} /><span className="hidden sm:inline">Enrich</span></button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <button onClick={() => setVersionsOpen(true)} title="Version history" className={`p-2 rounded-lg transition-smooth ${versionsOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="ClockIcon" size={18} /></button>
          <button onClick={undo} disabled={!canUndo} title="Undo" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-smooth"><Icon name="ArrowUturnLeftIcon" size={18} /></button>
          <button onClick={redo} disabled={!canRedo} title="Redo" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-smooth"><Icon name="ArrowUturnRightIcon" size={18} /></button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <button onClick={() => setCopilotOpen((v) => !v)} title="AI copilot" className={`p-2 rounded-lg transition-smooth ${copilotOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="ChatBubbleLeftRightIcon" size={18} /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex">
          <div className={`${mobileTab === 'edit' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 lg:border-r border-border`}>
            <div className="w-full max-w-[720px] mx-auto">
              <div className="lab-card p-3 mb-3 text-xs text-muted-foreground flex items-start gap-2">
                <Icon name="InformationCircleIcon" size={15} className="text-primary flex-shrink-0 mt-0.5" />
                <span>This is your reusable data. Every resume &amp; portfolio built from this profile updates automatically when you edit it here.</span>
              </div>
              <ProfileMetadataPanel profile={resume} />
              <ResumeEditor />
            </div>
          </div>
          <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 overflow-y-auto scrollbar-clean p-4 lg:p-6 bg-muted/30`}>
            <ResumePreview />
          </div>
        </div>
        {copilotOpen && (
          <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 border-l border-border bg-card">
            <CareerCopilot masterId={profileId} onCollapse={() => setCopilotOpen(false)} />
          </aside>
        )}
      </div>

      <ProfileImportDialog
        open={importOpen}
        profileId={profileId}
        onClose={() => setImportOpen(false)}
        onImported={() => void load(profileId)}
      />

      <ProfileEnrichDialog
        open={enrichOpen}
        profileId={profileId}
        onClose={() => setEnrichOpen(false)}
        onMerged={() => void load(profileId)}
      />

      <VersionTimeline masterId={profileId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />

      {pendingNav && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setPendingNav(null)}
        >
          <div
            className="w-full max-w-[420px] bg-card border border-border rounded-lg shadow-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                <Icon name="ExclamationTriangleIcon" size={20} className="text-warning" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Unsaved changes</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You have edits still saving to <span className="font-medium text-foreground">{resume?.title}</span>. Switching now could lose them.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setPendingNav(null)}
                className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const nav = pendingNav;
                  discardPendingSaves();
                  setPendingNav(null);
                  nav?.();
                }}
                className="px-3 py-2 rounded-lg border border-border text-sm text-error hover:bg-error/5"
              >
                Discard &amp; switch
              </button>
              <button
                onClick={async () => {
                  const nav = pendingNav;
                  setPendingNav(null);
                  await flushPendingSaves();
                  nav?.();
                }}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
              >
                Save &amp; switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
