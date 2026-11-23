import React from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  CAREER_SERVICE_GROUPS,
  CAREER_SERVICES,
  servicesInGroup,
  type CareerServiceItem,
  type CareerServiceTab,
} from '../shared/careerCatalog';
import type { Resume } from '../shared/types';

interface CareerStudioIndexProps {
  profiles: Resume[];
  loaded: boolean;
  onSelectTab: (tab: CareerServiceTab) => void;
  onOpenWizard?: () => void;
  onOpenImport?: () => void;
}

const CARD =
  'lab-glow todo-focus group flex h-full flex-col rounded-lg border bg-card p-[1.25rem] lab-edge lab-edge-link cursor-pointer text-left transition-all';

function ServiceCard({
  service,
  onSelect,
}: {
  service: CareerServiceItem;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={CARD}
      style={{ '--lab-identity': service.color } as React.CSSProperties}
    >
      <div className="relative flex h-full flex-col">
        {/* Top: Icon + Title + Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="lab-tile h-10 w-10 shrink-0" aria-hidden="true">
              <Icon name={service.icon} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                {service.title}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{service.hint}</p>
            </div>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold border"
            style={{
              borderColor: `color-mix(in srgb, ${service.color} 30%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${service.color} 10%, transparent)`,
              color: service.color,
            }}
          >
            {service.badge}
          </span>
        </div>

        {/* Middle: Description */}
        <p className="mt-3 flex-1 text-sm leading-relaxed mix-text-foreground/[0.78]">
          {service.description}
        </p>

        {/* Feature Tags */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {service.features.map((feature) => (
            <span
              key={feature}
              className="inline-flex items-center rounded-md bg-secondary/60 px-2 py-0.5 text-[0.72rem] font-medium text-muted-foreground"
            >
              {feature}
            </span>
          ))}
        </div>

        {/* Bottom: Action link */}
        <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold lab-ink">
            {service.actionLabel}
            <Icon
              name="ArrowRightIcon"
              size={14}
              className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
            />
          </span>
          <span className="text-[0.7rem] text-muted-foreground font-medium uppercase tracking-wider">
            Ready
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CareerStudioIndex({
  profiles,
  loaded,
  onSelectTab,
  onOpenWizard,
  onOpenImport,
}: CareerStudioIndexProps) {
  return (
    <div className="space-y-[2.25rem]">
      {/* Hero Banner matching /labs */}
      <header className="lab-hero">
        <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 flex-wrap items-start gap-4">
            <span
              className="lab-tile lab-tile-duo h-[3.25rem] w-[3.25rem] shrink-0"
              aria-hidden="true"
              style={{ '--lab-identity': '#6366F1' } as React.CSSProperties}
            >
              <Icon name="BriefcaseIcon" size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                  Career Studio
                </h1>
                <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-primary">
                  All-in-One Hub
                </span>
              </div>
              <p className="mt-1.5 max-w-[46rem] text-sm leading-relaxed text-muted-foreground">
                Your unified career engineering workspace. Fill your data once in a master profile,
                audit and optimize with AI intelligence, and publish ATS-ready resumes and interactive web
                portfolios across bespoke design themes.
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold tabular-nums text-foreground">
                    {CAREER_SERVICES.length}
                  </span>{' '}
                  services
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {CAREER_SERVICE_GROUPS.length}
                  </span>{' '}
                  studio suites
                </span>
                {loaded && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {profiles.length}
                      </span>{' '}
                      {profiles.length === 1 ? 'profile' : 'profiles'} saved
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Hero Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start">
            <button
              type="button"
              onClick={() => onSelectTab('jobfinder')}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition-all"
            >
              <Icon name="MagnifyingGlassIcon" size={15} />
              Scout Jobs (Daily 10)
            </button>
            {onOpenWizard && (
              <button
                type="button"
                onClick={onOpenWizard}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-glow transition-all"
              >
                <Icon name="PlusIcon" size={15} />
                Create Profile
              </button>
            )}
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-all"
              >
                <Icon name="ArrowDownTrayIcon" size={15} />
                Import Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectTab('analyzer')}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <Icon name="MagnifyingGlassCircleIcon" size={15} />
              ATS Analyzer
            </button>
          </div>
        </div>
      </header>

      {/* Service Suites Groups */}
      {CAREER_SERVICE_GROUPS.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`career-group-${group.id}`}
          className="space-y-[1rem]"
        >
          <div className="flex items-baseline justify-between">
            <div>
              <h2 id={`career-group-${group.id}`} className="text-lg font-semibold text-foreground">
                {group.label}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>
            </div>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-[1.25rem]">
            {servicesInGroup(group.id).map((service) => (
              <li key={service.id}>
                <ServiceCard service={service} onSelect={() => onSelectTab(service.tab)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Across Career Studio Feature Banner */}
      <section aria-labelledby="career-across-title" className="space-y-[1rem]">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 id="career-across-title" className="text-lg font-semibold text-foreground">
              Across Career Studio
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Unified intelligence and seamless synchronisation across your entire portfolio and application lifecycle.
            </p>
          </div>
        </div>

        <div
          className="lab-glow group flex flex-col gap-5 rounded-lg border bg-card p-5 lab-edge sm:p-6"
          style={{ '--lab-identity': '#8B5CF6' } as React.CSSProperties}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="lab-tile lab-tile-duo h-11 w-11 shrink-0" aria-hidden="true">
                <Icon name="SparklesIcon" size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">
                    AI Career Copilot
                  </h3>
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-purple-400">
                    Smart Assistant
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed mix-text-foreground/[0.78]">
                  Context-aware intelligence across all your documents. Critique work experience bullets using the STAR method, generate quantifiable impact metrics, discover missing industry keywords, and tune narrative tone for your dream role.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectTab('analyzer')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-all"
              >
                <Icon name="MagnifyingGlassCircleIcon" size={14} />
                Audit My Resume
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('match')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
              >
                <Icon name="ScaleIcon" size={14} />
                Match Target Role
              </button>
            </div>
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="border-t border-border/40 pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Quick Career Prompts &amp; Workflows:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Scout live roles with Autonomous Web Agent (Daily 10)', tab: 'jobfinder' as const },
                { label: 'Rewrite bullets with quantifiable impact metrics', tab: 'analyzer' as const },
                { label: 'Compare background against target job description', tab: 'match' as const },
                { label: 'Generate role-tailored pitch letter', tab: 'coverletters' as const },
                { label: 'Export clean PDF with ATS-friendly single column', tab: 'resumes' as const },
                { label: 'Publish interactive live portfolio link', tab: 'portfolios' as const },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => onSelectTab(pill.tab)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground/80 hover:border-primary/50 hover:bg-primary/5 hover:text-foreground transition-all"
                >
                  <Icon name="ArrowRightIcon" size={11} className="text-muted-foreground" />
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
