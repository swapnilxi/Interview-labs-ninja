'use client';

/**
 * Collapsible "Profile Details" panel for a Master Profile: freeform metadata
 * (role, seniority, target roles/companies/industry, tags) that isn't part of the
 * resume content itself but supports target-role/company optimization and richer
 * profile identification. Self-contained — manages its own local form state and
 * autosaves via PATCH /career/profiles/{id}/metadata; does not need to write back
 * into the resume editor's Zustand store.
 */

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import type { Resume } from './types';

const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'staff', 'principal', 'executive'];

function ChipInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-muted text-foreground">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="p-0.5 rounded-full hover:bg-border"><Icon name="XMarkIcon" size={10} /></button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring"
      />
    </div>
  );
}

export default function ProfileMetadataPanel({ profile }: { profile: Resume }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(profile.description || '');
  const [primaryRole, setPrimaryRole] = useState(profile.primary_role || '');
  const [experienceLevel, setExperienceLevel] = useState(profile.experience_level || '');
  const [targetIndustry, setTargetIndustry] = useState(profile.target_industry || '');
  const [targetRoles, setTargetRoles] = useState<string[]>(profile.target_roles || []);
  const [targetCompanies, setTargetCompanies] = useState<string[]>(profile.target_companies || []);
  const [techStack, setTechStack] = useState<string[]>(profile.tech_stack || []);
  const [tags, setTags] = useState<string[]>(profile.tags || []);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Re-seed local state whenever a different profile loads.
  useEffect(() => {
    setDescription(profile.description || '');
    setPrimaryRole(profile.primary_role || '');
    setExperienceLevel(profile.experience_level || '');
    setTargetIndustry(profile.target_industry || '');
    setTargetRoles(profile.target_roles || []);
    setTargetCompanies(profile.target_companies || []);
    setTechStack(profile.tech_stack || []);
    setTags(profile.tags || []);
  }, [profile.id]);

  const save = async (fields: Partial<{ description: string; primary_role: string; experience_level: string; target_industry: string; target_roles: string[]; target_companies: string[]; tech_stack: string[]; tags: string[] }>) => {
    setSaveStatus('saving');
    try {
      await careerService.updateProfileMetadata(profile.id, fields);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1600);
    } catch {
      setSaveStatus('idle');
    }
  };

  return (
    <div className="lab-card mb-3 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <Icon name="TagIcon" size={16} className="text-primary" /> Profile Details
          {(primaryRole || experienceLevel) && <span className="text-xs font-normal text-muted-foreground">({[primaryRole, experienceLevel].filter(Boolean).join(' · ')})</span>}
        </span>
        <span className="flex items-center gap-2">
          {saveStatus === 'saving' && <span className="text-xs text-muted-foreground">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-success inline-flex items-center gap-1"><Icon name="CheckIcon" size={12} /> Saved</span>}
          <Icon name="ChevronDownIcon" size={14} className={`text-muted-foreground transition-smooth ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="p-3 pt-0 flex flex-col gap-3 border-t border-border">
          <div className="pt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => save({ description })}
              rows={2}
              placeholder="A short note to tell this profile apart from your others — e.g. 'Backend-focused, for infra roles'"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring resize-y"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Primary role</label>
              <input
                value={primaryRole}
                onChange={(e) => setPrimaryRole(e.target.value)}
                onBlur={() => save({ primary_role: primaryRole })}
                placeholder="Senior AI Engineer"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Experience level</label>
              <select
                value={experienceLevel}
                onChange={(e) => { setExperienceLevel(e.target.value); save({ experience_level: e.target.value }); }}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring"
              >
                <option value="">Not set</option>
                {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Target industry</label>
            <input
              value={targetIndustry}
              onChange={(e) => setTargetIndustry(e.target.value)}
              onBlur={() => save({ target_industry: targetIndustry })}
              placeholder="e.g. Fintech, Healthcare, Developer Tools"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus-ring"
            />
          </div>

          <ChipInput label="Target roles" values={targetRoles} onChange={(v) => { setTargetRoles(v); save({ target_roles: v }); }} placeholder="Add a role, press Enter…" />
          <ChipInput label="Target companies" values={targetCompanies} onChange={(v) => { setTargetCompanies(v); save({ target_companies: v }); }} placeholder="Add a company, press Enter…" />
          <ChipInput label="Primary tech stack" values={techStack} onChange={(v) => { setTechStack(v); save({ tech_stack: v }); }} placeholder="Add a technology, press Enter…" />
          <ChipInput label="Tags" values={tags} onChange={(v) => { setTags(v); save({ tags: v }); }} placeholder="Add a tag, press Enter…" />

          {(profile.origin || profile.confidence_score != null) && (
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              {profile.origin && <>Created via <span className="font-medium">{profile.origin.replace('_', ' ')}</span></>}
              {profile.confidence_score != null && <> · {profile.confidence_score}% confidence</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
