'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { Resume } from '../shared/types';
import {
  jobFinderService,
  type DiscoveredJob,
  type AgentLogEntry,
  type JobSearchParams,
} from '@/lib/services/jobFinderService';
import ProfileSelector from '../profile/ProfileSelector';
import { getActiveProfile } from '../shared/activeProfileStore';

interface JobFinderPanelProps {
  profiles: Resume[];
  loaded: boolean;
  onGoToProfiles: () => void;
  onSelectTab: (tab: any) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

type FinderMode = 'daily' | 'demand' | 'saved';

const POPULAR_COMPANIES = ['Anthropic', 'OpenAI', 'Stripe', 'Databricks', 'Vercel', 'Supabase', 'Linear', 'Figma', 'Tesla', 'Cloudflare'];
const POPULAR_ROLES = ['Full Stack Engineer', 'AI Systems Engineer', 'Frontend Engineer', 'Backend Engineer', 'DevOps / SRE', 'Machine Learning'];

export default function JobFinderPanel({
  profiles,
  loaded,
  onGoToProfiles,
  onSelectTab,
  showToast,
}: JobFinderPanelProps) {
  const [mode, setMode] = useState<FinderMode>('daily');
  const [activeProfileId, setActiveProfileId] = useState<string>('');

  // Daily jobs state
  const [dailyJobs, setDailyJobs] = useState<DiscoveredJob[]>([]);
  const [dailyLogs, setDailyLogs] = useState<AgentLogEntry[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // On-demand search state
  const [searchParams, setSearchParams] = useState<JobSearchParams>({
    query: '',
    location: '',
    targetCompanies: [],
    remoteOnly: true,
  });
  const [onDemandJobs, setOnDemandJobs] = useState<DiscoveredJob[]>([]);
  const [onDemandLogs, setOnDemandLogs] = useState<AgentLogEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Saved jobs state
  const [savedJobs, setSavedJobs] = useState<DiscoveredJob[]>([]);

  // Logs terminal toggle
  const [showLogs, setShowLogs] = useState(false);

  // Keyword filter on displayed list
  const [filterKeyword, setFilterKeyword] = useState('');
  const [minScoreFilter, setMinScoreFilter] = useState(0);

  // Active profile selection
  useEffect(() => {
    if (!profiles.length || activeProfileId) return;
    const activeRef = getActiveProfile();
    const stillExists = activeRef && profiles.some((p) => p.id === activeRef.id);
    setActiveProfileId(stillExists ? activeRef!.id : profiles[0].id);
  }, [profiles, activeProfileId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || null,
    [profiles, activeProfileId]
  );

  // Load saved jobs
  const refreshSavedJobs = () => {
    setSavedJobs(jobFinderService.getSavedJobs());
  };

  useEffect(() => {
    refreshSavedJobs();
  }, []);

  // Fetch daily jobs on initial mount
  const loadDailyJobs = async (forceRefresh = false) => {
    setLoadingDaily(true);
    try {
      const res = await jobFinderService.fetchDailyJobs(activeProfile, forceRefresh);
      setDailyJobs(res.jobs);
      setDailyLogs(res.logs);
      if (forceRefresh) {
        showToast('Refreshed today’s 10 curated jobs', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not load daily jobs', 'error');
    } finally {
      setLoadingDaily(false);
    }
  };

  useEffect(() => {
    if (loaded) {
      void loadDailyJobs(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, activeProfileId]);

  // Execute on-demand search
  const handleRunSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchParams.query.trim() && searchParams.targetCompanies?.length === 0) {
      showToast('Enter a job role, keywords, or select target companies', 'error');
      return;
    }

    setIsSearching(true);
    setShowLogs(true);
    try {
      const res = await jobFinderService.runOnDemandSearch(searchParams, activeProfile);
      setOnDemandJobs(res.jobs);
      setOnDemandLogs(res.logs);
      showToast(`Agent discovered ${res.jobs.length} matching jobs`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Job discovery search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle bookmark / saved job
  const handleToggleSave = (job: DiscoveredJob) => {
    const isSaved = jobFinderService.toggleSaveJob(job);
    refreshSavedJobs();

    // Update in-memory lists
    const updateJobInList = (list: DiscoveredJob[]) =>
      list.map((j) => (j.id === job.id ? { ...j, saved: isSaved } : j));

    setDailyJobs(updateJobInList);
    setOnDemandJobs(updateJobInList);

    showToast(isSaved ? `Saved "${job.title}" to bookmarks` : `Removed "${job.title}" from saved jobs`, 'success');
  };

  // Pre-load job into Gap Matcher
  const handleMatchJob = (job: DiscoveredJob) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'labninja.transit.job',
          JSON.stringify({
            title: job.title,
            company: job.company,
            url: job.careersUrl || job.applyUrl,
            rawText: job.rawText || `${job.title} at ${job.company}. ${job.descriptionSnippet}`,
          })
        );
      }
    } catch {}
    onSelectTab('match');
  };

  // Pre-load job into AI Resume Generator
  const handleTailorResume = (job: DiscoveredJob) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'labninja.transit.job',
          JSON.stringify({
            title: job.title,
            company: job.company,
            url: job.careersUrl || job.applyUrl,
            rawText: job.rawText || `${job.title} at ${job.company}. ${job.descriptionSnippet}`,
          })
        );
      }
    } catch {}
    onSelectTab('generate');
  };

