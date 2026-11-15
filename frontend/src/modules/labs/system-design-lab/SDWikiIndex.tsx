'use client';

import { DoneMark, LabProgressSummary } from '@/modules/labs/common/LabProgressUi';
import { DifficultyTag, difficultyDotClass } from '@/modules/labs/common/LabTags';
import { LAB_CHIP_ACCENT, WIKI_CARD, WIKI_CARD_TITLE_HOVER, WIKI_CHIP, WikiHero, WikiIndexNav, WikiSectionHeading, wikiAnchor } from '@/modules/labs/common/WikiParts';
import type { SDTopic } from './types';

const sdAnchor = (name: string) => wikiAnchor('sd', name);

export default function SDWikiIndex({
  groupedSections,
  allTopics,
  onSelectTopic,
  onSelectSub,
  onOpenGuide,
}: {
  groupedSections: { name: string; topics: SDTopic[] }[];
  allTopics: SDTopic[];
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
  onOpenGuide?: () => void;
}) {
  const totalSubs = allTopics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount = allTopics.filter((t) => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard').length;
  const easyCount = allTopics.filter((t) => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium').length;
  const lldCount = allTopics.filter((t) => t.isLLD).length;

  return (
    <div className="lab-container space-y-[1.5rem]">
      <WikiHero
        icon="ServerStackIcon"
        title="System Design Wiki"
        description="Production-scale architecture interview reference"
        onOpenGuide={onOpenGuide}
        metrics={[
          { label: 'Categories', value: groupedSections.length },
          { label: 'Problems', value: allTopics.length },
          { label: 'Subtopics', value: totalSubs },
          { label: 'LLD', value: lldCount },
          { label: 'Hard', value: hardCount, tone: 'hard' },
          { label: 'Easy', value: easyCount, tone: 'easy' },
        ]}
      >
        <LabProgressSummary lab="system_design" topicIds={allTopics.map((t) => t.id)} noun="problems" />
      </WikiHero>

      <WikiIndexNav
        id="sd-category-index"
        title="Category index"
        countLabel={`${groupedSections.length} categories`}
        items={groupedSections.map((s) => ({ name: s.name, count: s.topics.length, href: `#${sdAnchor(s.name)}` }))}
      />

      <div className="space-y-[2rem]">
        {groupedSections.map((section) => (
          <section
            key={section.name}
            id={sdAnchor(section.name)}
            aria-labelledby={`${sdAnchor(section.name)}-title`}
            // the old scroll margin was 6px (spacing keys 6/12/24... are pixels in this repo): a jump landed under the phones' sticky Topics bar
            className="scroll-mt-[4.5rem] space-y-[1rem] md:scroll-mt-[1.5rem]"
          >
            <WikiSectionHeading
              id={`${sdAnchor(section.name)}-title`}
              name={section.name}
              count={`${section.topics.length} ${section.topics.length === 1 ? 'problem' : 'problems'}`}
            />
            {/* The columns follow the pane (not the window), like the DSA wiki; the old row gap was 6px */}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-[1rem]">
              {section.topics.map((t) => (
                <li key={t.id}>
                  <div className={WIKI_CARD} onClick={() => onSelectTopic(t.id)}>
                    <span
                      aria-hidden="true"
                      data-semantic="difficulty"
                      className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full opacity-50 transition-opacity group-hover:opacity-90 ${difficultyDotClass(t.difficulty)}`}
                    />
                    <div className="flex h-full flex-col px-[1.25rem] py-[1rem]">
                      <h3 className="break-words text-sm font-semibold leading-snug text-foreground">
                        {/* a real button: the old <h3> only answered to a mouse */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTopic(t.id);
                          }}
                          className={`todo-focus rounded text-left transition-colors ${WIKI_CARD_TITLE_HOVER}`}
                        >
                          {t.name}
                        </button>
                      </h3>
                      <div className="mt-[0.5rem] flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.25rem]">
                        <DifficultyTag difficulty={t.difficulty} />
                        {t.isLLD && <span className={LAB_CHIP_ACCENT}>LLD</span>}
                        {t.scale !== 'N/A' && (
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">{t.scale}</span>
                        )}
                        <DoneMark lab="system_design" topicId={t.id} />
                      </div>
                      <p className="mt-[0.625rem] text-[13px] font-medium leading-relaxed mix-text-foreground/[0.78]">
                        {t.brief}
                      </p>
                      {t.subtopics.length > 0 && (
                        <div className="mt-[0.75rem] flex flex-wrap gap-1.5">
                          {t.subtopics.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectSub(t.id, s.id);
                              }}
                              title={s.brief}
                              className={WIKI_CHIP}
                            >
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
