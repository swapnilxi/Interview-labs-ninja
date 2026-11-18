import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import {
  LAB_CATALOG,
  LAB_GROUPS,
  LABS_PROJECT_LINK,
  labsInGroup,
  type LabCatalogEntry,
} from '@/modules/labs/common/labCatalog';
import { labTileStyle } from '@/modules/labs/common/labSectionDefaults';

/**
 * The Labs home (/labs): every lab as a card, in the groups of labCatalog.ts, then Labs Project. Each card's glow and
 * icon tile take the lab's identity hue (--lab-identity, like the lab's own hero); everything interactive stays on
 * the Settings accent.
 */

const CARD =
  'lab-glow todo-focus group flex h-full flex-col rounded-lg border bg-card p-[1.25rem] lab-edge lab-edge-link';

function LabCard({ lab }: { lab: LabCatalogEntry }) {
  return (
    <Link href={lab.path} className={CARD} style={labTileStyle(lab.key)}>
      <div className="relative flex h-full flex-col">
        <div className="flex items-start gap-3">
          <span className="lab-tile h-10 w-10" aria-hidden="true">
            <Icon name={lab.icon} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug text-foreground">{lab.label}</h3>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{lab.hint}</p>
          </div>
        </div>
        <p className="mt-3 flex-1 text-sm leading-relaxed mix-text-foreground/[0.78]">
          {lab.description}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold lab-ink">
          Open lab
          <Icon
            name="ArrowRightIcon"
            size={14}
            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </div>
    </Link>
  );
}

export default function LabsHomeModule() {
  return (
    <div className="space-y-[2rem]">
      <header className="lab-hero">
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="lab-tile lab-tile-duo h-[3rem] w-[3rem]" aria-hidden="true">
            <Icon name="BeakerIcon" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Labs</h1>
            <p className="mt-1 max-w-[42rem] text-sm leading-relaxed text-muted-foreground">
              Study one topic at a time. Each lab writes its sections on demand with your AI model,
              keeps a quiz and a copilot next to every page, and tracks what you have completed.
            </p>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {LAB_CATALOG.length}
              </span>{' '}
              labs ·{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {LAB_GROUPS.length}
              </span>{' '}
              groups
            </p>
          </div>
        </div>
      </header>

      {LAB_GROUPS.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`labs-group-${group.id}`}
          className="space-y-[1rem]"
        >
          <div>
            <h2 id={`labs-group-${group.id}`} className="text-lg font-semibold text-foreground">
              {group.label}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-[1rem]">
            {labsInGroup(group.id).map((lab) => (
              <li key={lab.path}>
                <LabCard lab={lab} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="labs-group-project" className="space-y-[1rem]">
        <h2 id="labs-group-project" className="text-lg font-semibold text-foreground">
          Across labs
        </h2>
        <Link
          href={LABS_PROJECT_LINK.path}
          className={`${CARD} sm:flex-row sm:items-center sm:gap-4`}
          style={labTileStyle()}
        >
          <div className="relative flex min-w-0 flex-1 items-start gap-3">
            <span className="lab-tile h-10 w-10" aria-hidden="true">
              <Icon name={LABS_PROJECT_LINK.icon} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                {LABS_PROJECT_LINK.label}
              </h3>
              <p className="mt-1 text-sm leading-relaxed mix-text-foreground/[0.78]">
                Give the labs a project to write for, and keep the sections you save from any lab in
                one place.
              </p>
            </div>
          </div>
          <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold lab-ink sm:mt-0">
            Open
            <Icon
              name="ArrowRightIcon"
              size={14}
              className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
        </Link>
      </section>
    </div>
  );
}