  // Pre-load job into Cover Letter Studio
  const handleDraftCoverLetter = (job: DiscoveredJob) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          'labninja.transit.job',
          JSON.stringify({
            title: job.title,
            company: job.company,
            url: job.careersUrl || job.applyUrl,
            rawText: job.rawText || `${job.title} at ${job.company}. ${job.descriptionSnippet}`,
          })
        );
      }
    } catch {}
    onSelectTab('coverletters');
  };

  // Filtered jobs according to active view
  const currentList = useMemo(() => {
    let source: DiscoveredJob[] = [];
    if (mode === 'daily') source = dailyJobs;
    else if (mode === 'demand') source = onDemandJobs;
    else source = savedJobs;

    return source.filter((j) => {
      if (minScoreFilter > 0 && j.matchScore < minScoreFilter) return false;
      if (!filterKeyword.trim()) return true;
      const q = filterKeyword.toLowerCase();
      return (
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        j.keySkills.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [mode, dailyJobs, onDemandJobs, savedJobs, filterKeyword, minScoreFilter]);

  const activeLogs = mode === 'demand' ? onDemandLogs : dailyLogs;

  return (
    <div className="space-y-6">
      {/* Panel Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="lab-tile h-9 w-9 shrink-0"
              aria-hidden="true"
              style={{ '--lab-identity': '#0EA5E9' } as React.CSSProperties}
            >
              <Icon name="MagnifyingGlassIcon" size={18} />
            </span>
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground sm:text-xl">
                AI Job Finder &amp; Company Scout
              </h2>
              <p className="text-xs text-muted-foreground">
                Autonomous web agent that searches live company career portals, extracts roles, and scores ATS alignment against your master profile.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Selector */}
        {profiles.length > 0 && (
          <div className="flex items-center gap-2 self-start rounded-lg border border-border/80 bg-card p-1.5 shadow-sm">
            <span className="text-xs font-medium text-muted-foreground pl-2">Matching with:</span>
            <select
              value={activeProfileId}
              onChange={(e) => setActiveProfileId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer pr-2"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-card text-foreground">
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* UI Agent Status & Control Banner */}
      <div
        className="lab-glow group flex flex-col gap-4 rounded-xl border bg-card p-5 lab-edge"
        style={{ '--lab-identity': '#0EA5E9' } as React.CSSProperties}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="lab-tile lab-tile-duo h-11 w-11 shrink-0" aria-hidden="true">
                <Icon name="SparklesIcon" size={22} />
              </span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
                  isSearching || loadingDaily ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground sm:text-base">
                  Autonomous Job Discovery Agent
                </h3>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-400">
                  Live Web Scout
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isSearching
                  ? 'Agent actively searching company portals and scoring match fit...'
                  : loadingDaily
                  ? 'Compiling today’s 10 curated job openings...'
                  : 'Agent standby: 10 daily curated jobs ready · On-demand deep search active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {activeLogs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition-all"
              >
                <Icon name="CommandLineIcon" size={14} />
                {showLogs ? 'Hide Agent Log' : 'View Agent Log'}
                <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[0.65rem] text-primary">
                  {activeLogs.length}
                </span>
              </button>
            )}

            {mode === 'daily' && (
              <button
                type="button"
                onClick={() => loadDailyJobs(true)}
                disabled={loadingDaily}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50 transition-all"
              >
                <Icon
                  name="ArrowPathIcon"
                  size={14}
                  className={loadingDaily ? 'animate-spin' : ''}
                />
                Refresh Daily
              </button>
            )}
          </div>
        </div>

        {/* Expandable Agent Reasoning Terminal */}
        {showLogs && activeLogs.length > 0 && (
          <div className="mt-2 rounded-lg border border-border/70 bg-black/40 p-3 font-mono text-[0.76rem] text-muted-foreground transition-all">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2 text-xs font-semibold text-foreground/80">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Agent Execution Trace
              </span>
              <span className="text-[0.68rem] text-muted-foreground">Autonomous Runner</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {activeLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-muted-foreground/60 shrink-0">{log.timestamp}</span>
                  <span
                    className={`font-semibold shrink-0 ${
                      log.status === 'success'
                        ? 'text-emerald-400'
                        : log.status === 'pending'
                        ? 'text-amber-400'
                        : 'text-sky-400'
                    }`}
                  >
                    [{log.phase.toUpperCase()}]
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground/90">{log.message}</span>
                    {log.detail && (
                      <p className="text-[0.72rem] text-muted-foreground/75 truncate">{log.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Discovery Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode('daily')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              mode === 'daily'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="CalendarDaysIcon" size={14} />
            Daily 10 Curated
            <span
              className={`rounded-full px-1.5 py-0.2 text-[0.65rem] font-bold ${
                mode === 'daily' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-foreground'
              }`}
            >
              10
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode('demand')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              mode === 'demand'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="SparklesIcon" size={14} />
            On-Demand Agent Scout
          </button>

          <button
            type="button"
            onClick={() => setMode('saved')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              mode === 'saved'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="BookmarkIcon" size={14} />
            Saved Roles
            <span
              className={`rounded-full px-1.5 py-0.2 text-[0.65rem] font-bold ${
                mode === 'saved' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-foreground'
              }`}
            >
              {savedJobs.length}
            </span>
          </button>
        </div>

        {/* Quick Filter Inputs */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon
              name="MagnifyingGlassIcon"
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="Filter by keyword, skill, city..."
              className="h-8 rounded-lg border border-border/80 bg-input pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-60"
            />
          </div>

          <select
            value={minScoreFilter}
            onChange={(e) => setMinScoreFilter(Number(e.target.value))}
            className="h-8 rounded-lg border border-border/80 bg-input px-2 text-xs text-foreground focus:outline-none"
          >
            <option value={0}>All Scores</option>
            <option value={80}>80%+ Fit</option>
            <option value={90}>90%+ Fit</option>
          </select>
        </div>
      </div>

      {/* On-Demand Search Form (visible when mode === 'demand') */}
      {mode === 'demand' && (
        <form
          onSubmit={handleRunSearch}
          className="rounded-xl border border-border/80 bg-card p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Icon name="GlobeAltIcon" size={16} className="text-sky-500" />
              Configure Agent Search Parameters
            </h3>
            <span className="text-xs text-muted-foreground">Scouts live ATS &amp; career portals</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Target Role / Keywords
              </label>
              <input
                type="text"
                value={searchParams.query}
                onChange={(e) => setSearchParams({ ...searchParams, query: e.target.value })}
                placeholder="e.g. Senior Frontend Engineer, AI Engineer"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                Location
              </label>
              <input
                type="text"
                value={searchParams.location || ''}
                onChange={(e) => setSearchParams({ ...searchParams, location: e.target.value })}
                placeholder="e.g. San Francisco, CA, London, Global"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 cursor-pointer pb-2 text-xs font-medium text-foreground select-none">
                <input
                  type="checkbox"
                  checked={searchParams.remoteOnly}
                  onChange={(e) => setSearchParams({ ...searchParams, remoteOnly: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                Remote Only Roles
              </label>
            </div>
          </div>

          {/* Quick preset pills */}
          <div className="space-y-2 pt-1 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium text-[0.72rem] mr-1">Popular Roles:</span>
              {POPULAR_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSearchParams({ ...searchParams, query: role })}
                  className={`rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium transition-all ${
                    searchParams.query === role
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium text-[0.72rem] mr-1">Target Companies:</span>
              {POPULAR_COMPANIES.map((company) => {
                const isSelected = searchParams.targetCompanies?.includes(company);
                return (
                  <button
                    key={company}
                    type="button"
                    onClick={() => {
                      const current = searchParams.targetCompanies || [];
                      const next = isSelected
                        ? current.filter((c) => c !== company)
                        : [...current, company];
                      setSearchParams({ ...searchParams, targetCompanies: next });
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/15 text-sky-400 font-semibold'
                        : 'border-border/70 bg-secondary/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {company}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              <Icon
                name={isSearching ? 'ArrowPathIcon' : 'SparklesIcon'}
                size={14}
                className={isSearching ? 'animate-spin' : ''}
              />
              {isSearching ? 'Agent Scanning Web & ATS...' : 'Run Discovery Agent'}
            </button>
          </div>
        </form>
      )}

      {/* Jobs List Render */}
      {loadingDaily && mode === 'daily' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="lab-card p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
              <div className="h-12 w-full rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : currentList.length === 0 ? (
        <div className="lab-card p-12 text-center max-w-lg mx-auto">
          <div className="cs-empty-badge">
            <Icon name="BriefcaseIcon" size={28} className="text-primary" />
          </div>
          <h3 className="font-heading text-base font-semibold text-foreground mb-1">
            {mode === 'saved'
              ? 'No saved jobs yet'
              : mode === 'demand'
              ? 'Ready for On-Demand Search'
              : 'No daily jobs matched your filters'}
          </h3>
          <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
            {mode === 'saved'
              ? 'Click the bookmark icon on any discovered job to save it here for quick reference.'
              : mode === 'demand'
              ? 'Enter a target role or select companies above, then click "Run Discovery Agent" to search the web.'
              : 'Try clearing your keyword or score filters to see all 10 curated jobs.'}
          </p>
          {mode === 'demand' && (
            <button
              type="button"
              onClick={() => handleRunSearch()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              <Icon name="SparklesIcon" size={14} />
              Run Quick Search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {currentList.map((job) => (
            <div
              key={job.id}
              className="lab-glow group flex flex-col rounded-lg border bg-card p-5 lab-edge text-left transition-all"
              style={{ '--lab-identity': '#0EA5E9' } as React.CSSProperties}
            >
              {/* Header: Company Monogram + Title + Match Score */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    className="lab-tile h-10 w-10 shrink-0 font-bold text-sm tracking-wider"
                    aria-hidden="true"
                  >
                    {job.company.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-semibold leading-snug text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {job.title}
                    </h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/90">{job.company}</span>
                      <span>·</span>
                      <span>{job.location}</span>
                      {job.isRemote && (
                        <span className="rounded bg-sky-500/10 px-1.5 py-0.2 text-[0.68rem] font-semibold text-sky-400">
                          Remote
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score Pill & Bookmark */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      job.matchScore >= 90
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : job.matchScore >= 80
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {job.matchScore}% Fit
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleSave(job)}
                    className={`p-1.5 rounded-md hover:bg-secondary transition-all ${
                      job.saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={job.saved ? 'Saved' : 'Save job'}
                  >
                    <Icon name={job.saved ? 'BookmarkIcon' : 'BookmarkIcon'} size={16} />
                  </button>
                </div>
              </div>

              {/* Salary & Meta */}
              {job.salary && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-secondary/30 px-2.5 py-1 rounded-md">
                  <Icon name="CurrencyDollarIcon" size={13} className="text-emerald-500" />
                  {job.salary}
                </div>
              )}

              {/* Snippet & Match Rationale */}
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                {job.descriptionSnippet}
              </p>

              {job.matchReason && (
                <div className="mt-2 flex items-center gap-1.5 text-[0.72rem] text-muted-foreground/90 italic">
                  <Icon name="CheckCircleIcon" size={13} className="text-emerald-500 shrink-0" />
                  <span className="truncate">{job.matchReason}</span>
                </div>
              )}

              {/* Key Skills Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.keySkills.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-md bg-secondary/70 px-2 py-0.5 text-[0.7rem] font-medium text-foreground/75"
                  >
                    {skill}
                  </span>
                ))}
                {job.keySkills.length > 4 && (
                  <span className="text-[0.68rem] text-muted-foreground self-center">
                    +{job.keySkills.length - 4} more
                  </span>
                )}
              </div>

              {/* Footer Actions */}
              <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* External links */}
                <div className="flex items-center gap-2">
                  <a
                    href={job.careersUrl || job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon name="GlobeAltIcon" size={13} />
                    Career Site
                  </a>
                  <span>·</span>
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    Apply Now
                    <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                  </a>
                </div>

                {/* Studio Cross-Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMatchJob(job)}
                    title="Audit profile match & gap analysis"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-foreground hover:bg-accent transition-all"
                  >
                    <Icon name="ScaleIcon" size={12} />
                    Match Gap
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTailorResume(job)}
                    title="Tailor a resume for this job"
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1 text-[0.72rem] font-semibold text-primary hover:bg-primary/20 transition-all"
                  >
                    <Icon name="SparklesIcon" size={12} />
                    Tailor Resume
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDraftCoverLetter(job)}
                    title="Draft a targeted cover letter"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-foreground hover:bg-accent transition-all"
                  >
                    <Icon name="EnvelopeIcon" size={12} />
                    Cover Letter
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
