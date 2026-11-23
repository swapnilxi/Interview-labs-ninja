import type { Resume } from '@/modules/career-studio/shared/types';
import type { DiscoveredJob, AgentLogEntry } from '@/app/api/career/job-finder/route';

export type { DiscoveredJob, AgentLogEntry };

export interface JobSearchParams {
  query: string;
  location?: string;
  targetCompanies?: string[];
  remoteOnly?: boolean;
}

const SAVED_JOBS_KEY = 'labninja.career.jobfinder.saved_jobs.v1';
const DAILY_CACHE_PREFIX = 'labninja.career.jobfinder.daily.';

function extractSkillsFromProfile(profile?: Resume | null): string[] {
  if (!profile || !profile.sections) return [];
  const skills: string[] = [];

  for (const s of profile.sections) {
    if (s.section_type === 'skills') {
      const items = (s.content as any)?.items || [];
      for (const item of items) {
        if (typeof item === 'string') skills.push(item);
        else if (item && typeof item.name === 'string') skills.push(item.name);
      }
    }
  }

  return skills;
}

function extractProfileSummary(profile?: Resume | null): string {
  if (!profile || !profile.sections) return '';
  let summary = `Candidate: ${profile.title}. `;

  for (const s of profile.sections) {
    if (s.section_type === 'summary' && (s.content as any)?.text) {
      summary += (s.content as any).text + ' ';
    }
    if (s.section_type === 'experience') {
      const items = (s.content as any)?.items || [];
      if (items.length > 0) {
        summary += `Recent Roles: ${items.map((i: any) => `${i.title || ''} at ${i.company || ''}`).slice(0, 3).join(', ')}. `;
      }
    }
  }

  return summary.trim();
}

export const jobFinderService = {
  getSavedJobs(): DiscoveredJob[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(SAVED_JOBS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  isJobSaved(jobId: string): boolean {
    const list = this.getSavedJobs();
    return list.some((j) => j.id === jobId);
  },

  toggleSaveJob(job: DiscoveredJob): boolean {
    if (typeof window === 'undefined') return false;
    const list = this.getSavedJobs();
    const existingIndex = list.findIndex((j) => j.id === job.id);
    let isNowSaved = false;

    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
      isNowSaved = false;
    } else {
      list.unshift({ ...job, saved: true });
      isNowSaved = true;
    }

    try {
      localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to persist saved jobs', e);
    }

    return isNowSaved;
  },

  async fetchDailyJobs(profile?: Resume | null, forceRefresh = false): Promise<{ jobs: DiscoveredJob[]; logs: AgentLogEntry[]; date: string }> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${DAILY_CACHE_PREFIX}${today}`;

    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
            const savedList = this.getSavedJobs();
            const withSavedState = parsed.jobs.map((j: DiscoveredJob) => ({
              ...j,
              saved: savedList.some((s) => s.id === j.id),
            }));
            return { jobs: withSavedState, logs: parsed.logs || [], date: today };
          }
        }
      } catch {
        // Ignore cache parse error
      }
    }

    const profileSkills = extractSkillsFromProfile(profile);
    const profileContext = extractProfileSummary(profile);

    const res = await fetch('/api/career/job-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'daily',
        profileSkills,
        profileContext,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to load daily jobs (HTTP ${res.status})`);
    }

    const data = await res.json();
    const savedList = this.getSavedJobs();
    const enrichedJobs: DiscoveredJob[] = (data.jobs || []).map((j: DiscoveredJob) => ({
      ...j,
      saved: savedList.some((s) => s.id === j.id),
    }));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ jobs: enrichedJobs, logs: data.logs, date: today }));
      } catch {
        // Quota error ignored
      }
    }

    return {
      jobs: enrichedJobs,
      logs: data.logs || [],
      date: today,
    };
  },

  async runOnDemandSearch(params: JobSearchParams, profile?: Resume | null): Promise<{ jobs: DiscoveredJob[]; logs: AgentLogEntry[] }> {
    const profileSkills = extractSkillsFromProfile(profile);
    const profileContext = extractProfileSummary(profile);

    const res = await fetch('/api/career/job-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'on_demand',
        query: params.query,
        location: params.location,
        targetCompanies: params.targetCompanies,
        remoteOnly: params.remoteOnly,
        profileSkills,
        profileContext,
      }),
    });

    if (!res.ok) {
      throw new Error(`Job discovery agent search failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    const savedList = this.getSavedJobs();
    const enrichedJobs: DiscoveredJob[] = (data.jobs || []).map((j: DiscoveredJob) => ({
      ...j,
      saved: savedList.some((s) => s.id === j.id),
    }));

    return {
      jobs: enrichedJobs,
      logs: data.logs || [],
    };
  },
};
