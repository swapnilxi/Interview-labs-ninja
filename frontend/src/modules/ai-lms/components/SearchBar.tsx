'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsSearchResult } from '../types';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LmsSearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await lmsService.search(query.trim());
        setResults(res);
        setIsOpen(true);
      } catch {
        // Ignore search errors
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalResults = results
    ? results.classes.length + results.subjects.length + results.lessons.length
    : 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-muted-foreground pointer-events-none">
          <Icon name={loading ? 'ArrowPathIcon' : 'MagnifyingGlassIcon'} size={18} className={loading ? 'animate-spin' : ''} />
        </div>
        <input
          type="text"
          placeholder="Search classes, subjects, lessons..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results && totalResults > 0) setIsOpen(true);
          }}
          className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults(null);
              setIsOpen(false);
            }}
            className="absolute right-3 text-muted-foreground hover:text-foreground p-0.5"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results && (
        <div className="absolute top-full left-0 right-0 mt-2 z-[250] bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[420px] overflow-y-auto animate-fadeIn divide-y divide-border/60">
          {totalResults === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No matching classes, subjects, or lessons found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Classes */}
              {results.classes.length > 0 && (
                <div className="p-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
                    Classes ({results.classes.length})
                  </div>
                  <div className="space-y-1">
                    {results.classes.map((cls) => (
                      <Link
                        key={cls.id}
                        href={`/ai-lms/classes/${cls.slug}`}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                          <Icon name={(cls.icon || 'BookmarkIcon') as any} size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs truncate">{cls.name}</div>
                          {cls.description && (
                            <div className="text-[11px] text-muted-foreground truncate">{cls.description}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Subjects */}
              {results.subjects.length > 0 && (
                <div className="p-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
                    Subjects ({results.subjects.length})
                  </div>
                  <div className="space-y-1">
                    {results.subjects.map((subj) => (
                      <Link
                        key={subj.id}
                        href={`/ai-lms/classes/${subj.class_slug}/${subj.slug}`}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                          <Icon name="FolderIcon" size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs truncate">{subj.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            Class: {subj.class_name}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Lessons */}
              {results.lessons.length > 0 && (
                <div className="p-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
                    Lessons ({results.lessons.length})
                  </div>
                  <div className="space-y-1">
                    {results.lessons.map((lesson) => {
                      const lessonHref = lesson.subject_slug
                        ? `/ai-lms/classes/${lesson.class_slug}/${lesson.subject_slug}/${lesson.slug}`
                        : `/ai-lms/classes/${lesson.class_slug}/lesson/${lesson.slug}`;

                      return (
                        <Link
                          key={lesson.id}
                          href={lessonHref}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                            <Icon name="DocumentTextIcon" size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs truncate">{lesson.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {lesson.class_name} {lesson.subject_name ? `→ ${lesson.subject_name}` : ''}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
