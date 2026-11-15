'use client';

import { apiFetch } from '@/lib/http/apiClient';
import type { LabName } from '@/lib/services/labSectionsService';
import { projectService, type ProjectNode } from '@/lib/services/projectService';
import { LAB_CATALOG, type LabCatalogEntry } from '@/modules/common/lab/labCatalog';

/**
 * Lab content for the To-Do planner: "Lab plan" (Plan & Project) and "Add from lab" (a project's Explorer).
 *
 * Every lab serves its topics in the same shape (`GET <prefix>/topics`, login required; in nextjs-api mode the
 * fe-apis/labs twin serves the same rows). A picked topic becomes a project node; a picked subtopic becomes a step
 * under it. The node's context starts with the topic's brief and ends with a "From <lab>: <url>" line, which is how a
 * node knows which lab page it came from (the Explorer turns it into an "Open in lab" link, and the pickers mark that
 * topic as already in the project).
 */

export interface LabSubtopic {
  id: string;
  name: string;
  brief: string;
}

export interface LabTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  subtopics: LabSubtopic[];
}

const API_PREFIX: Record<LabName, string> = {
  dsa: '/dsa',
  cv: '/cv',
  system_design: '/system-design',
  communication: '/communication',
  finance: '/finance',
  python: '/python',
};

/**
 * DSA "subtopics" are the sections of a problem page (Python, Real-World, Remember, Edge), not lessons, so a DSA
 * problem is added on its own. Every other lab's subtopics are real lessons and can be added as steps.
 */
export function subtopicsAreSteps(lab: LabName): boolean {
  return lab !== 'dsa';
}

export function labEntry(lab: LabName): LabCatalogEntry {
  return LAB_CATALOG.find((l) => l.key === lab) ?? LAB_CATALOG[0];
}

const cache = new Map<LabName, LabTopic[]>();

/** A lab's topics (cached for the page's lifetime; the lists only change when someone adds a custom topic). */
export async function fetchLabTopics(lab: LabName, { fresh = false } = {}): Promise<LabTopic[]> {
  const hit = cache.get(lab);
  if (hit && !fresh) return hit;
  const res = await apiFetch(`${API_PREFIX[lab]}/topics`);
  if (res.status === 401 || res.status === 403) throw new Error('Sign in to bring in lab content.');
  if (!res.ok) throw new Error(`Could not load ${labEntry(lab).label} (HTTP ${res.status}).`);
  const data = (await res.json()) as Partial<LabTopic>[];
  const topics: LabTopic[] = (Array.isArray(data) ? data : [])
    .filter((t): t is Partial<LabTopic> & { id: string; name: string } => !!t?.id && !!t?.name)
    .map((t) => ({
      id: t.id,
      name: t.name,
      brief: t.brief ?? '',
      category: t.category || 'Other',
      difficulty: t.difficulty ?? '',
      subtopics: Array.isArray(t.subtopics) ? t.subtopics.filter((s) => s?.id && s?.name) : [],
    }));
  cache.set(lab, topics);
  return topics;
}

/** Topics in the lab's own order, grouped by category (first appearance decides the group order). */
export function groupByCategory(topics: LabTopic[]): { category: string; topics: LabTopic[] }[] {
  const groups = new Map<string, LabTopic[]>();
  for (const t of topics) {
    const list = groups.get(t.category);
    if (list) list.push(t);
    else groups.set(t.category, [t]);
  }
  return Array.from(groups, ([category, list]) => ({ category, topics: list }));
}

/* ── Links between a node and its lab page ─────────────────────────────────────────────────────────────── */

export function labTopicHref(lab: LabName, topicId: string, subtopicId?: string): string {
  const base = `${labEntry(lab).path}?topic=${encodeURIComponent(topicId)}`;
  return subtopicId ? `${base}&sub=${encodeURIComponent(subtopicId)}` : base;
}

const LINK_LINE = /^From (.+?): (\/[a-z-]+-lab\?topic=[^\s]+)$/m;

/** The lab page a node was added from, read back from its context ("From DSA Lab: /dsa-lab?topic=…"). */
export function labLinkFromContext(
  context: string | null | undefined
): { label: string; href: string } | null {
  if (!context) return null;
  const m = LINK_LINE.exec(context);
  return m ? { label: m[1], href: m[2] } : null;
}

