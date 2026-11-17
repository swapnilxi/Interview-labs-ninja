'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { LAB_REVEAL } from '@/modules/labs/common/LabSidebarParts';
import type { LabCatalog } from './useLabCatalog';
import { manageHref, type LabManagementConfig, type ManagedTopic } from './types';

/**
 * Patterns and topics: every pattern with its topics. A topic's name opens its Topic management; moving a topic to
 * another pattern and removing one the person added sit at the end of its row (on hover or focus, always on touch).
 */
export default function LabCatalogPanel<T extends ManagedTopic>({
  config,
  catalog,
}: {
  config: LabManagementConfig;
  catalog: LabCatalog<T>;
}) {
  const { topics, patterns, customPatterns, ready, error } = catalog;
  const { one } = config.groupNoun;
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const q = query.trim().toLowerCase();

  const submitGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await catalog.addGroup(name)) {
      setNewName('');
      setAdding(false);
    }
  };

  if (!ready)
    return <p className="py-[2rem] text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-[1.5rem]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-[16rem]">
          <Icon
            name="MagnifyingGlassIcon"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics"
            aria-label="Search topics"
            className="todo-input todo-input-quiet w-full py-2 pl-10 pr-3 text-sm"
          />
        </div>
        {config.can.addGroup && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="todo-btn todo-btn-secondary"
          >
            <Icon name="PlusIcon" size={14} />
            New {one}
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitGroup();
          }}
          className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Name of the ${one}`}
            aria-label={`Name of the new ${one}`}
            className="todo-input todo-input-quiet min-w-0 flex-1 basis-[14rem] px-3 py-2 text-sm"
          />
          <button type="submit" disabled={!newName.trim()} className="todo-btn todo-btn-primary">
            Add {one}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName('');
            }}
            className="todo-btn todo-btn-quiet"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="space-y-[1.5rem]">
        {patterns.map((pattern) => {
          const list = topics.filter(
            (t) => t.category === pattern && (!q || t.name.toLowerCase().includes(q))
          );
          if (q && list.length === 0) return null;
          const removable =
            config.can.removeGroup &&
            customPatterns.includes(pattern) &&
            !topics.some((t) => t.category === pattern);
          return (
            <section key={pattern} aria-label={pattern}>
              <div className="mb-2 flex min-h-[2rem] items-center gap-3 px-1">
                <h3 className="min-w-0 flex-1 break-words text-[15px] font-semibold text-foreground">
                  {pattern}
                  <span className="ml-2 text-[13px] font-normal tabular-nums text-muted-foreground">
                    {list.length}
                  </span>
                </h3>
                {removable && (
                  <button
                    type="button"
                    onClick={() => void catalog.removeGroup(pattern)}
                    className="todo-btn todo-btn-quiet px-2.5 py-1 text-xs"
                  >
                    Remove {one}
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">No topics yet</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {list.map((t) => (
                    <li
                      key={t.id}
                      className="group flex min-h-[2.75rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                    >
                      <Link
                        href={manageHref(config, { tab: 'topic', topic: t.id })}
                        className="todo-focus min-w-0 flex-1 break-words rounded text-sm text-foreground hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.isCustom && (
                        <span className="text-xs text-muted-foreground">
                          {t.isShared ? 'Everyone' : 'Only you'}
                        </span>
                      )}
                      {config.can.move && (
                        <select
                          value={t.category}
                          onChange={(e) => void catalog.moveTopic(t, e.target.value)}
                          aria-label={`Move ${t.name} to another ${one}`}
                          className={`todo-input todo-input-quiet w-full px-2.5 py-1 text-xs sm:w-[12rem] sm:flex-none ${LAB_REVEAL}`}
                        >
                          {patterns.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      )}
                      {catalog.canRemove(t) && (
                        <button
                          type="button"
                          onClick={() => void catalog.removeTopic(t)}
                          aria-label={`Remove ${t.name}`}
                          className={`todo-focus rounded-md p-1.5 text-muted-foreground hover:text-error ${LAB_REVEAL}`}
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {q && !topics.some((t) => t.name.toLowerCase().includes(q)) && (
          <p className="py-[1.5rem] text-center text-sm text-muted-foreground">
            No topic matches “{query.trim()}”
          </p>
        )}
        <p className="px-1 text-xs text-muted-foreground">
          A topic everyone shares moves for you only.
        </p>
      </div>
    </div>
  );
}
