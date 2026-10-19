'use client';

/**
 * The DSA week organizer (`/dsa-lab?view=week&organize=1`, SPEC 4.3): a full-screen board where the
 * learner drags questions between the question queue (left) and the weeks (right, in blocks of four),
 * reorders whole weeks, adds and removes weeks, and gets suggestions and plan insights. At most 7
 * questions per week, enforced by the plan logic in ../weekPlan (the hook returns its refusal message,
 * which is shown as a toast).
 *
 * Drag and drop (dnd-kit): containers `queue` and `week:N` hold `card:<id>` items; weeks are `wk:N`
 * items in an outer SortableContext. While a card is dragged the board shows a local preview; ONE plan
 * edit is committed on drop (move with index, or swap when dropped onto a card in a full week), and a
 * cancelled drag restores the snapshot. Phones get a Queue | Weeks toggle instead of two panes; the
 * per-card week dropdown moves cards between them.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import Popover from '@/components/ui/Popover';
import { confirmDialog } from '@/lib/ui/confirm';
import { inertOthers, lockScroll } from '@/lib/ui/layers';
import { toast } from '@/lib/ui/toast';
import { useIsMobile } from '@/lib/ui/useIsMobile';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';
import AutoOrganizerWizard from '../AutoOrganizerWizard';
import PlanProfileMenu from '../PlanProfileMenu';
import type { DSATopic } from '../types';
import { menuItemClass, menuPopoverClass } from '../ui';
import type { WeekPlanApi } from '../useWeekPlan';
import {
  blockCount,
  blockLabel,
  blockWeeks,
  difficultyGroup,
  difficultyRank,
  lcNumber,
  MAX_WEEKS,
  patternGroups,
  patternKey,
  WEEK_CAP,
  weekCounts,
  weekQuestions,
  weekTheme,
  type Insight,
} from '../weekPlan';
import BlockHeader from './BlockHeader';
import {
  cardId,
  findContainer,
  isTypingTarget,
  QUEUE_ID,
  topicOfCard,
  weekContainerId,
  weekOfContainer,
  weekOfSortId,
  weekSortId,
  type Containers,
  type DragKind,
} from './dnd';
import GripIcon from './GripIcon';
import InsightsPanel from './InsightsPanel';
import QueuePanel, { type QueueFilters } from './QueuePanel';
import { MOVE_SELECT_ATTR, QuestionCardView } from './QuestionCard';
import { readOrganizerUi, writeOrganizerUi, type OrganizerPane } from './uiState';
import { useBoardColumns } from './useBoardColumns';
import WeekColumn, { weekAnchorId, weekTitleId, type DropState } from './WeekColumn';
import WeekJump from './WeekJump';

export interface WeekOrganizerProps {
  topics: DSATopic[];
  weekPlan: WeekPlanApi;
  /** The week view this screen belongs to (same URL minus `organize`). */
  backHref: string;
  onOpenTopic: (id: string) => void;
}

const INITIAL_FILTERS: QueueFilters = {
  search: '',
  pattern: '',
  difficulties: new Set(),
  hideDone: false,
  sort: 'recommended',
};
const INSIGHTS_KEY = 'dsa-organizer-insights-open';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const noop = () => {};

/** How far (px) outside a drop target the pointer may be and still count as on it: the gaps between columns are 16px. */
const DROP_SLACK = 10;

/** The dragged clone rides a little below and right of the pointer, so what is under the pointer (a full week's hint) stays readable. */
const offsetOverlay: Modifier = ({ transform }) => ({
  ...transform,
  x: transform.x + 14,
  y: transform.y + 14,
});

const insideRect = (
  rect: { left: number; right: number; top: number; bottom: number },
  p: { x: number; y: number },
  slack = 0
) =>
  p.x >= rect.left - slack &&
  p.x <= rect.right + slack &&
  p.y >= rect.top - slack &&
  p.y <= rect.bottom + slack;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(REDUCED_MOTION);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

/** The learner's own open / closed choice for Insights, or null when they have never made one (then the default applies). */
function readInsightsPreference(): boolean | null {
  try {
    const v = typeof window === 'undefined' ? null : window.localStorage.getItem(INSIGHTS_KEY);
    return v === '0' ? false : v === '1' ? true : null;
  } catch {
    return null;
  }
}

/** True when a card that isn't already in `key` can't go there: `key` is a week holding 7. */
function isFullTarget(containers: Containers, key: string, activeKey: string): boolean {
  if (weekOfContainer(key) === null) return false;
  const items = containers[key] ?? [];
  return !items.includes(activeKey) && items.length >= WEEK_CAP;
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
    />
  );
}

/**
 * "Saving…" / "Saved" / "Not saved" after the plan name. Not a live region: it would speak after every
 * drop (the drag announcements already confirm each move); a failed save is announced by the alert.
 */
function SaveStatus({ weekPlan, compact }: { weekPlan: WeekPlanApi; compact: boolean }) {
  let body: ReactNode = null;
  if (!weekPlan.loaded)
    body = (
      <>
        <Spinner /> Loading…
      </>
    );
  else if (weekPlan.switching)
    body = (
      <>
        <Spinner /> Switching plan…
      </>
    );
  else if (weekPlan.saving)
    body = (
      <>
        <Spinner /> Saving…
      </>
    );
  else if (weekPlan.loadError)
    body = (
      <span className="inline-flex items-center gap-1 text-error">
        <Icon name="ExclamationCircleIcon" size={13} /> Not loaded
      </span>
    );
  else if (weekPlan.error)
    body = (
      <span className="inline-flex items-center gap-1 text-error">
        <Icon name="ExclamationCircleIcon" size={13} /> Not saved
      </span>
    );
  else if (weekPlan.isCustom)
    body = (
      <>
        <Icon name="CheckIcon" size={13} /> Saved
      </>
    );
  else if (!compact)
    // Long text: only where the top bar has room (xl), so it never runs under the Undo / Redo buttons.
    return (
      <>
        <span aria-hidden className="hidden shrink-0 xl:inline">
          ·
        </span>
        <span className="hidden min-w-0 truncate whitespace-nowrap xl:inline">
          Your first edit saves it as your own plan
        </span>
      </>
    );
  if (!body) return null;
  return (
    <>
      <span aria-hidden className="shrink-0">
        ·
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">{body}</span>
    </>
  );
}

