'use client';

import { useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { LabAddRow } from './LabSidebarParts';

/** What the search needs to know about a topic. */
export interface SearchableTopic {
  id: string;
  name: string;
  category: string;
  subtopics: { id: string; name: string }[];
}

interface Hit {
  key: string;
  kind: string;
  label: string;
  open: () => void;
}

const MAX_HITS = 8;

/**
 * The search box of a lab's sidebar, the same in every lab (DSA, CV, System Design, Communication, Finance, Python, GenAI): type to find a
 * group, a topic or a subtopic (Enter opens the first match), and when nothing is named like that, the same text can be added as a topic
 * in a group (the open topic's by default) or as a new group. A topic or group is shown by the lab only once it is saved, so the add
 * callbacks answer whether it worked; the box clears when it did.
 */
export default function LabSidebarSearch({
  groupNoun,
  groups,
  topics,
  currentGroup,
  error,
  onOpenGroup,
  onOpenTopic,
  onOpenSubtopic,
  onAddTopic,
  onAddGroup,
}: {
  /** What the lab calls a group of topics: "pattern" (DSA), "category". */
  groupNoun: string;
  groups: string[];
  topics: SearchableTopic[];
  /** The group a new topic goes to unless another is picked: the open topic's. */
  currentGroup?: string | null;
  /** A failed add, shown under the box. */
  error?: string | null;
  onOpenGroup: (group: string) => void;
  onOpenTopic: (topicId: string) => void;
  onOpenSubtopic: (topicId: string, subtopicId: string) => void;
  onAddTopic: (group: string, name: string) => Promise<boolean>;
  onAddGroup: (name: string) => Promise<boolean>;
}) {
  const pickId = useId();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState('');
  const typed = query.trim();
  const q = typed.toLowerCase();
  const noun = groupNoun;
  const group = groups.includes(picked)
    ? picked
    : currentGroup && groups.includes(currentGroup)
      ? currentGroup
      : (groups[0] ?? '');
  const clear = () => setQuery('');

  const hits: Hit[] = q
    ? [
        ...groups
          .filter((n) => n.toLowerCase().includes(q))
          .map((n) => ({
            key: `g:${n}`,
            kind: noun.charAt(0).toUpperCase() + noun.slice(1),
            label: n,
            open: () => onOpenGroup(n),
          })),
        ...topics.flatMap((t) => [
          ...(t.name.toLowerCase().includes(q)
            ? [{ key: `t:${t.id}`, kind: 'Topic', label: t.name, open: () => onOpenTopic(t.id) }]
            : []),
          ...t.subtopics
            .filter((s) => s.name.toLowerCase().includes(q))
            .map((s) => ({
              key: `s:${t.id}:${s.id}`,
              kind: 'Subtopic',
              label: s.name,
              open: () => onOpenSubtopic(t.id, s.id),
            })),
        ]),
      ].slice(0, MAX_HITS)
    : [];
  const exact =
    groups.some((n) => n.toLowerCase() === q) || topics.some((t) => t.name.toLowerCase() === q);

  const addTopic = async () => {
    if (typed && group && (await onAddTopic(group, typed))) clear();
  };
  const addGroup = async () => {
    if (typed && (await onAddGroup(typed))) clear();
  };

  return (
    <div>
      <div className="relative">
        <Icon
          name="MagnifyingGlassIcon"
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') clear();
            if (e.key === 'Enter') {
              if (hits[0]) {
                hits[0].open();
                clear();
              } else void addTopic();
            }
          }}
          placeholder={`Search or add ${noun}, topic`}
          aria-label={`Search or add a ${noun}, topic or subtopic`}
          className="todo-input todo-input-quiet w-full py-1.5 pl-8 pr-8 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="todo-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground"
          >
            <Icon name="XMarkIcon" size={12} />
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 px-0.5 text-xs text-error">
          {error}
        </p>
      )}

      {q && (
        <ul className="mt-1.5 space-y-0.5" aria-label="Search results">
          {hits.map((h) => (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => {
                  h.open();
                  clear();
                }}
                className="todo-focus flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:mix-bg-foreground/[0.05]"
              >
                <span className="min-w-0 flex-1 break-words">{h.label}</span>
                <span className="flex-shrink-0 text-muted-foreground">{h.kind}</span>
              </button>
            </li>
          ))}
          {!exact && (
            <>
              {groups.length > 0 && (
                <li className="space-y-1 pt-1">
                  <label className="block px-0.5 text-xs text-muted-foreground" htmlFor={pickId}>
                    Add “{typed}” as a topic in
                  </label>
                  <select
                    id={pickId}
                    value={group}
                    onChange={(e) => setPicked(e.target.value)}
                    className="todo-input todo-input-quiet w-full px-2 py-1.5 text-xs"
                  >
                    {groups.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <LabAddRow label={`Add topic to ${group}`} onClick={() => void addTopic()} />
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => void addGroup()}
                  className="todo-focus w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:lab-ink"
                >
                  {groups.length > 0 ? 'Or add' : 'Add'} “{typed}” as a new {noun}
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
