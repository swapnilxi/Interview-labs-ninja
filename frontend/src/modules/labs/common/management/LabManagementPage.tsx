'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useUrlState } from '@/lib/navigation/urlState';
import LabSettingsManager from '@/modules/labs/common/LabSettingsManager';
import LabCatalogPanel from './LabCatalogPanel';
import TopicManagementPanel from './TopicManagementPanel';
import { useLabCatalog } from './useLabCatalog';
import {
  capitalize,
  manageHref,
  type LabManagementConfig,
  type LabView,
  type ManageTab,
} from './types';

/**
 * The management page of a lab (`config.managePath`), every screen of it an address:
 *
 *   ?                      Lab management > Sections and prompts
 *   ?section=ID            one section's settings (its instructions, add-on and context)
 *   ?view=catalog          Lab management > Patterns and topics ("Categories and topics" in the labs that say category)
 *   ?tab=topic&topic=ID    Topic management of one topic (`sub=` keeps the subtopic the person came from)
 *
 * One component for every lab: all that differs is the config (see types.ts). Needs a Suspense boundary above it.
 */
export default function LabManagementPage({ config }: { config: LabManagementConfig }) {
  const { get, update } = useUrlState();
  const tab: ManageTab = get('tab') === 'topic' ? 'topic' : 'lab';
  const view: LabView = get('view') === 'catalog' ? 'catalog' : 'prompts';
  const topicId = get('topic') ?? '';
  const subId = get('sub') ?? '';
  const catalog = useLabCatalog(config);
  const { many } = config.groupNoun;

  const backHref = topicId
    ? `${config.labPath}?${new URLSearchParams({ topic: topicId, ...(subId ? { sub: subId } : {}) })}`
    : config.labPath;

  const tabClass = (active: boolean) =>
    `todo-focus -mb-px border-b-2 px-1 py-2.5 text-sm font-medium transition-colors ${
      active
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div
      className={`lab-shell flex flex-col ${config.shell?.className ?? ''}`}
      data-lab={config.shell?.dataLab}
    >
      <main className="lab-main scrollbar-clean">
        <div className="mx-auto w-full max-w-[56rem] px-4 pb-[3rem] pt-[1.5rem] sm:px-[2rem] sm:pt-[2rem]">
          <Link
            href={backHref}
            className="todo-focus -ml-2.5 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-[2rem]"
          >
            <Icon name="ArrowLeftIcon" size={16} />
            {config.labName}
          </Link>

          <header className="mt-3 flex items-center gap-3">
            <span aria-hidden="true" className="lab-tile hidden h-11 w-11 sm:inline-flex">
              <Icon name={config.icon} size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-[1.5rem] font-semibold leading-tight tracking-[-0.022em] text-foreground">
                {config.labName} management
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Shape how sections are written, and organise {many} and topics
              </p>
            </div>
          </header>

          <div
            role="tablist"
            aria-label="Management"
            className="mt-[1.5rem] flex gap-[1.5rem] border-b"
          >
            <Link
              href={manageHref(config, { tab: 'lab', topic: topicId, sub: subId })}
              role="tab"
              aria-selected={tab === 'lab'}
              className={tabClass(tab === 'lab')}
            >
              Lab management
            </Link>
            <Link
              href={manageHref(config, { tab: 'topic', topic: topicId, sub: subId })}
              role="tab"
              aria-selected={tab === 'topic'}
              className={tabClass(tab === 'topic')}
            >
              Topic management
            </Link>
          </div>

          <div className="mt-[1.5rem]" role="tabpanel">
            {tab === 'lab' ? (
              <div className="space-y-[1.5rem]">
                <div className="todo-segmented" role="group" aria-label="Lab management views">
                  <button
                    type="button"
                    aria-pressed={view === 'prompts'}
                    onClick={() => update({ view: null }, 'replace')}
                    className="todo-segment"
                  >
                    Sections and prompts
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'catalog'}
                    onClick={() => update({ view: 'catalog' }, 'replace')}
                    className="todo-segment"
                  >
                    {capitalize(many)} and topics
                  </button>
                </div>
                {view === 'prompts' ? (
                  <LabSettingsManager
                    initialLab={config.lab}
                    fixedLab={config.lab}
                    section={{
                      activeId: get('section'),
                      hrefFor: (id) =>
                        manageHref(config, { section: id, topic: topicId, sub: subId }),
                      backHref: manageHref(config, { topic: topicId, sub: subId }),
                    }}
                  />
                ) : (
                  <LabCatalogPanel config={config} catalog={catalog} />
                )}
              </div>
            ) : (
              <TopicManagementPanel
                config={config}
                catalog={catalog}
                topicId={topicId}
                subId={subId}
                onPickTopic={(id) => update({ topic: id, sub: null }, 'replace')}
                onRemoved={() => update({ tab: null, view: 'catalog', topic: null, sub: null })}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