export default function WeekOrganizer({
  topics,
  weekPlan,
  backHref,
  onOpenTopic,
}: WeekOrganizerProps) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const progress = useLabProgress('dsa');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const wp = useRef(weekPlan);
  wp.current = weekPlan;

  // ── The layer itself: portalled to <body>, page scroll locked, the page behind made inert ─────────
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-dsa-organizer', '');
    document.body.appendChild(el);
    // Only a real opener: when the page under the organizer unmounts in the same commit, focus is already on
    // <body>. DSALabModule puts focus back on the Organize button (and the scroll position) after Back.
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const unlock = lockScroll();
    setHost(el);
    return () => {
      unlock();
      el.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => (host ? inertOthers(host) : undefined), [host]);
  useEffect(() => {
    if (host) titleRef.current?.focus({ preventScroll: true });
  }, [host]);

  // ── Screen state ──────────────────────────────────────────────────────────────────────────────────
  // What the board looked like before it was unmounted (a question was opened and closed again, see ./uiState): the search, the
  // filters, the sort order, the phone's pane and both scroll positions. Read once, as soon as the plan is loaded.
  const planId = weekPlan.activeProfile?.id ?? null;
  // `initialUi` is null while the plan is still loading (the effect below restores it then) and a record-or-null once it is.
  const [initialUi] = useState(() => (weekPlan.loaded ? { ui: readOrganizerUi(planId) } : null));
  const restoreRef = useRef({ done: initialUi !== null });
  const [pane, setPane] = useState<OrganizerPane>(initialUi?.ui?.pane ?? 'weeks');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  // Insights: the learner's own choice wins; with none, it opens on a desktop when something needs a look and stays closed otherwise
  // (on a phone it would push the weeks off the screen).
  const [insightsPref, setInsightsPref] = useState<boolean | null>(readInsightsPreference);
  const [filters, setFilters] = useState<QueueFilters>(
    () => initialUi?.ui?.filters ?? INITIAL_FILTERS
  );
  /** Last known `scrollTop` of the weeks board and of the queue list (kept as numbers: the elements are gone by the time we unmount). */
  const scrollPos = useRef({
    board: initialUi?.ui?.boardScroll ?? 0,
    queue: initialUi?.ui?.queueScroll ?? 0,
  });
  const [liveMessage, setLiveMessage] = useState('');
  /** Says `text` through the polite live region. The region is emptied first, so the same sentence twice in a row (Undo, Undo) is spoken twice. */
  const announce = useCallback((text: string) => {
    setLiveMessage('');
    requestAnimationFrame(() => setLiveMessage(text));
  }, []);
  const [flashWeek, setFlashWeek] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ week: number; n: number } | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const patchFilters = useCallback(
    (patch: Partial<QueueFilters>) => setFilters((f) => ({ ...f, ...patch })),
    []
  );
  // Clearing the filters is not clearing the sort order the learner picked.
  const clearFilters = useCallback(
    () =>
      patchFilters({
        search: INITIAL_FILTERS.search,
        pattern: INITIAL_FILTERS.pattern,
        difficulties: INITIAL_FILTERS.difficulties,
        hideDone: INITIAL_FILTERS.hideDone,
      }),
    [patchFilters]
  );
  const insightWarnings = weekPlan.insights.filter((i) => i.tone === 'warning').length;
  const insightsOpen = insightsPref ?? (!isMobile && insightWarnings > 0);
  const toggleInsights = () => {
    const next = !insightsOpen;
    setInsightsPref(next);
    try {
      window.localStorage.setItem(INSIGHTS_KEY, next ? '1' : '0');
    } catch {
      /* private window: only this visit remembers it */
    }
  };

  // ── Plan data ─────────────────────────────────────────────────────────────────────────────────────
  const plan = weekPlan.plan;
  const rank = weekPlan.rank;
  const queue = weekPlan.queue;
  const loading = !weekPlan.loaded || topics.length === 0;
  const isDone = useCallback((id: string) => progress.isDone(id), [progress]);
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const counts = useMemo(() => weekCounts(plan), [plan]);
  const lists = useMemo(
    () =>
      Array.from({ length: plan.weeks }, (_, i) =>
        weekQuestions(plan, i + 1, rank).filter((id) => byId.has(id))
      ),
    [plan, rank, byId]
  );
  const doneByWeek = useMemo(() => lists.map((ids) => progress.countDone(ids)), [lists, progress]);
  const themes = useMemo(
    () =>
      lists.map((ids) => weekTheme(ids.map((id) => byId.get(id)?.category ?? '').filter(Boolean))),
    [lists, byId]
  );
  const planned = counts.reduce((a, b) => a + b, 0);
  const atMax = plan.weeks >= MAX_WEEKS;
  const planName = weekPlan.activeProfile?.name ?? 'Suggested plan';

  // Suggestions per week, from the hook's own ranking (the first week with room gets exactly what "Fill with suggestions" would
  // pick); none for a full week. A queue question is suggested to ONE week only: without that every empty week offered the same
  // three questions. Later weeks take the next best ones.
  const suggestions = useMemo(() => {
    const taken = new Set<string>();
    return counts.map((n, i) => {
      if (n >= WEEK_CAP || loading) return [];
      const picks = wp.current
        .recommendForWeek(i + 1, taken.size + 3)
        .filter((id) => !taken.has(id))
        .slice(0, 3);
      picks.forEach((id) => taken.add(id));
      return picks;
    });
    // `plan` and `isDone` are what the recommendations read through the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, plan, isDone, loading]);

  // ── Queue: sort, then filter ──────────────────────────────────────────────────────────────────────
  const groups = useMemo(() => patternGroups(topics), [topics]);
  const recommendFor = useMemo(() => {
    const i = counts.findIndex((n) => n < WEEK_CAP);
    return i >= 0 ? i + 1 : null;
  }, [counts]);
  const sortedQueue = useMemo(() => {
    switch (filters.sort) {
      case 'recommended':
        return recommendFor === null
          ? queue
          : wp.current.recommendForWeek(recommendFor, queue.length);
      case 'difficulty':
        return [...queue].sort(
          (a, b) =>
            difficultyRank(byId.get(a)?.difficulty ?? '') -
              difficultyRank(byId.get(b)?.difficulty ?? '') || rank(a) - rank(b)
        );
      case 'pattern': {
        const seq = new Map(groups.map((g, i) => [g.key, i]));
        const at = (id: string) =>
          seq.get(patternKey(byId.get(id)?.category ?? '')) ?? groups.length;
        return [...queue].sort((a, b) => at(a) - at(b) || rank(a) - rank(b));
      }
      default:
        return queue;
    }
    // `isDone` changes what "Recommended" puts first (unsolved questions lead).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.sort, queue, recommendFor, byId, rank, groups, isDone]);
  const visibleQueue = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return sortedQueue.filter((id) => {
      const t = byId.get(id);
      if (!t) return false;
      if (filters.pattern && patternKey(t.category) !== filters.pattern) return false;
      if (filters.difficulties.size && !filters.difficulties.has(difficultyGroup(t.difficulty)))
        return false;
      if (filters.hideDone && isDone(id)) return false;
      if (q) {
        const lc = lcNumber(t.brief);
        const hay = `${t.name} ${t.category} ${lc === null ? '' : `lc ${lc} lc${lc} #${lc}`}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sortedQueue, filters, byId, isDone]);
  const patternOptions = useMemo(() => {
    const inQueue = new Set(queue);
    return groups
      .map((g) => ({
        key: g.key,
        name: g.name,
        count: g.ids.filter((id) => inQueue.has(id)).length,
      }))
      .filter((g) => g.count > 0 || g.key === filters.pattern);
  }, [groups, queue, filters.pattern]);

  // ── Drag and drop ─────────────────────────────────────────────────────────────────────────────────
  const baseContainers = useMemo<Containers>(() => {
    const c: Containers = { [QUEUE_ID]: visibleQueue.map(cardId) };
    lists.forEach((ids, i) => {
      c[weekContainerId(i + 1)] = ids.map(cardId);
    });
    return c;
  }, [visibleQueue, lists]);
  const baseRef = useRef(baseContainers);
  baseRef.current = baseContainers;

  const [drag, setDrag] = useState<{ id: string; kind: DragKind; origin: string | null } | null>(
    null
  );
  // Kept after the drop: a moved week's content lands under another number, so its clone must not
  // fly back to the slot it was picked up from.
  const [lastDragKind, setLastDragKind] = useState<DragKind>('card');
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const [preview, setPreviewState] = useState<Containers | null>(null);
  const previewRef = useRef<Containers | null>(null);
  const snapshotRef = useRef<Containers | null>(null);
  const [overInfo, setOverInfo] = useState<{ container: string; full: boolean } | null>(null);
  const lastOverRef = useRef<UniqueIdentifier | null>(null);
  /**
   * True while a POINTER drag is not over any drop target (nor within a few px of one) or not over the queue / board
   * at all: a release there cancels instead of dropping on whichever week happens to be nearest.
   */
  const pointerOutsideRef = useRef(false);
  const [outside, setOutside] = useState(false);
  const startMsg = useRef('');
  const overMsg = useRef('');
  const endMsg = useRef('');
  /** The first "over" of a drag is the card's own place: keep the pick-up announcement instead. */
  const firstOver = useRef(false);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const weeksRef = useRef(plan.weeks);
  weeksRef.current = plan.weeks;

  const containers = preview ?? baseContainers;
  const setPreview = (next: Containers | null) => {
    previewRef.current = next;
    setPreviewState(next);
  };
  const nameOf = (key: string) => byIdRef.current.get(topicOfCard(key) ?? '')?.name ?? 'Question';
  const placeOf = (container: string | null) =>
    container === QUEUE_ID
      ? 'the question queue'
      : `Week ${weekOfContainer(container ?? '') ?? ''}`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /**
   * Weeks only collide with weeks, cards with cards and containers. Pointer first, then the dragged
   * card's overlap, closest corners as the last fallback (keyboard drags have no pointer). Over a week that has room, the nearest card in it
   * is the target, so the drop index follows the pointer; over a full week the week itself stays the
   * target unless the pointer is on one of its cards (then the drop swaps).
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const kind = args.active.data.current?.kind;
    const pointer = args.pointerCoordinates;
    /**
     * Whether a pointer drag has left every target. The fallbacks below (overlap, closest corners) always find
     * SOME week, which is right for a keyboard drag and for the preview, but a pointer released over the top bar
     * or the Insights strip must cancel, not drop on whichever week is nearest. The pointer has to be on the
     * queue / board (their visible rectangles: a week scrolled out of view still has a measured rectangle) and
     * on, or within a few px of, a target.
     */
    const noteOutside = (hits: unknown[], pool: DroppableContainer[]) => {
      if (!pointer) {
        pointerOutsideRef.current = false;
        return;
      }
      const panes = Array.from(layerRef.current?.querySelectorAll('[data-org-pane]') ?? []);
      const onPane =
        panes.length === 0 || panes.some((el) => insideRect(el.getBoundingClientRect(), pointer));
      const onTarget =
        hits.length > 0 ||
        pool.some((c) => {
          const rect = args.droppableRects.get(c.id);
          return !!rect && insideRect(rect, pointer, DROP_SLACK);
        });
      pointerOutsideRef.current = !onPane || !onTarget;
    };
    if (kind === 'week') {
      const pool = args.droppableContainers.filter((c) => c.data.current?.kind === 'week');
      const scoped = { ...args, droppableContainers: pool };
      const hits = pointerWithin(scoped);
      noteOutside(hits, pool);
      return hits.length ? hits : closestCenter(scoped);
    }
    const pool = args.droppableContainers.filter((c) => c.data.current?.kind !== 'week');
    const scoped = { ...args, droppableContainers: pool };
    // A keyboard drag has no pointer: the moved card's own rectangle decides first (closest corners
    // alone would pick a small card in the old week over the tall empty week the card was moved onto).
    const within = pointerWithin(scoped);
    noteOutside(within, pool);
    // Over nothing, a pointer drag keeps its last target (and the preview it made): the fallbacks below would
    // pick whichever week happens to be nearest, and every change of preview moves the cards, which can change
    // the nearest week again (an endless render loop). Letting go here cancels anyway.
    if (pointerOutsideRef.current)
      return lastOverRef.current == null ? [] : [{ id: lastOverRef.current }];
    const overlapping = within.length ? within : rectIntersection(scoped);
    const hits = overlapping.length ? overlapping : closestCorners(scoped);
    let overId = getFirstCollision(hits, 'id');
    if (overId == null) return lastOverRef.current == null ? [] : [{ id: lastOverRef.current }];
    const key = String(overId);
    const snap = snapshotRef.current ?? baseRef.current;
    if (weekOfContainer(key) !== null && !isFullTarget(snap, key, String(args.active.id))) {
      const list = (previewRef.current ?? snap)[key] ?? [];
      if (list.length) {
        const inner = closestCenter({
          ...scoped,
          droppableContainers: pool.filter((c) => list.includes(String(c.id))),
        });
        overId = getFirstCollision(inner, 'id') ?? overId;
      }
    }
    lastOverRef.current = overId;
    return [{ id: overId }];
  }, []);

  const resetDrag = () => {
    snapshotRef.current = null;
    lastOverRef.current = null;
    pointerOutsideRef.current = false;
    setPreview(null);
    setOverInfo(null);
    setOutside(false);
    setDrag(null);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const key = String(active.id);
    const kind: DragKind = active.data.current?.kind === 'week' ? 'week' : 'card';
    const snap = baseRef.current;
    snapshotRef.current = snap;
    previewRef.current = null;
    lastOverRef.current = null;
    pointerOutsideRef.current = false;
    overMsg.current = '';
    endMsg.current = '';
    firstOver.current = true;
    const origin = kind === 'card' ? findContainer(key, snap) : null;
    startMsg.current =
      kind === 'week'
        ? `Picked up Week ${weekOfSortId(key)}. Move it to another week's place and drop it there.`
        : `Picked up ${nameOf(key)} from ${placeOf(origin)}.`;
    setDrag({ id: key, kind, origin });
    setLastDragKind(kind);
  };

  /** Dims the target highlight while a pointer drag is over nothing: letting go there cancels. */
  const handleDragMove = () => {
    const now = pointerOutsideRef.current;
    setOutside((was) => (was === now ? was : now));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const key = String(active.id);
    if (active.data.current?.kind === 'week') {
      const to = over ? weekOfSortId(String(over.id)) : null;
      overMsg.current = to
        ? `Week ${weekOfSortId(key)} is over position ${to} of ${weeksRef.current}.`
        : `Week ${weekOfSortId(key)} is not over a week.`;
      return;
    }
    if (!over) {
      overMsg.current = `${nameOf(key)} is not over a week or the queue.`;
      setOverInfo(null);
      return;
    }
    const overKey = String(over.id);
    const snap = snapshotRef.current ?? baseRef.current;
    const cur = previewRef.current ?? snap;
    const origin = findContainer(key, snap);
    const from = findContainer(key, cur);
    const to = findContainer(overKey, cur);
    if (!origin || !from || !to) return;
    const settling = firstOver.current;
    firstOver.current = false;
    if (settling && overKey === key) {
      overMsg.current = '';
      setOverInfo({ container: from, full: false });
      return;
    }

    if (to === QUEUE_ID) {
      setPreview(null);
      setOverInfo({ container: QUEUE_ID, full: false });
      overMsg.current =
        origin === QUEUE_ID
          ? `${nameOf(key)} is back over the question queue.`
          : `${nameOf(key)} is over the question queue. Drop to take it out of its week.`;
      return;
    }
    const week = weekOfContainer(to);
    if (to !== origin && isFullTarget(snap, to, key)) {
      setPreview(null);
      setOverInfo({ container: to, full: true });
      overMsg.current = topicOfCard(overKey)
        ? `Week ${week} is full. Drop to swap places with ${nameOf(overKey)}.`
        : `Week ${week} is full (${WEEK_CAP} of ${WEEK_CAP}). Drop on a question in it to swap places.`;
      return;
    }
    setOverInfo({ container: to, full: false });
    const target = cur[to] ?? [];
    if (from === to) {
      const at = target.indexOf(overKey);
      const pos = (at >= 0 ? at : target.indexOf(key)) + 1;
      overMsg.current = `${nameOf(key)} is over Week ${week}, position ${pos} of ${target.length}.`;
      return;
    }
    let index = target.length;
    if (overKey !== to) {
      const at = target.indexOf(overKey);
      if (at >= 0) {
        const rect = active.rect.current.translated;
        const below = !!rect && rect.top > over.rect.top + over.rect.height / 2;
        index = at + (below ? 1 : 0);
      }
    }
    setPreview({
      ...cur,
      [from]: cur[from].filter((id) => id !== key),
      [to]: [...target.slice(0, index), key, ...target.slice(index)],
    });
    overMsg.current = `${nameOf(key)} is over Week ${week}, position ${index + 1} of ${target.length + 1}.`;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const key = String(active.id);
    const snap = snapshotRef.current ?? baseRef.current;
    const cur = previewRef.current ?? snap;
    const api = wp.current;
    const released = pointerOutsideRef.current; // a pointer drag let go over no target: cancel
    resetDrag();

    if (released) {
      endMsg.current =
        active.data.current?.kind === 'week'
          ? `Move cancelled. Week ${weekOfSortId(key)} stays where it was.`
          : `Move cancelled. ${nameOf(key)} stays in ${placeOf(findContainer(key, snap))}.`;
      return;
    }

    if (active.data.current?.kind === 'week') {
      const from = weekOfSortId(key);
      const to = over ? weekOfSortId(String(over.id)) : null;
      if (!from || !to || from === to) {
        endMsg.current = `Week ${from} dropped in its place.`;
        return;
      }
      const err = api.moveWeek(from, to);
      if (err) {
        toast.error(err);
        endMsg.current = err;
      } else {
        endMsg.current = `Week ${from} is now week ${to}.`;
      }
      return;
    }

    const topicId = topicOfCard(key);
    const origin = findContainer(key, snap);
    if (!topicId || !over || !origin) {
      endMsg.current = `${nameOf(key)} stays in ${placeOf(origin)}.`;
      return;
    }
    const overKey = String(over.id);
    const to = findContainer(overKey, cur);
    if (!to) return;
    const name = nameOf(key);

    if (to === QUEUE_ID) {
      if (origin === QUEUE_ID) {
        endMsg.current = `${name} stays in the question queue.`;
        return;
      }
      const err = api.move(topicId, null);
      if (err) toast.error(err);
      endMsg.current = err ?? `${name} moved to the question queue.`;
      return;
    }

    const week = weekOfContainer(to) as number;
    if (to !== origin && isFullTarget(snap, to, key)) {
      const other = topicOfCard(overKey);
      if (other && (snap[to] ?? []).includes(overKey)) {
        const err = api.swap(topicId, other);
        if (err) toast.error(err);
        endMsg.current = err ?? `${name} swapped places with ${nameOf(overKey)}.`;
      } else {
        // Not on a card: the plan refuses the move and says why (week full).
        const err = api.move(topicId, week);
        if (err) toast.error(err);
        endMsg.current = err ?? `${name} moved to Week ${week}.`;
      }
      return;
    }

    const list = cur[to] ?? [];
    const from = list.indexOf(key);
    const at = list.indexOf(overKey);
    if (from < 0) {
      const err = api.move(topicId, week, at >= 0 ? at : undefined);
      if (err) toast.error(err);
      endMsg.current = err ?? `${name} moved to Week ${week}.`;
      return;
    }
    const finalList = at >= 0 && at !== from ? arrayMove(list, from, at) : list;
    const index = finalList.indexOf(key);
    if (to === origin && index === snap[origin].indexOf(key)) {
      endMsg.current = `${name} dropped in its place.`;
      return;
    }
    const err = api.move(topicId, week, index);
    if (err) toast.error(err);
    endMsg.current =
      err ?? `${name} moved to Week ${week}, position ${index + 1} of ${finalList.length}.`;
  };

  const handleDragCancel = () => {
    const current = dragRef.current;
    endMsg.current =
      current?.kind === 'card'
        ? `Move cancelled. ${nameOf(current.id)} stays in ${placeOf(current.origin)}.`
        : 'Move cancelled.';
    resetDrag();
  };

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: () => startMsg.current || undefined,
      onDragOver: () => overMsg.current || undefined,
      onDragEnd: () => endMsg.current || undefined,
      onDragCancel: () => endMsg.current || 'Move cancelled.',
    }),
    []
  );

  // ── Revealing a week (insight action, new week, moved week): scroll, focus its title, flash it ────
  const revealWeek = (week: number) => setReveal((r) => ({ week, n: (r?.n ?? 0) + 1 }));
  useEffect(() => {
    if (!reveal) return;
    if (isMobile && pane !== 'weeks') {
      setPane('weeks');
      return;
    }
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(weekAnchorId(reveal.week));
      if (!el) return;
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      document.getElementById(weekTitleId(reveal.week))?.focus({ preventScroll: true });
      setFlashWeek(reveal.week);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashWeek(null), 1600);
      setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, isMobile, pane, reducedMotion, plan.weeks]);

  // ── Focus: a card that moves, or a button that goes away, must not leave focus on <body> ───────────
  const keyboardRef = useRef(false); // the last input was a key press (then a moved-to control is scrolled into view)
  useEffect(() => {
    const onKey = () => {
      keyboardRef.current = true;
    };
    const onPointer = () => {
      keyboardRef.current = false;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  const inLayer = <T extends HTMLElement>(selector: string) =>
    layerRef.current?.querySelector<T>(selector) ?? null;
  const moveSelectOf = (id: string) => inLayer(`[${MOVE_SELECT_ATTR}="${CSS.escape(id)}"]`);
  const headingOf = (week: number | null) =>
    week === null ? inLayer('#org-queue-title') : inLayer(`#${weekTitleId(week)}`);

  // ── Remembering the board across an unmount (see ./uiState) ───────────────────────────────────────
  const latestUi = useRef({ filters, pane, planId });
  latestUi.current = { filters, pane, planId };
  const persistTimer = useRef<number | undefined>(undefined);
  const persistNow = useCallback(() => {
    window.clearTimeout(persistTimer.current);
    if (!restoreRef.current.done) return; // never write the defaults over a record before the plan has loaded
    const { filters: f, pane: p, planId: id } = latestUi.current;
    writeOrganizerUi(id, {
      filters: f,
      pane: p,
      boardScroll: scrollPos.current.board,
      queueScroll: scrollPos.current.queue,
    });
  }, []);
  useEffect(() => {
    persistNow();
  }, [persistNow, filters, pane, planId, weekPlan.loaded]);
  // The final write happens in a layout cleanup, so it lands BEFORE the lab's own layout effect that forgets the record when the
  // learner has left the organizer for good (a passive cleanup would write it back afterwards).
  useLayoutEffect(() => () => persistNow(), [persistNow]);
  // A scroll event does not bubble, but its capture phase passes the layer: one handler for both scrollers.
  const onScrollCapture = (e: UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const which = el.getAttribute?.('data-org-scroll');
    if (which !== 'board' && which !== 'queue') return;
    scrollPos.current[which] = el.scrollTop;
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(persistNow, 200);
  };
  /** Puts a scroller back where it was. Waits for the board to settle (its column count is measured after mounting) and skips a hidden phone pane (it is restored when shown). */
  const restoreScroll = (which: 'board' | 'queue') => {
    const target = scrollPos.current[which];
    if (!target) return;
    let tries = 0;
    const apply = () => {
      const el =
        which === 'board' ? boardRef.current : inLayer<HTMLElement>('[data-org-scroll="queue"]');
      if (!el || el.getClientRects().length === 0) return;
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) > 2 && ++tries < 12) requestAnimationFrame(apply);
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
  };
  const pendingScroll = useRef(scrollPos.current.board > 0 || scrollPos.current.queue > 0);
  const [restoreTick, setRestoreTick] = useState(0);
  /**
   * Re-renders move or remove the control that had focus (a card changes lists, a Suggested chip or an Insight
   * button is used up, a confirm dialog closes on a menu item that is long gone), which would drop focus on
   * <body> and send the next Tab back to the top bar. Once the change has rendered, focus goes to the first
   * target that exists, unless focus has landed somewhere in the layer already.
   */
  const refocus = (...targets: Array<() => HTMLElement | null>) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body && layerRef.current?.contains(active)) return;
        for (const find of targets) {
          const el = find();
          // A hidden phone pane is still mounted: its controls cannot take focus, so fall through to the next target.
          if (!el?.isConnected || el.getClientRects().length === 0) continue;
          el.focus({ preventScroll: true });
          if (keyboardRef.current) el.scrollIntoView({ block: 'nearest' });
          return;
        }
      })
    );
  };

  // ── Edits (each returns the plan's refusal message, shown as a toast) ─────────────────────────────
  /**
   * A confirmation toast whose Undo undoes THIS change. The hook has one undo stack, so the button would
   * otherwise undo whatever came last, however long after the toast it was made: the toast is dismissed when
   * the plan changes again (below), and its button does nothing if that has happened.
   */
  const undoToasts = useRef(new Map<number, number>()); // toast id -> plan version right after its change
  const toastWithUndo = (message: string) => {
    const version = wp.current.getVersion();
    let id = -1;
    id = toast.success(message, {
      action: {
        label: 'Undo',
        onClick: () => {
          undoToasts.current.delete(id);
          if (wp.current.getVersion() !== version) return;
          wp.current.undo();
          announce('Undid the change.');
        },
      },
    });
    if (id >= 0) undoToasts.current.set(id, version);
  };
  useEffect(() => {
    const version = weekPlan.getVersion();
    for (const [id, at] of undoToasts.current) {
      if (at === version) continue;
      toast.dismiss(id);
      undoToasts.current.delete(id);
    }
  });

  const moveCard = (topicId: string, week: number | null) => {
    const from = wp.current.weekOf(topicId);
    const err = wp.current.move(topicId, week);
    if (err) {
      toast.error(err);
      return;
    }
    announce(
      `${byId.get(topicId)?.name ?? 'Question'} moved to ${week === null ? 'the question queue' : `Week ${week}`}.`
    );
    // The card now sits in another list, so its dropdown (the focused control) was replaced by a new one.
    // On a phone the other pane is not on screen: fall back to where the learner is.
    refocus(
      () => moveSelectOf(topicId),
      () => headingOf(from),
      () => headingOf(week)
    );
  };
  const addSuggestion = (week: number, topicId: string) => {
    const err = wp.current.move(topicId, week);
    if (err) {
      toast.error(err);
      return;
    }
    announce(`Added ${byId.get(topicId)?.name ?? 'the question'} to Week ${week}.`);
    // Next suggestion for the same week, so adding several is a run of Enter presses; then the new card.
    refocus(
      () => inLayer(`[data-suggested-for="${week}"] button`),
      () => moveSelectOf(topicId),
      () => headingOf(week)
    );
  };
  /** `reveal`: from an Insight, whose button is used up by the fill: show the filled week. */
  const fillWeek = (week: number, reveal = false) => {
    const err = wp.current.fillWeek(week);
    if (err) {
      toast.error(err);
      return;
    }
    toastWithUndo(`Filled Week ${week} with suggested questions.`);
    if (reveal) revealWeek(week);
  };
  const clearWeek = (week: number) => {
    const err = wp.current.clearWeek(week);
    if (err) toast.error(err);
    else toastWithUndo(`Cleared Week ${week}. Its questions are back in the queue.`);
  };
  const renameWeek = (week: number, label: string) => {
    const err = wp.current.setWeekLabel(week, label);
    if (err) toast.error(err);
  };
  const moveWeekTo = (from: number, to: number) => {
    const err = wp.current.moveWeek(from, to);
    if (err) {
      toast.error(err);
      return;
    }
    announce(`Week ${from} is now week ${to}.`);
    revealWeek(to);
  };
  const addWeek = (after?: number) => {
    const err = wp.current.addWeek(after);
    if (err) {
      toast.error(err);
      return;
    }
    const added = after === undefined ? plan.weeks + 1 : after + 1;
    announce(`Added Week ${added}.`);
    revealWeek(added);
  };
  const removeWeek = async (week: number) => {
    const menuButton = () => inLayer(`[data-week-menu="${week}"]`);
    const n = counts[week - 1] ?? 0;
    if (n > 0) {
      const ok = await confirmDialog({
        title: `Remove Week ${week}?`,
        message: `${n === 1 ? 'Its question goes' : `Its ${n} questions go`} back to the queue, and the weeks after it move up by one.`,
        confirmLabel: 'Remove week',
        tone: 'danger',
      });
      if (!ok) {
        // The dialog was opened from a menu item that is gone, so it has nothing to hand focus back to.
        refocus(menuButton);
        return;
      }
    }
    const weeksBefore = weeksRef.current;
    const err = wp.current.removeWeek(week);
    if (err) {
      toast.error(err);
      refocus(menuButton);
      return;
    }
    toastWithUndo(`Removed Week ${week}.`);
    announce(`Removed Week ${week}.`);
    // The week that now has this number (or the last one, if the removed week was the last).
    refocus(
      () => headingOf(Math.min(week, weeksBefore - 1)),
      () => headingOf(null)
    );
  };
  const runInsight = (insight: Insight) => {
    const action = insight.action;
    if (!action) return;
    if (action.kind === 'fill' && action.week) fillWeek(action.week, true);
    else if (action.kind === 'spread') {
      const err = wp.current.spreadEvenly();
      if (err) {
        toast.error(err);
        return;
      }
      toastWithUndo('Spread the questions evenly across the weeks.');
      // The button that was pressed is gone with its insight (or the whole panel is, with none left).
      refocus(
        () => inLayer('#org-insights-title'),
        () => boardRef.current
      );
    } else if (action.kind === 'open-week' && action.week) revealWeek(action.week);
  };
  const undo = () => {
    wp.current.undo();
    announce('Undid the last change.');
  };
  const redo = () => {
    wp.current.redo();
    announce('Redid the change.');
  };

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo; never while typing, dragging or in a dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || !(e.ctrlKey || e.metaKey)) return;
      if (isTypingTarget(e.target) || dragRef.current) return;
      if (document.querySelector('[data-modal-root]')) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.shiftKey);
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      const api = wp.current;
      if (isUndo ? !api.canUndo : !api.canRedo) return;
      if (isUndo) api.undo();
      else api.redo();
      announce(isUndo ? 'Undid the last change.' : 'Redid the change.');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [announce]);

  // ── Layout ────────────────────────────────────────────────────────────────────────────────────────
  const showQueue = !isMobile || pane === 'queue';
  const showBoard = !isMobile || pane === 'weeks';
  const blocksRef = useRef<HTMLDivElement>(null);
  const columns = useBoardColumns(blocksRef, !!host && showBoard);
  const gridCols = columns === 4 ? 'grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const weekIds = useMemo(
    () => Array.from({ length: plan.weeks }, (_, i) => weekSortId(i + 1)),
    [plan.weeks]
  );
  const blocks = useMemo(
    () =>
      Array.from({ length: blockCount(plan.weeks) }, (_, b) => {
        const weeks = blockWeeks(b, plan.weeks);
        return {
          b,
          weeks,
          label: blockLabel(b, plan.weeks),
          planned: weeks.reduce((sum, w) => sum + (counts[w - 1] ?? 0), 0),
          done: weeks.reduce((sum, w) => sum + (doneByWeek[w - 1] ?? 0), 0),
          capacity: weeks.length * WEEK_CAP,
        };
      }),
    [plan.weeks, counts, doneByWeek]
  );
  /** The last block has fewer than four weeks, so "Add week N" is a cell in its grid instead of a bar under the board. */
  const lastBlockOpen = blocks.length > 0 && blocks[blocks.length - 1].weeks.length < 4;
  const dropStateOf = (week: number): DropState =>
    drag?.kind === 'card' && !outside && overInfo?.container === weekContainerId(week)
      ? overInfo.full
        ? 'full'
        : 'over'
      : 'idle';
  const queueDropActive =
    drag?.kind === 'card' &&
    !outside &&
    drag.origin !== QUEUE_ID &&
    overInfo?.container === QUEUE_ID;
  const activeTopic = drag?.kind === 'card' ? byId.get(topicOfCard(drag.id) ?? '') : undefined;
  const activeWeek = drag?.kind === 'week' ? weekOfSortId(drag.id) : null;
  const modKey =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

  /** "Skip to weeks": past the top bar and the whole queue (three tab stops per card) to the board. */
  const skipToBoard = () => {
    if (isMobile && pane !== 'weeks') setPane('weeks');
    requestAnimationFrame(() => requestAnimationFrame(() => boardRef.current?.focus()));
  };

  // The plan was not loaded when the board mounted (a reload, a deep link): restore the saved state as soon as it is.
  useEffect(() => {
    if (restoreRef.current.done || !weekPlan.loaded) return;
    const ui = readOrganizerUi(planId);
    restoreRef.current.done = true;
    if (!ui) return;
    setFilters(ui.filters);
    setPane(ui.pane);
    scrollPos.current = { board: ui.boardScroll, queue: ui.queueScroll };
    pendingScroll.current = ui.boardScroll > 0 || ui.queueScroll > 0;
    setRestoreTick((n) => n + 1);
  }, [weekPlan.loaded, planId]);
  // Scroll positions go back once the board has its content (`host`: the layer is mounted; `loading`: the weeks exist).
  useEffect(() => {
    if (!host || loading || !pendingScroll.current) return;
    pendingScroll.current = false;
    restoreScroll('board');
    restoreScroll('queue');
    // restoreScroll only reads refs and the DOM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, loading, restoreTick]);
  // Phones show one pane and hide the other (it stays mounted, so nothing is lost); a hidden scroller forgets its offset, so put it back.
  useEffect(() => {
    if (!host || !isMobile) return;
    restoreScroll(pane === 'queue' ? 'queue' : 'board');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, isMobile, pane]);

  if (!host) return null;

  const addWeekTitle = atMax
    ? `A plan can have at most ${MAX_WEEKS} weeks.`
    : 'Add a week at the end';

  return createPortal(
    <div
      ref={layerRef}
      className="dsa-type fixed inset-0 z-[120] flex flex-col bg-background text-foreground"
      onScrollCapture={onScrollCapture}
    >
      {/* ── Top bar ── */}
      <header className="dsa-glass-bar relative z-20 flex shrink-0 items-center gap-2 px-[0.75rem] py-2 md:gap-3 md:px-[1.25rem]">
        <BackButton
          href={backHref}
          label="Back to week plan"
          className={`shrink-0 ${isMobile ? '-ml-1 px-2 [&>span]:sr-only' : '-ml-1.5'}`}
        />
        <span aria-hidden className="hidden h-[1.5rem] w-px shrink-0 bg-border md:block" />
        <div className="min-w-0 flex-1">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="w-fit max-w-full truncate rounded-sm font-heading text-sm font-semibold leading-tight text-foreground outline-none md:text-base"
          >
            Week organizer
          </h1>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[13px] font-medium mix-text-foreground/[0.74]">
            <span
              title={planName}
              className="max-w-[14rem] shrink-0 truncate font-medium text-foreground"
            >
              {planName}
            </span>
            {!isMobile && (
              <span className="hidden min-w-0 truncate whitespace-nowrap tabular-nums lg:inline">
                · {plan.weeks} {plan.weeks === 1 ? 'week' : 'weeks'} · {planned} planned
              </span>
            )}
            <SaveStatus weekPlan={weekPlan} compact={isMobile} />
          </p>
        </div>

        {/* Right after the title, which is what has focus when the organizer opens: the first Tab stop. */}
        <button
          type="button"
          onClick={skipToBoard}
          className="todo-btn todo-btn-primary sr-only focus:not-sr-only focus:absolute focus:left-[0.75rem] focus:top-full focus:z-30 focus:mt-[0.25rem] focus:px-[0.75rem] focus:py-[0.375rem]"
        >
          Skip to weeks
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!weekPlan.canUndo}
            aria-label="Undo"
            aria-keyshortcuts="Control+Z Meta+Z"
            title={`Undo (${modKey}+Z)`}
            className="todo-btn todo-btn-ghost h-9 w-9 px-0"
          >
            <Icon name="ArrowUturnLeftIcon" size={16} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!weekPlan.canRedo}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            title={`Redo (${modKey}+Shift+Z)`}
            className="todo-btn todo-btn-ghost h-9 w-9 px-0"
          >
            <Icon name="ArrowUturnRightIcon" size={16} />
          </button>
        </div>

        {isMobile ? (
          <>
            <button
              ref={moreBtn}
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More actions"
              onClick={() => setMoreOpen((o) => !o)}
              className="todo-btn todo-btn-quiet h-9 w-9 shrink-0 px-0"
            >
              <Icon name="EllipsisHorizontalIcon" size={18} />
            </button>
            <Popover
              open={moreOpen}
              anchorRef={moreBtn}
              onClose={() => setMoreOpen(false)}
              label="More actions"
              className={`${menuPopoverClass} min-w-[14rem]`}
            >
              <button
                type="button"
                role="menuitem"
                disabled={loading}
                onClick={() => {
                  setMoreOpen(false);
                  requestAnimationFrame(() => setWizardOpen(true));
                }}
                className={`${menuItemClass} items-center text-foreground`}
              >
                <Icon name="SparklesIcon" size={15} className="text-muted-foreground" />
                Auto organize
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={atMax || loading || !!weekPlan.loadError}
                onClick={() => {
                  setMoreOpen(false);
                  addWeek();
                }}
                className={`${menuItemClass} items-center text-foreground`}
              >
                <Icon name="PlusIcon" size={15} className="text-muted-foreground" />
                Add week
              </button>
              {atMax && (
                <p className="px-2.5 pb-1.5 pt-0.5 text-xs text-muted-foreground">
                  A plan can have at most {MAX_WEEKS} weeks.
                </p>
              )}
            </Popover>
          </>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <PlanProfileMenu weekPlan={weekPlan} />
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              disabled={loading}
              aria-label="Auto organize"
              title="Answer a few questions and let AI plan your weeks"
              className="todo-btn todo-btn-quiet h-9"
            >
              <Icon name="SparklesIcon" size={15} />
              <span className="hidden lg:inline">Auto organize</span>
            </button>
            <button
              type="button"
              onClick={() => addWeek()}
              disabled={atMax || loading || !!weekPlan.loadError}
              aria-label="Add week"
              title={addWeekTitle}
              className="todo-btn todo-btn-secondary h-9"
            >
              <Icon name="PlusIcon" size={15} />
              <span className="hidden lg:inline">Add week</span>
            </button>
          </div>
        )}
      </header>

      {(weekPlan.error || weekPlan.loadError) && (
        <div className="shrink-0 px-[0.75rem] pt-2 md:px-[1.25rem]">
          <div role="alert" className="todo-alert todo-alert-error items-center">
            <Icon name="ExclamationTriangleIcon" size={15} className="shrink-0" />
            <p className="min-w-0 flex-1">{weekPlan.error ?? weekPlan.loadError}</p>
            {weekPlan.loadError ? (
              // Editing stays off until the saved plan has loaded, so this banner stays until Try again works.
              <button
                type="button"
                onClick={() => void weekPlan.retryLoad()}
                className="todo-btn todo-btn-quiet shrink-0 px-2.5 py-1"
              >
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={weekPlan.clearError}
                aria-label="Dismiss error"
                className="todo-focus flex h-[1.5rem] w-[1.5rem] shrink-0 items-center justify-center rounded-md hover:mix-bg-error/10"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Phones: one pane at a time ── */}
      {isMobile && (
        <div className="dsa-glass-bar z-10 flex shrink-0 items-center gap-2 px-[0.75rem] py-2">
          <div
            role="group"
            aria-label="Show"
            className="todo-segmented todo-segmented-quiet todo-segmented-accent shrink-0"
          >
            <button
              type="button"
              aria-pressed={pane === 'queue'}
              onClick={() => setPane('queue')}
              className="todo-segment"
            >
              <Icon name="QueueListIcon" size={14} />
              Queue
              <span className="tabular-nums text-muted-foreground">{queue.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={pane === 'weeks'}
              onClick={() => setPane('weeks')}
              className="todo-segment"
            >
              <Icon name="ViewColumnsIcon" size={14} />
              Weeks
              <span className="tabular-nums text-muted-foreground">{plan.weeks}</span>
            </button>
          </div>
          <div className="ml-auto flex min-w-0 justify-end">
            <PlanProfileMenu weekPlan={weekPlan} compact />
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          container: host,
          announcements,
          screenReaderInstructions: {
            draggable:
              'To pick up a question or a week, focus its grip and press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, or Escape to cancel. Every question also has a week menu.',
          },
        }}
      >
        <div className="flex min-h-0 flex-1">
          {/* Both panes stay mounted on a phone (the other one is `hidden`), so the search box, the filters and both scroll
              positions survive a Queue / Weeks toggle. */}
          <QueuePanel
            filters={filters}
            onFilters={patchFilters}
            onClearFilters={clearFilters}
            items={containers[QUEUE_ID] ?? []}
            shownCount={visibleQueue.length}
            total={queue.length}
            patterns={patternOptions}
            topicsById={byId}
            counts={counts}
            recommendFor={recommendFor}
            dropActive={queueDropActive}
            dragKind={drag?.kind ?? null}
            loading={loading}
            onOpenTopic={onOpenTopic}
            onMoveCard={moveCard}
            className={
              isMobile
                ? showQueue
                  ? 'm-[0.75rem] flex-1'
                  : 'hidden'
                : 'my-[1rem] ml-[1rem] w-[18rem] shrink-0 lg:ml-[1.25rem] xl:w-[20rem]'
            }
          />

          <section
            ref={boardRef}
            tabIndex={-1}
            aria-label="Weeks"
            data-org-pane="board"
            data-org-scroll="board"
            // scroll-pt: a control focused by keyboard is scrolled out from under the sticky block header.
            className={`min-w-0 flex-1 scroll-pt-[4rem] overflow-y-auto overflow-x-hidden overscroll-contain outline-none scrollbar-clean ${showBoard ? '' : 'hidden'}`}
          >
            <div className="px-[1rem] pb-[4rem] md:px-[1.5rem]">
              {!loading && plan.weeks > 1 && (
                <div className="flex items-center justify-end pt-[1rem]">
                  <WeekJump weeks={plan.weeks} counts={counts} onJump={revealWeek} />
                </div>
              )}
              {!loading && weekPlan.insights.length > 0 && (
                <div className="pt-[1rem]">
                  <InsightsPanel
                    insights={weekPlan.insights}
                    open={insightsOpen}
                    onToggle={toggleInsights}
                    onAction={runInsight}
                    onOpenWeek={revealWeek}
                    columns={columns === 4 ? 3 : columns === 2 ? 2 : 1}
                    busy={weekPlan.switching}
                  />
                </div>
              )}

              <div ref={blocksRef} className="space-y-[1.5rem] pt-[1rem]">
                {loading ? (
                  <div aria-hidden className={`grid gap-[1rem] ${gridCols}`}>
                    {Array.from({ length: 4 }, (_, i) => (
                      <div
                        key={i}
                        className="h-[22rem] rounded-lg mix-bg-foreground/[0.05] motion-safe:animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <SortableContext items={weekIds} strategy={rectSortingStrategy}>
                    {blocks.map((block) => (
                      <section
                        key={block.b}
                        aria-labelledby={`org-block-${block.b}`}
                        // A hairline and room above every block after the first: "blocks of four" read as separate stretches.
                        className={block.b > 0 ? 'border-t pt-[1.5rem]' : undefined}
                      >
                        <BlockHeader
                          id={`org-block-${block.b}`}
                          label={block.label}
                          planned={block.planned}
                          capacity={block.capacity}
                          done={block.done}
                        />
                        <div className={`grid gap-[1rem] pt-[1rem] ${gridCols}`}>
                          {block.weeks.map((w) => (
                            <WeekColumn
                              key={w}
                              week={w}
                              weeks={plan.weeks}
                              items={containers[weekContainerId(w)] ?? []}
                              topicsById={byId}
                              label={plan.labels[String(w)] ?? ''}
                              theme={themes[w - 1] ?? ''}
                              done={doneByWeek[w - 1] ?? 0}
                              counts={counts}
                              suggestions={suggestions[w - 1] ?? []}
                              queueEmpty={queue.length === 0}
                              dropState={dropStateOf(w)}
                              dragKind={drag?.kind ?? null}
                              highlighted={flashWeek === w}
                              onOpenTopic={onOpenTopic}
                              onMoveCard={moveCard}
                              onAddSuggestion={(id) => addSuggestion(w, id)}
                              onRename={(label) => renameWeek(w, label)}
                              onFill={() => fillWeek(w)}
                              onClear={() => clearWeek(w)}
                              onMoveWeek={(to) => moveWeekTo(w, to)}
                              onInsertAfter={() => addWeek(w)}
                              onRemove={() => void removeWeek(w)}
                            />
                          ))}
                          {/* The last block is not full: its next week is a cell in the grid (the bar under the board is only for a full block). */}
                          {block.b === blocks.length - 1 && block.weeks.length < 4 && (
                            <button
                              type="button"
                              onClick={() => addWeek()}
                              title={addWeekTitle}
                              className="todo-add-slot todo-focus flex min-h-[8rem] items-center justify-center gap-2 rounded-lg text-sm font-medium"
                            >
                              <Icon name="PlusIcon" size={16} />
                              Add week {plan.weeks + 1}
                            </button>
                          )}
                        </div>
                      </section>
                    ))}
                  </SortableContext>
                )}
              </div>

              {!loading && !lastBlockOpen && (
                <div className="mt-[2rem]">
                  <button
                    type="button"
                    onClick={() => addWeek()}
                    disabled={atMax}
                    title={addWeekTitle}
                    className="todo-add-slot todo-focus flex w-full items-center justify-center gap-2 rounded-lg py-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Icon name="PlusIcon" size={16} />
                    {atMax
                      ? `${MAX_WEEKS} weeks is the most a plan can have`
                      : `Add week ${plan.weeks + 1}`}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <DragOverlay
          modifiers={[offsetOverlay]}
          dropAnimation={
            reducedMotion || lastDragKind === 'week'
              ? null
              : { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          }
        >
          {activeTopic ? (
            // The plain wrapper is what dnd-kit measures (it measures an overlay's only child): the tilted
            // card's bounding box is a pixel wider, which made the keyboard's ArrowLeft / ArrowRight pick the
            // next card in the same week instead of the neighbouring week.
            <div className={`transition-opacity duration-150 ${outside ? 'opacity-60' : ''}`}>
              <QuestionCardView
                topic={activeTopic}
                week={null}
                counts={counts}
                onOpenTopic={noop}
                onMove={noop}
                overlay
              />
            </div>
          ) : activeWeek ? (
            <div
              className={`dsa-glass w-[15rem] rounded-xl px-3 py-2.5 shadow-lg transition-opacity duration-150 ${
                outside ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-muted-foreground">
                  <GripIcon variant="week" size={16} />
                </span>
                <span className="dsa-heading text-sm font-semibold lab-ink">Week {activeWeek}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {counts[activeWeek - 1] ?? 0}/{WEEK_CAP}
                </span>
              </div>
              <p className="mt-0.5 break-words pl-[1.5rem] text-xs leading-snug text-muted-foreground">
                {plan.labels[String(activeWeek)] || themes[activeWeek - 1] || 'No questions yet'}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <AutoOrganizerWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        topics={topics}
        weekPlan={weekPlan}
      />
    </div>,
    host
  );
}
