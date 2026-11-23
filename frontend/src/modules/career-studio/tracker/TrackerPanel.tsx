'use client';

/**
 * Job & People Tracker — one workspace, four views over the same data.
 *
 * Kanban (drag a card to change stage), Table (Excel-like, sortable + inline
 * edits), List (compact scan) and Timeline (by date). The view switch is a
 * preference, not a page: filters and selection survive every switch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  trackerService,
  type JobPatch,
  type JobStage,
  type PersonInput,
  type PersonStage,
  type Priority,
  type TrackedJob,
  type TrackedPerson,
  type TrackerSummary,
} from '@/lib/services/trackerService';

type Entity = 'jobs' | 'people';
type ViewMode = 'kanban' | 'table' | 'list' | 'timeline';

const JOB_STAGES: Array<{ id: JobStage; label: string; dot: string; tint: string }> = [
  { id: 'saved', label: 'Saved', dot: 'bg-slate-400', tint: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  { id: 'applied', label: 'Applied', dot: 'bg-sky-500', tint: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { id: 'screening', label: 'Screening', dot: 'bg-violet-500', tint: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { id: 'interview', label: 'Interview', dot: 'bg-amber-500', tint: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'offer', label: 'Offer', dot: 'bg-emerald-500', tint: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { id: 'rejected', label: 'Closed', dot: 'bg-rose-500', tint: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
];

const PEOPLE_STAGES: Array<{ id: PersonStage; label: string; dot: string; tint: string }> = [
  { id: 'lead', label: 'Lead', dot: 'bg-slate-400', tint: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  { id: 'contacted', label: 'Contacted', dot: 'bg-sky-500', tint: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { id: 'in_touch', label: 'In touch', dot: 'bg-violet-500', tint: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { id: 'referral', label: 'Referral', dot: 'bg-emerald-500', tint: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { id: 'closed', label: 'Closed', dot: 'bg-rose-500', tint: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
];

const PRIORITY_TINT: Record<Priority, string> = {
  low: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  high: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const VIEWS: Array<{ id: ViewMode; label: string; icon: string }> = [
  { id: 'kanban', label: 'Board', icon: 'ViewColumnsIcon' },
  { id: 'table', label: 'Table', icon: 'TableCellsIcon' },
  { id: 'list', label: 'List', icon: 'ListBulletIcon' },
  { id: 'timeline', label: 'Timeline', icon: 'CalendarDaysIcon' },
];

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

interface Props {
  showToast: (message: string, type?: 'success' | 'error') => void;
  onGoToJobs?: () => void;
}

export default function TrackerPanel({ showToast, onGoToJobs }: Props) {
  const [entity, setEntity] = useState<Entity>('jobs');
  const [view, setView] = useState<ViewMode>('kanban');
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [people, setPeople] = useState<TrackedPerson[]>([]);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'updated_at', dir: 'desc' });
  const [editingJob, setEditingJob] = useState<TrackedJob | null>(null);
  const [editingPerson, setEditingPerson] = useState<TrackedPerson | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, p, s] = await Promise.all([trackerService.listJobs(), trackerService.listPeople(), trackerService.summary()]);
      setJobs(j);
      setPeople(p);
      setSummary(s);
    } catch (e: any) {
      showToast(e?.message || 'Could not load the tracker', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filteredJobs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = jobs.filter((j) =>
      (!needle || `${j.title || ''} ${j.company || ''} ${j.location || ''} ${j.notes || ''}`.toLowerCase().includes(needle)) &&
      (!stageFilter || j.status === stageFilter) &&
      (!priorityFilter || j.priority === priorityFilter));
    return [...out].sort((a, b) => {
      const av = String((a as any)[sort.key] ?? '');
      const bv = String((b as any)[sort.key] ?? '');
      const cmp = av.localeCompare(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [jobs, q, stageFilter, priorityFilter, sort]);

  const filteredPeople = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = people.filter((p) =>
      (!needle || `${p.name} ${p.role || ''} ${p.company || ''} ${p.notes || ''}`.toLowerCase().includes(needle)) &&
      (!stageFilter || p.stage === stageFilter));
    return [...out].sort((a, b) => {
      const av = String((a as any)[sort.key] ?? '');
      const bv = String((b as any)[sort.key] ?? '');
      const cmp = av.localeCompare(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [people, q, stageFilter, sort]);

  const patchJob = async (id: string, patch: JobPatch) => {
    try {
      const updated = await trackerService.updateJob(id, patch);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    } catch (e: any) {
      showToast(e?.message || 'Could not update the job', 'error');
    }
  };

  const patchPerson = async (id: string, patch: Partial<PersonInput>) => {
    try {
      const updated = await trackerService.updatePerson(id, patch);
      setPeople((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e: any) {
      showToast(e?.message || 'Could not update the person', 'error');
    }
  };

  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  const stages = entity === 'jobs' ? JOB_STAGES : PEOPLE_STAGES;
  const activeCount = jobs.filter((j) => !['saved', 'rejected'].includes(j.status)).length;
  const interviewCount = jobs.filter((j) => j.status === 'interview' || j.status === 'offer').length;

  return (
    <div className="space-y-[1.25rem]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-[1rem]">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Job & People Tracker</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your pipeline and the people in it — switch views without losing your place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onGoToJobs && (
            <button type="button" onClick={onGoToJobs} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-[0.875rem] text-sm font-medium text-foreground hover:bg-fill">
              <Icon name="MagnifyingGlassIcon" size={16} /> Find jobs
            </button>
          )}
          <button
            type="button"
            onClick={() => { setEditingJob(null); setEditingPerson(null); setFormOpen(true); }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-[0.875rem] text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            <Icon name="PlusIcon" size={16} /> Add {entity === 'jobs' ? 'job' : 'person'}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="BriefcaseIcon" label="Tracked jobs" value={jobs.length} tone="text-sky-600" />
        <StatCard icon="PaperAirplaneIcon" label="Active" value={activeCount} tone="text-violet-600" />
        <StatCard icon="SparklesIcon" label="Interview / offer" value={interviewCount} tone="text-amber-600" />
        <StatCard icon="UserGroupIcon" label="People" value={people.length} tone="text-emerald-600" />
      </div>

      {(summary?.upcoming_deadlines.length || summary?.follow_ups.length) ? (
        <div className="lab-card flex flex-wrap items-center gap-x-6 gap-y-2 px-[1rem] py-[0.75rem] text-xs text-muted-foreground">
          {summary?.upcoming_deadlines[0] && (
            <span className="inline-flex items-center gap-1.5"><Icon name="CalendarDaysIcon" size={14} /> Next deadline: <strong className="text-foreground">{summary.upcoming_deadlines[0].title || 'Job'}</strong> · {fmtDate(summary.upcoming_deadlines[0].deadline)}</span>
          )}
          {summary?.follow_ups[0] && (
            <span className="inline-flex items-center gap-1.5"><Icon name="BellIcon" size={14} /> Follow up: <strong className="text-foreground">{summary.follow_ups[0].name}</strong> · {fmtDate(summary.follow_ups[0].next_follow_up)}</span>
          )}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="lab-card flex flex-col gap-3 px-[1rem] py-[0.875rem] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-fill p-1" role="group" aria-label="Track jobs or people">
            {(['jobs', 'people'] as Entity[]).map((e) => (
              <button key={e} type="button" onClick={() => { setEntity(e); setStageFilter(''); }}
                aria-pressed={entity === e}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${entity === e ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon name={e === 'jobs' ? 'BriefcaseIcon' : 'UserGroupIcon'} size={15} /> {e === 'jobs' ? 'Jobs' : 'People'}
                <span className="rounded-full bg-fill px-1.5 text-[11px]">{e === 'jobs' ? jobs.length : people.length}</span>
              </button>
            ))}
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1" role="group" aria-label="View mode">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id} title={`${v.label} view`}
                className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors ${view === v.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-fill hover:text-foreground'}`}>
                <Icon name={v.icon} size={15} /> <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 sm:w-56 sm:flex-none">
            <span className="sr-only">Search</span>
            <Icon name="MagnifyingGlassIcon" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={entity === 'jobs' ? 'Search roles, companies…' : 'Search people…'}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label>
            <span className="sr-only">Filter by stage</span>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary">
              <option value="">All stages</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {entity === 'jobs' && (
            <label>
              <span className="sr-only">Filter by priority</span>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary">
                <option value="">Any priority</option>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="lab-card p-10 text-center text-sm text-muted-foreground">Loading tracker…</div>
      ) : entity === 'jobs' ? (
        <>
          {view === 'kanban' && <JobBoard jobs={filteredJobs} onMove={(id, status) => patchJob(id, { status })} onEdit={(j) => { setEditingJob(j); setFormOpen(true); }} dragId={dragId} setDragId={setDragId} />}
          {view === 'table' && <JobTable jobs={filteredJobs} sort={sort} onSort={toggleSort} onPatch={patchJob} onEdit={(j) => { setEditingJob(j); setFormOpen(true); }} />}
          {view === 'list' && <JobList jobs={filteredJobs} onEdit={(j) => { setEditingJob(j); setFormOpen(true); }} onMove={(id, status) => patchJob(id, { status })} />}
          {view === 'timeline' && <JobTimeline jobs={filteredJobs} onEdit={(j) => { setEditingJob(j); setFormOpen(true); }} />}
        </>
      ) : (
        <>
          {view === 'kanban' && <PeopleBoard people={filteredPeople} jobs={jobs} onMove={(id, stage) => patchPerson(id, { stage })} onEdit={(p) => { setEditingPerson(p); setFormOpen(true); }} onDelete={async (id) => { await trackerService.deletePerson(id); setPeople((prev) => prev.filter((p) => p.id !== id)); showToast('Person removed'); }} dragId={dragId} setDragId={setDragId} />}
          {view === 'table' && <PeopleTable people={filteredPeople} sort={sort} onSort={toggleSort} onPatch={patchPerson} onEdit={(p) => { setEditingPerson(p); setFormOpen(true); }} />}
          {view === 'list' && <PeopleList people={filteredPeople} jobs={jobs} onEdit={(p) => { setEditingPerson(p); setFormOpen(true); }} onMove={(id, stage) => patchPerson(id, { stage })} />}
          {view === 'timeline' && <PeopleTimeline people={filteredPeople} onEdit={(p) => { setEditingPerson(p); setFormOpen(true); }} />}
        </>
      )}

      {formOpen && (
        <TrackerForm
          entity={entity}
          job={editingJob}
          person={editingPerson}
          jobs={jobs}
          onClose={() => setFormOpen(false)}
          onSaved={async () => { setFormOpen(false); await load(); showToast('Saved'); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="lab-card flex items-center gap-3 px-[1rem] py-[0.875rem]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fill ${tone}`}><Icon name={icon} size={19} /></span>
      <div className="min-w-0">
        <div className="text-xl font-semibold leading-tight text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, hint, action }: { icon: string; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="lab-card flex flex-col items-center px-[1rem] py-12 text-center">
      <span className="cs-empty-badge"><Icon name={icon} size={26} className="text-primary" /></span>
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function StageChip({ label, tint, dot }: { label: string; tint: string; dot?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tint}`}>{dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}{label}</span>;
}

function stageMeta(stages: ReadonlyArray<{ id: string; label: string; dot: string; tint: string }>, id: string) {
  return stages.find((s) => s.id === id) || stages[0];
}

// ── Jobs: Kanban ──────────────────────────────────────────────────────────────

function JobBoard({ jobs, onMove, onEdit, dragId, setDragId }: {
  jobs: TrackedJob[];
  onMove: (id: string, status: JobStage) => void;
  onEdit: (j: TrackedJob) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
}) {
  if (!jobs.length) return <EmptyState icon="BriefcaseIcon" title="No jobs in this view" hint="Add a job or clear the filters to see your pipeline." />;
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {JOB_STAGES.map((stage) => {
        const items = jobs.filter((j) => j.status === stage.id);
        return (
          <div key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) onMove(dragId, stage.id); setDragId(null); }}
            className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-border bg-fill/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><span className={`h-2 w-2 rounded-full ${stage.dot}`} />{stage.label}</span>
              <span className="rounded-full bg-background px-2 text-[11px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {items.map((j) => (
                <article key={j.id} draggable onDragStart={() => setDragId(j.id)} onDragEnd={() => setDragId(null)}
                  className={`cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm transition-opacity active:cursor-grabbing ${dragId === j.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onEdit(j)} className="min-w-0 text-left text-sm font-semibold text-foreground hover:underline">{j.title || 'Untitled role'}</button>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_TINT[j.priority as Priority] || PRIORITY_TINT.medium}`}>{j.priority}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{j.company || 'Unknown company'}{j.location ? ` · ${j.location}` : ''}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Icon name="CalendarDaysIcon" size={12} />{j.deadline ? fmtDate(j.deadline) : 'No deadline'}</span>
                    <span>{fmtDate(j.applied_at || j.created_at)}</span>
                  </div>
                </article>
              ))}
              {!items.length && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Drop here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Jobs: Table ───────────────────────────────────────────────────────────────

function JobTable({ jobs, sort, onSort, onPatch, onEdit }: {
  jobs: TrackedJob[];
  sort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void;
  onPatch: (id: string, patch: JobPatch) => void;
  onEdit: (j: TrackedJob) => void;
}) {
  if (!jobs.length) return <EmptyState icon="TableCellsIcon" title="Nothing to show" hint="Add a job or clear the filters." />;
  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">{children}<Icon name={sort.key === k && sort.dir === 'asc' ? 'ArrowUpIcon' : 'ArrowDownIcon'} size={11} className={sort.key === k ? '' : 'opacity-30'} /></button>
    </th>
  );
  return (
    <div className="lab-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead className="border-b border-border bg-fill/50"><tr>
            <Th k="title">Role</Th><Th k="company">Company</Th><Th k="status">Stage</Th><Th k="priority">Priority</Th>
            <Th k="applied_at">Applied</Th><Th k="deadline">Deadline</Th><Th k="rating">Rating</Th><th className="w-10" />
          </tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-fill/40">
                <td className="px-3 py-2"><button type="button" onClick={() => onEdit(j)} className="font-medium text-foreground hover:underline">{j.title || 'Untitled role'}</button></td>
                <td className="px-3 py-2 text-muted-foreground">{j.company || '—'}</td>
                <td className="px-3 py-2"><select aria-label={`Stage for ${j.title || 'job'}`} value={j.status} onChange={(e) => onPatch(j.id, { status: e.target.value as JobStage })} className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"><option value="saved">Saved</option><option value="applied">Applied</option><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="rejected">Closed</option></select></td>
                <td className="px-3 py-2"><select aria-label={`Priority for ${j.title || 'job'}`} value={j.priority} onChange={(e) => onPatch(j.id, { priority: e.target.value as Priority })} className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(j.applied_at)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(j.deadline)}</td>
                <td className="px-3 py-2"><input aria-label={`Rating for ${j.title || 'job'}`} type="number" min={0} max={5} value={j.rating} onChange={(e) => onPatch(j.id, { rating: Number(e.target.value) })} className="h-8 w-14 rounded-md border border-border bg-background px-1.5 text-xs text-foreground" /></td>
                <td className="px-2 py-2"><button type="button" onClick={() => onEdit(j)} aria-label="Edit job" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-fill hover:text-foreground"><Icon name="PencilIcon" size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Jobs: List ────────────────────────────────────────────────────────────────

function JobList({ jobs, onEdit, onMove }: { jobs: TrackedJob[]; onEdit: (j: TrackedJob) => void; onMove: (id: string, s: JobStage) => void }) {
  if (!jobs.length) return <EmptyState icon="ListBulletIcon" title="Nothing to show" hint="Add a job or clear the filters." />;
  return (
    <div className="lab-card divide-y divide-border">
      {jobs.map((j) => {
        const meta = stageMeta(JOB_STAGES, j.status);
        return (
          <div key={j.id} className="flex flex-wrap items-center gap-3 px-[1rem] py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fill text-sm font-bold text-foreground">{(j.company || j.title || '?').slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onEdit(j)} className="block truncate text-left text-sm font-semibold text-foreground hover:underline">{j.title || 'Untitled role'}</button>
              <p className="truncate text-xs text-muted-foreground">{j.company || 'Unknown company'}{j.location ? ` · ${j.location}` : ''}</p>
            </div>
            <StageChip label={meta.label} tint={meta.tint} dot={meta.dot} />
            <select aria-label={`Move ${j.title || 'job'} to stage`} value={j.status} onChange={(e) => onMove(j.id, e.target.value as JobStage)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
              {JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="w-20 text-right text-xs text-muted-foreground">{fmtDate(j.deadline)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Jobs: Timeline ────────────────────────────────────────────────────────────

function JobTimeline({ jobs, onEdit }: { jobs: TrackedJob[]; onEdit: (j: TrackedJob) => void }) {
  if (!jobs.length) return <EmptyState icon="CalendarDaysIcon" title="Nothing on the timeline" hint="Add application or deadline dates to see them here." />;
  const groups = new Map<string, TrackedJob[]>();
  for (const j of jobs) {
    const key = j.applied_at || j.deadline || j.created_at;
    const label = fmtDate(key);
    groups.set(label, [...(groups.get(label) || []), j]);
  }
  return (
    <div className="lab-card px-[1rem] py-[1rem]">
      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="relative pl-8 pb-6 last:pb-0 before:absolute before:left-[0.4rem] before:top-2 before:h-full before:w-px before:bg-border last:before:hidden">
          <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
          <div className="space-y-2">
            {items.map((j) => {
              const meta = stageMeta(JOB_STAGES, j.status);
              return (
                <button key={j.id} type="button" onClick={() => onEdit(j)} className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-fill/50">
                  <span className="text-sm font-medium text-foreground">{j.title || 'Untitled role'}</span>
                  <span className="text-xs text-muted-foreground">{j.company}</span>
                  <span className="ml-auto"><StageChip label={meta.label} tint={meta.tint} dot={meta.dot} /></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── People: Kanban ────────────────────────────────────────────────────────────

function PeopleBoard({ people, jobs, onMove, onEdit, onDelete, dragId, setDragId }: {
  people: TrackedPerson[]; jobs: TrackedJob[];
  onMove: (id: string, stage: PersonStage) => void;
  onEdit: (p: TrackedPerson) => void;
  onDelete: (id: string) => void;
  dragId: string | null; setDragId: (id: string | null) => void;
}) {
  if (!people.length) return <EmptyState icon="UserGroupIcon" title="No people in this view" hint="Add a recruiter, hiring manager or referral to start your network." />;
  const jobName = (id: string | null) => jobs.find((j) => j.id === id)?.title || null;
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {PEOPLE_STAGES.map((stage) => {
        const items = people.filter((p) => p.stage === stage.id);
        return (
          <div key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) onMove(dragId, stage.id); setDragId(null); }}
            className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-border bg-fill/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><span className={`h-2 w-2 rounded-full ${stage.dot}`} />{stage.label}</span>
              <span className="rounded-full bg-background px-2 text-[11px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {items.map((p) => (
                <article key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
                  className={`cursor-grab rounded-lg border border-border bg-background p-3 ${dragId === p.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-bold text-foreground">{initials(p.name)}</span>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => onEdit(p)} className="block truncate text-left text-sm font-semibold text-foreground hover:underline">{p.name}</button>
                      <p className="truncate text-xs text-muted-foreground">{[p.role, p.company].filter(Boolean).join(' · ') || p.relationship}</p>
                    </div>
                    <button type="button" onClick={() => onDelete(p.id)} aria-label={`Remove ${p.name}`} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-fill hover:text-error"><Icon name="TrashIcon" size={14} /></button>
                  </div>
                  {jobName(p.job_id) && <p className="mt-2 truncate rounded bg-fill px-2 py-1 text-[11px] text-muted-foreground">↳ {jobName(p.job_id)}</p>}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{p.email || p.linkedin_url || 'No contact detail'}</span>
                    <span>{fmtDate(p.next_follow_up)}</span>
                  </div>
                </article>
              ))}
              {!items.length && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Drop here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── People: Table ─────────────────────────────────────────────────────────────

function PeopleTable({ people, sort, onSort, onPatch, onEdit }: {
  people: TrackedPerson[];
  sort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void;
  onPatch: (id: string, patch: Partial<PersonInput>) => void;
  onEdit: (p: TrackedPerson) => void;
}) {
  if (!people.length) return <EmptyState icon="TableCellsIcon" title="Nothing to show" hint="Add a person or clear the filters." />;
  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th scope="col" className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">{children}<Icon name={sort.key === k && sort.dir === 'asc' ? 'ArrowUpIcon' : 'ArrowDownIcon'} size={11} className={sort.key === k ? '' : 'opacity-30'} /></button>
    </th>
  );
  return (
    <div className="lab-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead className="border-b border-border bg-fill/50"><tr>
            <Th k="name">Name</Th><Th k="role">Role</Th><Th k="company">Company</Th><Th k="relationship">Relationship</Th>
            <Th k="stage">Stage</Th><Th k="last_contacted">Last contact</Th><Th k="next_follow_up">Follow up</Th><th className="w-10" />
          </tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-fill/40">
                <td className="px-3 py-2"><button type="button" onClick={() => onEdit(p)} className="font-medium text-foreground hover:underline">{p.name}</button></td>
                <td className="px-3 py-2 text-muted-foreground">{p.role || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.company || '—'}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{p.relationship.replace(/_/g, ' ')}</td>
                <td className="px-3 py-2"><select aria-label={`Stage for ${p.name}`} value={p.stage} onChange={(e) => onPatch(p.id, { stage: e.target.value as PersonStage })} className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground">{PEOPLE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(p.last_contacted)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(p.next_follow_up)}</td>
                <td className="px-2 py-2"><button type="button" onClick={() => onEdit(p)} aria-label="Edit person" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-fill hover:text-foreground"><Icon name="PencilIcon" size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── People: List ──────────────────────────────────────────────────────────────

function PeopleList({ people, jobs, onEdit, onMove }: { people: TrackedPerson[]; jobs: TrackedJob[]; onEdit: (p: TrackedPerson) => void; onMove: (id: string, s: PersonStage) => void }) {
  if (!people.length) return <EmptyState icon="ListBulletIcon" title="Nothing to show" hint="Add a person or clear the filters." />;
  return (
    <div className="lab-card divide-y divide-border">
      {people.map((p) => {
        const meta = stageMeta(PEOPLE_STAGES, p.stage);
        const job = jobs.find((j) => j.id === p.job_id);
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-[1rem] py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-bold text-foreground">{initials(p.name)}</span>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onEdit(p)} className="block truncate text-left text-sm font-semibold text-foreground hover:underline">{p.name}</button>
              <p className="truncate text-xs text-muted-foreground">{[p.role, p.company].filter(Boolean).join(' · ') || p.relationship}{job ? ` · ${job.title || 'Job'}` : ''}</p>
            </div>
            <StageChip label={meta.label} tint={meta.tint} dot={meta.dot} />
            <select aria-label={`Move ${p.name} to stage`} value={p.stage} onChange={(e) => onMove(p.id, e.target.value as PersonStage)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
              {PEOPLE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span className="w-20 text-right text-xs text-muted-foreground">{fmtDate(p.next_follow_up)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── People: Timeline ──────────────────────────────────────────────────────────

function PeopleTimeline({ people, onEdit }: { people: TrackedPerson[]; onEdit: (p: TrackedPerson) => void }) {
  if (!people.length) return <EmptyState icon="CalendarDaysIcon" title="Nothing on the timeline" hint="Add contact or follow-up dates to see them here." />;
  const groups = new Map<string, TrackedPerson[]>();
  for (const p of people) {
    const key = p.next_follow_up || p.last_contacted || p.created_at;
    const label = fmtDate(key);
    groups.set(label, [...(groups.get(label) || []), p]);
  }
  return (
    <div className="lab-card px-[1rem] py-[1rem]">
      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="relative pl-8 pb-6 last:pb-0 before:absolute before:left-[0.4rem] before:top-2 before:h-full before:w-px before:bg-border last:before:hidden">
          <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
          <div className="space-y-2">
            {items.map((p) => {
              const meta = stageMeta(PEOPLE_STAGES, p.stage);
              return (
                <button key={p.id} type="button" onClick={() => onEdit(p)} className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-fill/50">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{[p.role, p.company].filter(Boolean).join(' · ')}</span>
                  <span className="ml-auto"><StageChip label={meta.label} tint={meta.tint} dot={meta.dot} /></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Add / edit form ───────────────────────────────────────────────────────────

function TrackerForm({ entity, job, person, jobs, onClose, onSaved, showToast }: {
  entity: Entity; job: TrackedJob | null; person: TrackedPerson | null; jobs: TrackedJob[];
  onClose: () => void; onSaved: () => void; showToast: (m: string, t?: 'success' | 'error') => void;
}) {
  const [saving, setSaving] = useState(false);
  const [jf, setJf] = useState({
    title: job?.title || '', company: job?.company || '', url: job?.url || '', location: job?.location || '',
    salary: job?.salary || '', status: job?.status || 'saved', priority: job?.priority || 'medium',
    applied_at: job?.applied_at || '', deadline: job?.deadline || '', notes: job?.notes || '', rating: job?.rating || 0,
  });
  const [pf, setPf] = useState({
    name: person?.name || '', role: person?.role || '', company: person?.company || '', email: person?.email || '',
    phone: person?.phone || '', linkedin_url: person?.linkedin_url || '', relationship: person?.relationship || 'recruiter',
    stage: person?.stage || 'lead', job_id: person?.job_id || '', notes: person?.notes || '',
    last_contacted: person?.last_contacted || '', next_follow_up: person?.next_follow_up || '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (entity === 'jobs') {
        const payload = { ...jf, rating: Number(jf.rating), raw_text: jf.notes || jf.title };
        if (job) await trackerService.updateJob(job.id, payload);
        else await trackerService.createJob(payload);
      } else {
        const payload: PersonInput = { ...pf, job_id: pf.job_id || null, tags: person?.tags || [] };
        if (person) await trackerService.updatePerson(person.id, payload);
        else await trackerService.createPerson(payload);
      }
      onSaved();
    } catch (err: any) {
      showToast(err?.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: string, value: string | number, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={entity === 'jobs' ? 'Job details' : 'Person details'} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="lab-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">{job || person ? 'Edit' : 'Add'} {entity === 'jobs' ? 'job' : 'person'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-fill"><Icon name="XMarkIcon" size={18} /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {entity === 'jobs' ? (
            <>
              {field('Role', 'title', jf.title, (v) => setJf({ ...jf, title: v }), 'text', 'Senior Frontend Engineer')}
              {field('Company', 'company', jf.company, (v) => setJf({ ...jf, company: v }), 'text', 'Acme')}
              {field('Location', 'location', jf.location, (v) => setJf({ ...jf, location: v }), 'text', 'Remote')}
              {field('Salary', 'salary', jf.salary, (v) => setJf({ ...jf, salary: v }), 'text', '$140k–$180k')}
              {field('Applied on', 'applied_at', jf.applied_at, (v) => setJf({ ...jf, applied_at: v }), 'date')}
              {field('Deadline', 'deadline', jf.deadline, (v) => setJf({ ...jf, deadline: v }), 'date')}
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Stage</span>
                <select value={jf.status} onChange={(e) => setJf({ ...jf, status: e.target.value as JobStage })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">{JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Priority</span>
                <select value={jf.priority} onChange={(e) => setJf({ ...jf, priority: e.target.value as Priority })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">Notes</span>
                <textarea value={jf.notes} onChange={(e) => setJf({ ...jf, notes: e.target.value })} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" /></label>
            </>
          ) : (
            <>
              {field('Name', 'name', pf.name, (v) => setPf({ ...pf, name: v }), 'text', 'Alex Rivera')}
              {field('Role', 'role', pf.role, (v) => setPf({ ...pf, role: v }), 'text', 'Technical Recruiter')}
              {field('Company', 'company', pf.company, (v) => setPf({ ...pf, company: v }))}
              {field('Email', 'email', pf.email, (v) => setPf({ ...pf, email: v }), 'email')}
              {field('Phone', 'phone', pf.phone, (v) => setPf({ ...pf, phone: v }))}
              {field('LinkedIn', 'linkedin_url', pf.linkedin_url, (v) => setPf({ ...pf, linkedin_url: v }), 'url')}
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Relationship</span>
                <select value={pf.relationship} onChange={(e) => setPf({ ...pf, relationship: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  {['recruiter', 'hiring_manager', 'peer', 'mentor', 'referral', 'other'].map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Stage</span>
                <select value={pf.stage} onChange={(e) => setPf({ ...pf, stage: e.target.value as PersonStage })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">{PEOPLE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Linked job</span>
                <select value={pf.job_id} onChange={(e) => setPf({ ...pf, job_id: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                  <option value="">None</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title || 'Untitled role'} — {j.company || ''}</option>)}
                </select></label>
              {field('Last contacted', 'last_contacted', pf.last_contacted, (v) => setPf({ ...pf, last_contacted: v }), 'date')}
              {field('Next follow-up', 'next_follow_up', pf.next_follow_up, (v) => setPf({ ...pf, next_follow_up: v }), 'date')}
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted-foreground">Notes</span>
                <textarea value={pf.notes} onChange={(e) => setPf({ ...pf, notes: e.target.value })} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" /></label>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-fill">Cancel</button>
          <button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
