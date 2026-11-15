'use client';

import Icon from '@/components/ui/AppIcon';
import { WIKI_CARD, WIKI_CARD_TITLE_HOVER, WikiHero, WikiIndexNav, WikiSectionHeading } from '@/modules/labs/common/WikiParts';
import { type WeekPlanApi } from './useWeekPlan';
import WeekPlanView, { type OrganizeTrigger } from './WeekPlanView';
import WeekPill from './WeekPill';
import { DifficultyTag, LcTag, Tag, difficultyDotClass, tagClass } from './ui';
import { DoneMark, LabProgressSummary } from '@/modules/labs/common/LabProgressUi';
import { useUrlState } from '@/lib/navigation/urlState';
import { wikiAnchor } from '@/modules/labs/common/WikiParts';
import { parseBrief } from './sectionContent';
import type { DSATopic } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   WIKI INDEX
══════════════════════════════════════════════════════════════════════════ */
const patternAnchor = (name: string) => wikiAnchor('pattern', name);

export default function WikiIndex({
  grouped,
  topics,
  weekPlan,
  onSelectTopic,
  onSelectSub,
  onBeforeOrganize,
  onOpenGuide,
}: {
  grouped: { name: string; topics: DSATopic[] }[];
  topics: DSATopic[];
  weekPlan: WeekPlanApi;
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
  onBeforeOrganize: (trigger: OrganizeTrigger) => void;
  onOpenGuide?: () => void;
}) {
  // ?view=week shows the week-by-week plan; no param is the pattern-wise handbook.
  const { get: getParam, update: updateUrl } = useUrlState();
  const view = getParam('view') === 'week' ? 'week' : 'pattern';
  const totalSubs = topics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount = topics.filter(
    (t) => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard'
  ).length;
  const easyCount = topics.filter(
    (t) => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium'
  ).length;

  return (
    // 24px between the hero, the view switch and the index; the pattern sections below sit 32px apart.
    <div className="lab-container space-y-[1.5rem]">
      {/* ── Hero: identity, a compact row of numbers and one line of progress, in a single surface with the signature wash ── */}
      <WikiHero
        icon="BookOpenIcon"
        title="DSA Lab Wiki"
        description="Pattern-wise interview preparation handbook"
        onOpenGuide={onOpenGuide}
        metrics={[
          { label: 'Patterns', value: grouped.length },
          { label: 'Topics', value: topics.length },
          { label: 'Subtopics', value: totalSubs },
          { label: 'Hard', value: hardCount, tone: 'hard' },
          { label: 'Easy', value: easyCount, tone: 'easy' },
        ]}
      >
        <LabProgressSummary lab="dsa" topicIds={topics.map((t) => t.id)} noun="questions" />
      </WikiHero>

      {/* ── View switch: by pattern / by week (same screen, so `replace`) ── */}
      <div
        role="group"
        aria-label="Wiki view"
        className="todo-segmented todo-segmented-quiet todo-segmented-accent"
      >
        {(['pattern', 'week'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() =>
              updateUrl({ view: v === 'week' ? 'week' : null, organize: null }, 'replace')
            }
            className="todo-segment"
          >
            <Icon name={v === 'week' ? 'CalendarDaysIcon' : 'Squares2X2Icon'} size={14} />
            {v === 'week' ? 'By week' : 'By pattern'}
          </button>
        ))}
      </div>

      {view === 'week' ? (
        <WeekPlanView
          topics={topics}
          weekPlan={weekPlan}
          onOpen={onSelectTopic}
          onBeforeOrganize={onBeforeOrganize}
        />
      ) : (
        <>
          {/* ── Pattern index: the page's main block (all patterns, same anchors) ── */}
          <WikiIndexNav
            id="dsa-pattern-index"
            title="Pattern index"
            countLabel={`${grouped.length} patterns`}
            items={grouped.map((section) => ({
              name: section.name,
              count: section.topics.length,
              href: `#${patternAnchor(section.name)}`,
            }))}
          />

          {/* ── Per-pattern topic cards ── */}
          <div className="space-y-[2rem]">
            {grouped.map((section) => {
              const anchor = patternAnchor(section.name);
              return (
                <section
                  key={section.name}
                  id={anchor}
                  aria-labelledby={`${anchor}-title`}
                  className="scroll-mt-[4.5rem] space-y-[1rem] md:scroll-mt-[1.5rem]"
                >
                  <WikiSectionHeading
                    id={`${anchor}-title`}
                    name={section.name}
                    count={`${section.topics.length} ${section.topics.length === 1 ? 'question' : 'questions'}`}
                  />

                  {section.topics.length === 0 ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      No questions in this pattern yet. Add one with the + next to it in the
                      sidebar.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-[1rem]">
                      {section.topics.map((t) => (
                        <li key={t.id}>
                          <TopicCard
                            topic={t}
                            week={weekPlan.weekOf(t.id)}
                            onOpen={onSelectTopic}
                            onOpenSub={onSelectSub}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** A question in the pattern-wise Wiki: title, one meta row, the hint, and its subtopics as chips. Flat card: no shadow, no lift. */
function TopicCard({
  topic: t,
  week,
  onOpen,
  onOpenSub,
}: {
  topic: DSATopic;
  week: number | null;
  onOpen: (id: string) => void;
  onOpenSub: (topicId: string, subId: string) => void;
}) {
  const { hint } = parseBrief(t.brief);
  return (
    // The whole card opens the question for a pointer; the title is the real button for keyboard and screen readers.
    <div data-wiki-card className={WIKI_CARD} onClick={() => onOpen(t.id)}>
      {/* Difficulty rail: the one coloured edge on a card (semantic, not the accent) */}
      <span
        aria-hidden="true"
        data-semantic="difficulty"
        className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full opacity-50 transition-opacity group-hover:opacity-90 ${difficultyDotClass(t.difficulty)}`}
      />
      <div className="flex h-full flex-col px-[1.25rem] py-[1rem]">
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(t.id);
            }}
            className={`todo-focus rounded text-left transition-colors ${WIKI_CARD_TITLE_HOVER}`}
          >
            {t.name}
          </button>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <DifficultyTag difficulty={t.difficulty} />
          <LcTag brief={t.brief} />
          <WeekPill week={week} />
          <DoneMark lab="dsa" topicId={t.id} />
          {t.isCustom && <Tag>Custom</Tag>}
        </div>
        <p className="mt-2.5 text-[13px] font-semibold leading-relaxed mix-text-foreground/[0.78]">
          {hint || t.brief}
        </p>

        {t.subtopics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.subtopics.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSub(t.id, s.id);
                }}
                title={s.brief}
                className={`todo-focus ${tagClass('neutral', { interactive: true, wrap: true })}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
