'use client';

import { DoneMark, LabProgressSummary } from '@/modules/labs/common/LabProgressUi';
import { DifficultyTag, difficultyDotClass } from '@/modules/labs/common/LabTags';
import { WIKI_CARD, WIKI_CARD_TITLE_HOVER, WIKI_CHIP, WikiHero, WikiIndexNav, WikiSectionHeading, wikiAnchor } from '@/modules/labs/common/WikiParts';
import type { CVTopic } from './types';

const cvAnchor = (name: string) => wikiAnchor('cv', name);

export default function CVWikiIndex({
  groupedSections, allTopics, onSelectTopic, onSelectSub, onOpenGuide,
}: {
  groupedSections: { name: string; topics: CVTopic[] }[];
  allTopics: CVTopic[];
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
  onOpenGuide?: () => void;
}) {
  const totalSubs  = allTopics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount  = allTopics.filter(t => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard').length;
  const easyCount  = allTopics.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium').length;

  return (
    <div className="lab-container space-y-[1.5rem]">
      <WikiHero
        icon="EyeIcon"
        title="CV Lab Wiki"
        description="Computer vision interview preparation handbook"
        onOpenGuide={onOpenGuide}
        metrics={[
          { label: 'Categories', value: groupedSections.length },
          { label: 'Topics', value: allTopics.length },
          { label: 'Subtopics', value: totalSubs },
          { label: 'Hard', value: hardCount, tone: 'hard' },
          { label: 'Easy', value: easyCount, tone: 'easy' },
        ]}
      >
        <LabProgressSummary lab="cv" topicIds={allTopics.map(t => t.id)} noun="topics" />
      </WikiHero>

      <WikiIndexNav
        id="cv-category-index"
        title="Category index"
        countLabel={`${groupedSections.length} categories`}
        items={groupedSections.map(s => ({ name: s.name, count: s.topics.length, href: `#${cvAnchor(s.name)}` }))}
      />

      {/* ── Per-category topic cards ── */}
      <div className="space-y-[2rem]">
        {groupedSections.map(section => (
          <section
            key={section.name}
            id={cvAnchor(section.name)}
            aria-labelledby={`${cvAnchor(section.name)}-title`}
            className="scroll-mt-[4.5rem] space-y-[1rem] md:scroll-mt-[1.5rem]"
          >
            <WikiSectionHeading
              id={`${cvAnchor(section.name)}-title`}
              name={section.name}
              count={`${section.topics.length} ${section.topics.length === 1 ? 'topic' : 'topics'}`}
            />

            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-[1rem]">
              {section.topics.map(t => (
                <li key={t.id}>
                  <div className={WIKI_CARD} onClick={() => onSelectTopic(t.id)}>
                    {/* Difficulty rail (semantic colour) */}
                    <span
                      aria-hidden="true"
                      data-semantic="difficulty"
                      className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full opacity-50 transition-opacity group-hover:opacity-90 ${difficultyDotClass(t.difficulty)}`}
                    />
                    <div className="flex h-full flex-col px-[1.25rem] py-[1rem]">
                      <h3 className="text-sm font-semibold leading-snug text-foreground">
                        {/* a real button: the title used to be a mouse-only heading */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onSelectTopic(t.id); }}
                          className={`todo-focus rounded text-left transition-colors ${WIKI_CARD_TITLE_HOVER}`}
                        >
                          {t.name}
                        </button>
                      </h3>
                      {/* the category pill is gone: the section heading above already says it */}
                      <div className="mt-[0.5rem] flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.25rem]">
                        <DifficultyTag difficulty={t.difficulty} />
                        <DoneMark lab="cv" topicId={t.id} />
                      </div>
                      <p className="mt-[0.625rem] text-[13px] font-medium leading-relaxed mix-text-foreground/[0.78]">{t.brief}</p>

                      {t.prerequisites.length > 0 && (
                        <p className="mt-[0.5rem] text-xs font-medium text-muted-foreground">
                          <span className="font-semibold">Prereqs</span>{' '}
                          {t.prerequisites.join(' · ')}
                        </p>
                      )}

                      {t.subtopics.length > 0 && (
                        <div className="mt-[0.75rem] flex flex-wrap gap-1.5">
                          {t.subtopics.map(s => (
                            <button key={s.id}
                              type="button"
                              onClick={e => { e.stopPropagation(); onSelectSub(t.id, s.id); }}
                              title={s.brief}
                              className={WIKI_CHIP}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