function nodeContext(lab: LabName, brief: string, href: string, meta: string[]): string {
  const head = [brief.trim(), meta.filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return `${head ? `${head}\n\n` : ''}From ${labEntry(lab).label}: ${href}`;
}

/** Every lab page already linked from a project's tree, mapped to the node that links it. */
export function linkedLabNodes(
  nodes: ProjectNode[],
  acc = new Map<string, number>()
): Map<string, number> {
  for (const n of nodes) {
    const link = labLinkFromContext(n.context);
    if (link && !acc.has(link.href)) acc.set(link.href, n.id);
    if (n.children?.length) linkedLabNodes(n.children, acc);
  }
  return acc;
}

/* ── Selection and adding ─────────────────────────────────────────────────────────────────────────────── */

/** One picked topic and the subtopics picked under it. Keyed by `selectionKey`, so a plan can mix labs. */
export interface LabPick {
  lab: LabName;
  topic: LabTopic;
  subtopicIds: string[];
}

export type LabSelection = Map<string, LabPick>;

export const selectionKey = (lab: LabName, topicId: string) => `${lab}:${topicId}`;

/** How many project items these picks turn into: each topic not already in the project, plus each new subtopic. */
export function plannedItems(
  picks: Iterable<LabPick>,
  existing?: ReadonlyMap<string, number>
): number {
  let n = 0;
  for (const p of picks) {
    if (!existing?.has(labTopicHref(p.lab, p.topic.id))) n += 1;
    n += p.subtopicIds.filter((id) => !existing?.has(labTopicHref(p.lab, p.topic.id, id))).length;
  }
  return n;
}

export function selectionLabs(selection: LabSelection): LabName[] {
  return Array.from(new Set(Array.from(selection.values(), (p) => p.lab)));
}

/** A name for a new project made from this selection: "Python Lab plan", or "Lab plan" when it mixes labs. */
export function suggestedProjectTitle(selection: LabSelection): string {
  const labs = selectionLabs(selection);
  return labs.length === 1 ? `${labEntry(labs[0]).label} plan` : 'Lab plan';
}

/**
 * Adds the picked topics to a project, in the order they were picked: each topic as a node (a "topic" when it gets
 * steps, otherwise an "action"), each picked subtopic as an action under it. A topic the project already has (see
 * `linkedLabNodes`) is not added again; its new subtopics go under the existing node. Nodes are created one after
 * another so they keep that order; their context is saved alongside. Stops at the first item the server refuses (the
 * service has already said why) and reports how far it got.
 */
export async function addLabPicksToProject(
  projectId: number,
  picks: LabPick[],
  {
    existing = new Map<string, number>(),
    onProgress,
  }: {
    existing?: ReadonlyMap<string, number>;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<{ added: number; total: number; ok: boolean }> {
  const total = plannedItems(picks, existing);
  let added = 0;
  const contextSaves: Promise<unknown>[] = [];
  const step = () => {
    added += 1;
    onProgress?.(added, total);
  };

  for (const pick of picks) {
    const { lab, topic } = pick;
    const topicHref = labTopicHref(lab, topic.id);
    const subs = topic.subtopics.filter(
      (s) => pick.subtopicIds.includes(s.id) && !existing.has(labTopicHref(lab, topic.id, s.id))
    );

    let parentId = existing.get(topicHref) ?? null;
    if (parentId === null) {
      const parent = await projectService.createNode(projectId, {
        title: topic.name,
        node_type: subs.length > 0 ? 'topic' : 'action',
      });
      if (!parent) return { added, total, ok: false };
      parentId = parent.id;
      contextSaves.push(
        projectService.updateProjectNode(parent.id, {
          context: nodeContext(lab, topic.brief, topicHref, [topic.category, topic.difficulty]),
        })
      );
      step();
    }

    for (const sub of subs) {
      const child = await projectService.createNode(projectId, {
        title: sub.name,
        node_type: 'action',
        parent_node_id: parentId,
      });
      if (!child) return { added, total, ok: false };
      contextSaves.push(
        projectService.updateProjectNode(child.id, {
          context: nodeContext(lab, sub.brief, labTopicHref(lab, topic.id, sub.id), [topic.name]),
        })
      );
      step();
    }
  }

  await Promise.all(contextSaves);
  return { added, total, ok: true };
}
