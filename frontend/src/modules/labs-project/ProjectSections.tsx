'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import {
  fetchSections,
  formatServerDate,
  sectionHref,
  type LabProject,
  type ProjectSection,
} from '@/lib/services/labProjectsService';
import {
  EmptyState,
  ErrorBlock,
  fieldClass,
  LabBadge,
  LoadingBlock,
  quietButton,
} from '@/modules/labs-project/ui';

/**
 * Project Sections: everything saved to the project from the labs, newest first, with the lab each one
 * came from. Search matches titles and the full text (the server does it); the lab filter narrows the list.
 */
export default function ProjectSections({ project }: { project: LabProject }) {
  const [all, setAll] = useState<ProjectSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ProjectSection[] | null>(null); // server-side search result
  const [searching, setSearching] = useState(false);
  const [lab, setLab] = useState('');

  const load = useCallback(() => {
    setError(null);
    fetchSections(project.id)
      .then(setAll)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the sections.'));
  }, [project.id]);

  useEffect(() => {
    setAll(null);
    setQuery('');
    setLab('');
    setFound(null);
    load();
  }, [load]);

  // The search runs on the server (it covers the whole text, the list only carries an excerpt), after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let stale = false;
    const timer = setTimeout(() => {
      fetchSections(project.id, { q })
        .then((rows) => !stale && setFound(rows))
        .catch((e) => !stale && setError(e instanceof Error ? e.message : 'Search failed.'))
        .finally(() => !stale && setSearching(false));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, project.id]);

  const labs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of all ?? [])
      if (!seen.has(s.sourceLabId)) seen.set(s.sourceLabId, s.sourceLabName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [all]);

  const base = query.trim() ? (found ?? []) : (all ?? []);
  const shown = lab ? base.filter((s) => s.sourceLabId === lab) : base;

  if (error && all === null) return <ErrorBlock message={error} onRetry={load} />;
  if (all === null) return <LoadingBlock label="Loading sections…" />;

  if (all.length === 0) {
    return (
      <EmptyState icon="BookmarkIcon" title="No saved sections yet">
        <p>
          Open any lab, pick this project in its project menu, generate something and choose{' '}
          <span className="font-semibold text-foreground">Save to Project</span>. It will show up
          here, labelled with the lab it came from, and later generations in this project can build
          on it.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[
            ['DSA Lab', '/dsa-lab'],
            ['CV Lab', '/cv-lab'],
            ['System Design', '/system-design-lab'],
          ].map(([label, href]) => (
            <Link key={href} href={href} className={quietButton}>
              {label}
            </Link>
          ))}
        </div>
      </EmptyState>
    );
  }

  return (
    <section aria-label="Project sections">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="MagnifyingGlassIcon"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and content"
            aria-label="Search sections by title or content"
            className={`${fieldClass} pl-9`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Source lab</span>
          <select
            value={lab}
            onChange={(e) => setLab(e.target.value)}
            className={`${fieldClass} sm:w-[12rem]`}
            aria-label="Filter by source lab"
          >
            <option value="">All labs</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mb-3 text-xs text-muted-foreground" role="status" aria-live="polite">
        {searching
          ? 'Searching…'
          : `${shown.length} of ${all.length} section${all.length === 1 ? '' : 's'}`}
      </p>

      {error && (
        <div className="mb-3">
          <ErrorBlock message={error} />
        </div>
      )}

      {shown.length === 0 && !searching ? (
        <EmptyState icon="MagnifyingGlassIcon" title="No sections match">
          <p>Try a different search or choose “All labs”.</p>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {shown.map((s) => (
            <li key={s.id}>
              <Link
                href={sectionHref(project.id, s.id)}
                className="todo-focus block px-4 py-3 transition-colors hover:mix-bg-foreground/[0.05] focus-visible:ring-inset focus-visible:ring-offset-0"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h3 className="min-w-0 break-words font-heading text-base font-semibold text-foreground">
                    {s.title}
                  </h3>
                  <LabBadge name={s.sourceLabName} />
                  <span className="text-xs font-medium text-muted-foreground sm:ml-auto">
                    Updated {formatServerDate(s.updatedAt)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 break-words text-sm mix-text-foreground/[0.74]">
                  {s.excerpt}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
