'use client';

/** Job & People Tracker API — wraps /career/tracker/* (fe-apis/career twin). */

import { apiJson } from '../http/apiClient';

export type JobStage = 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected';
export type PersonStage = 'lead' | 'contacted' | 'in_touch' | 'referral' | 'closed';
export type Priority = 'low' | 'medium' | 'high';

export interface TrackedJob {
  id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  location: string | null;
  salary: string | null;
  raw_text: string;
  status: JobStage;
  priority: Priority;
  applied_at: string | null;
  deadline: string | null;
  notes: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface TrackedPerson {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  relationship: string;
  stage: PersonStage;
  job_id: string | null;
  notes: string;
  tags: string[];
  last_contacted: string | null;
  next_follow_up: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackerSummary {
  jobs: Record<string, number>;
  people: Record<string, number>;
  upcoming_deadlines: Array<{ id: string; title: string | null; company: string | null; deadline: string }>;
  follow_ups: Array<{ id: string; name: string; company: string | null; next_follow_up: string }>;
}

export type PersonInput = Partial<Omit<TrackedPerson, 'id' | 'created_at' | 'updated_at'>> & { name: string };
export type JobPatch = Partial<Pick<TrackedJob, 'status' | 'priority' | 'applied_at' | 'deadline' | 'notes' | 'rating' | 'title' | 'company' | 'url' | 'location' | 'salary'>>;

export const trackerService = {
  summary(): Promise<TrackerSummary> {
    return apiJson<TrackerSummary>('/career/tracker/summary');
  },
  listJobs(): Promise<TrackedJob[]> {
    return apiJson<TrackedJob[]>('/career/tracker/jobs');
  },
  createJob(input: Partial<TrackedJob> & { title?: string }): Promise<TrackedJob> {
    return apiJson<TrackedJob>('/career/tracker/jobs', { method: 'POST', body: JSON.stringify(input) });
  },
  updateJob(id: string, patch: JobPatch): Promise<TrackedJob> {
    return apiJson<TrackedJob>(`/career/tracker/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  listPeople(filters: { stage?: string; relationship?: string; job_id?: string; q?: string } = {}): Promise<TrackedPerson[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    const suffix = q.toString();
    return apiJson<TrackedPerson[]>(`/career/tracker/people${suffix ? `?${suffix}` : ''}`);
  },
  createPerson(input: PersonInput): Promise<TrackedPerson> {
    return apiJson<TrackedPerson>('/career/tracker/people', { method: 'POST', body: JSON.stringify(input) });
  },
  updatePerson(id: string, patch: Partial<PersonInput>): Promise<TrackedPerson> {
    return apiJson<TrackedPerson>(`/career/tracker/people/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deletePerson(id: string): Promise<{ status: string }> {
    return apiJson(`/career/tracker/people/${id}`, { method: 'DELETE' });
  },
};
