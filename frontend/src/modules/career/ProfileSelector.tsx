'use client';

/**
 * Workspace-style Career Data Profile switcher — the persistent selector meant
 * to sit at the top of every Career Studio page that operates on a profile
 * (Generate, the profile editor, the resume/portfolio view editor, …).
 *
 * Selecting a row switches the "active" profile (shared across pages via
 * activeProfileStore) and fires onChange. Quick actions — rename, duplicate,
 * archive, delete — happen inline, without navigating away; only "Edit" (which
 * opens the full section editor) and "+ Create new" navigate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { setActiveProfile } from './activeProfileStore';
import { openProfileEditor } from './profileEditorStore';
import type { Resume } from './types';

function fmt(v?: string) {
  if (!v) return '';
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ProfileSelectorProps {
  value: string;
  profiles: Resume[];
  onChange: (profileId: string) => void;
  /** Called after create/duplicate/archive/delete so the parent's profile list refreshes. */
  onProfilesChanged: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
  className?: string;
  /** Toolbar-friendly rendering: no label, smaller trigger. Use inside a page header/toolbar. */
  compact?: boolean;
}

type RenameState = { id: string; value: string } | null;

export default function ProfileSelector({ value, profiles, onChange, onProfilesChanged, showToast, className, compact = false }: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState<Resume[]>([]);
  const [rename, setRename] = useState<RenameState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = profiles.find((p) => p.id === value) || null;

  const notify = useCallback((msg: string, type: 'success' | 'error' = 'success') => showToast?.(msg, type), [showToast]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!showArchived) return;
    careerService.listProfiles(true).then((all) => setArchivedList(all.filter((p) => p.is_archived))).catch(() => setArchivedList([]));
  }, [showArchived, profiles]);

  const select = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    setActiveProfile(p ? { id: p.id, title: p.title } : { id });
    onChange(id);
    setOpen(false);
    careerService.touchProfile(id).catch(() => {});
  };

  const createNew = async () => {
    setBusyId('__create__');
    try {
      const p = await careerService.createProfile('New Profile');
      setActiveProfile({ id: p.id, title: p.title });
      onProfilesChanged();
      setOpen(false);
      openProfileEditor(p.id);
    } catch (e: any) {
      notify(e?.message || 'Could not create profile', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (p: Resume) => setRename({ id: p.id, value: p.title });
  const commitRename = async () => {
    if (!rename) return;
    const { id, value: title } = rename;
    setRename(null);
    if (!title.trim()) return;
    setBusyId(id);
    try {
      await careerService.updateResume(id, title.trim());
      onProfilesChanged();
    } catch (e: any) {
      notify(e?.message || 'Rename failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (p: Resume) => {
    setBusyId(p.id);
    try {
      const dup = await careerService.duplicateProfile(p.id);
      onProfilesChanged();
      notify(`Duplicated "${p.title}"`);
      select(dup.id);
    } catch (e: any) {
      notify(e?.message || 'Duplicate failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (p: Resume, archived: boolean) => {
    setBusyId(p.id);
    try {
      if (archived) await careerService.archiveProfile(p.id);
      else await careerService.unarchiveProfile(p.id);
      onProfilesChanged();
      if (archived) setArchivedList((l) => [...l, { ...p, is_archived: true }]);
      else setArchivedList((l) => l.filter((x) => x.id !== p.id));
      if (archived && value === p.id) {
        const next = profiles.find((x) => x.id !== p.id);
        if (next) select(next.id);
      }
      notify(archived ? `Archived "${p.title}"` : `Restored "${p.title}"`);
    } catch (e: any) {
      notify(e?.message || 'Action failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const del = async (p: Resume) => {
    if (!window.confirm(`Delete profile "${p.title}"? Views using it will need a new profile. This can't be undone.`)) return;
    setBusyId(p.id);
    try {
      await careerService.deleteProfile(p.id);
      onProfilesChanged();
      if (value === p.id) {
        const next = profiles.find((x) => x.id !== p.id);
        if (next) select(next.id);
      }
      notify(`Deleted "${p.title}"`);
    } catch (e: any) {
      notify(e?.message || 'Delete failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({ p, archivedRow }: { p: Resume; archivedRow?: boolean }) => (
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm ${!archivedRow && p.id === value ? 'bg-primary/10' : 'hover:bg-muted'}`}>
      {rename?.id === p.id ? (
        <input
          autoFocus
          value={rename.value}
          onChange={(e) => setRename({ id: p.id, value: e.target.value })}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRename(null); }}
          className="flex-1 min-w-0 bg-card border border-primary/40 rounded px-1.5 py-0.5 text-sm text-foreground focus:outline-none"
        />
      ) : (
        <button onClick={() => (archivedRow ? undefined : select(p.id))} disabled={archivedRow} className="flex-1 min-w-0 flex items-center gap-1.5 text-left disabled:cursor-default">
          {!archivedRow && p.id === value && <Icon name="CheckIcon" size={13} className="text-primary shrink-0" />}
          <span className={`truncate ${!archivedRow && p.id === value ? 'font-semibold text-foreground' : 'text-foreground'}`}>{p.title}</span>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-auto pl-1">{p.section_count ?? 0}s · {fmt(p.updated_at)}</span>
        </button>
      )}
      {busyId === p.id ? (
        <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin shrink-0" />
      ) : rename?.id !== p.id ? (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          {archivedRow ? (
            <button onClick={() => archive(p, false)} title="Restore" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5"><Icon name="ArrowUturnLeftIcon" size={13} /></button>
          ) : (
            <>
              <button onClick={() => openProfileEditor(p.id)} title="Edit" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5"><Icon name="PencilSquareIcon" size={13} /></button>
              <button onClick={() => startRename(p)} title="Rename" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><Icon name="TagIcon" size={13} /></button>
              <button onClick={() => duplicate(p)} title="Duplicate" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><Icon name="DocumentDuplicateIcon" size={13} /></button>
              <button onClick={() => archive(p, true)} title="Archive" className="p-1 rounded text-muted-foreground hover:text-warning hover:bg-warning/5"><Icon name="ArchiveBoxIcon" size={13} /></button>
            </>
          )}
          <button onClick={() => del(p)} title="Delete" className="p-1 rounded text-muted-foreground hover:text-error hover:bg-error/5"><Icon name="TrashIcon" size={13} /></button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className={`relative ${className || ''}`}>
      {!compact && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Career Data Profile</p>}
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-foreground transition-smooth max-w-[220px] ${open ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-muted'}`
            : `w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-foreground transition-smooth ${open ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-border bg-card hover:bg-muted'}`
        }
      >
        <span className={compact ? 'cs-icon-chip w-6 h-6 shrink-0' : 'cs-icon-chip w-7 h-7 shrink-0'}><Icon name="IdentificationIcon" size={compact ? 13 : 15} className="text-primary" /></span>
        <span className="flex-1 min-w-0 truncate text-left font-medium">{active?.title || 'Select a profile'}</span>
        <Icon name="ChevronDownIcon" size={compact ? 12 : 14} className={`text-muted-foreground shrink-0 transition-smooth ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1.5 ${compact ? 'right-0' : 'w-full'} min-w-[280px] max-h-[420px] flex flex-col bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-fade-in`}>
          <div className="flex-1 overflow-y-auto scrollbar-clean p-1.5">
            {profiles.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No profiles yet.</p>
            ) : (
              profiles.map((p) => <Row key={p.id} p={p} />)
            )}
            {showArchived && archivedList.length > 0 && (
              <>
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Archived</div>
                {archivedList.map((p) => <Row key={p.id} p={p} archivedRow />)}
              </>
            )}
          </div>
          <div className="border-t border-border p-1.5 flex flex-col gap-0.5">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Icon name="ArchiveBoxIcon" size={13} /> {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <button
              onClick={createNew}
              disabled={busyId === '__create__'}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {busyId === '__create__' ? <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <Icon name="PlusIcon" size={15} />}
              Create new profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
