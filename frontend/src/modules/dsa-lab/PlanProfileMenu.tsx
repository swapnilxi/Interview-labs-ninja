'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import type { WeekPlanApi } from './useWeekPlan';
import { DEFAULT_WEEKS, MAX_PROFILES } from './weekPlan';
import PlanNameDialog, { type PlanNameDialogProps } from './plan/PlanNameDialog';
import { menuItemClass, menuPopoverClass, menuSeparatorClass } from './ui';

/**
 * The week plan's profile switcher ("Plan 1", "Plan 2", … or the lab's suggested plan) with the
 * save-as / rename / duplicate / delete actions. Rename, duplicate and delete act on the active plan
 * and are only offered while one is active. Everything goes through the shared `useWeekPlan`
 * instance, so the week view and the organizer update together.
 */

const LIMIT_MESSAGE = `You can keep at most ${MAX_PROFILES} plans. Delete one first.`;
const SUGGESTED = 'Suggested plan';

type DialogState = { mode: 'save' } | { mode: 'rename' | 'duplicate'; id: number; name: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const itemClass = menuItemClass;
const separator = <div role="separator" className={menuSeparatorClass} />;

export default function PlanProfileMenu({
  weekPlan,
  compact = false,
  suspended = false,
  className = '',
}: {
  weekPlan: WeekPlanApi;
  /** Smaller trigger with the name cut shorter, for toolbars. */
  compact?: boolean;
  /** The trigger is hidden (a sticky toolbar that slid away): the menu closes instead of floating on its own. */
  suspended?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (suspended) setOpen(false);
  }, [suspended]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  // Handlers that run after an await read the latest hook object.
  const wpRef = useRef(weekPlan);
  wpRef.current = weekPlan;
  const awaitingSwitch = useRef<string | null>(null);

  const { activeProfile, profiles, profilesLoaded, profilesError, switching, loaded } = weekPlan;
  // Until the saved plan has loaded, don't flash "Suggested plan" for a learner who has a plan.
  const planName = loaded ? (activeProfile?.name ?? SUGGESTED) : 'Loading plan…';
  const locked = switching || !loaded;
  const atLimit = profiles.length >= MAX_PROFILES;

  // A plan list that failed to load (or came back empty) is fetched again whenever the menu opens, so "Loading your
  // plans…", "No saved plans yet" and the suggested name "Plan 1" never outlive a one-off network error.
  useEffect(() => {
    if (!open) return;
    const wp = wpRef.current;
    if (!wp.profilesLoaded || wp.profilesError || wp.profiles.length === 0)
      void wp.refreshProfiles();
  }, [open]);

  // Once a switch started here finishes, tell screen readers which plan is showing.
  useEffect(() => {
    if (switching || awaitingSwitch.current === null) return;
    const target = awaitingSwitch.current;
    awaitingSwitch.current = null;
    setAnnouncement(target === planName ? `Now showing ${planName}.` : '');
  }, [switching, planName]);

  /** After a dialog closes, hand focus back to the trigger if it landed nowhere. */
  const refocus = () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) anchorRef.current?.focus({ preventScroll: true });
    });

  /** The menu closes first, so the dialog takes focus from (and returns it to) the trigger. */
  const openDialog = (next: DialogState) => {
    setOpen(false);
    requestAnimationFrame(() => setDialog(next));
  };

  const choose = (id: number, name: string) => {
    setOpen(false);
    if (locked || id === activeProfile?.id) return;
    awaitingSwitch.current = name;
    void weekPlan.switchProfile(id);
  };

  const chooseSuggested = () => {
    setOpen(false);
    if (locked || !activeProfile) return;
    awaitingSwitch.current = SUGGESTED;
    void weekPlan.useSuggested();
  };

  const saveAs = () => {
    if (atLimit) {
      setOpen(false);
      toast.error(LIMIT_MESSAGE);
      return;
    }
    openDialog({ mode: 'save' });
  };

  const remove = async () => {
    setOpen(false);
    const target = wpRef.current.activeProfile;
    if (!target) return;
    const ok = await confirmDialog({
      title: `Delete "${target.name}"?`,
      message:
        'The plan and its week layout are removed for good. Questions you solved stay solved.',
      note: 'The week view shows the suggested plan until you pick another plan.',
      confirmLabel: 'Delete plan',
      tone: 'danger',
    });
    refocus();
    if (!ok) return;
    try {
      await wpRef.current.deleteProfile(target.id);
      toast.success(`Deleted ${target.name}`);
    } catch (e) {
      toast.error(errorText(e, 'Could not delete the plan.'));
      void wpRef.current.refreshProfiles(); // the plan may be gone already (a 404): show the real list
    }
  };

  /** Same wording as the server's 409, checked locally first to save a round trip. */
  const nameTaken = (name: string, exceptId?: number): string | null => {
    const key = name.trim().toLowerCase();
    return wpRef.current.profiles.some(
      (p) => p.id !== exceptId && p.name.trim().toLowerCase() === key
    )
      ? `You already have a plan named '${name.trim()}'.`
      : null;
  };
  const roomForOneMore = () =>
    wpRef.current.profiles.length >= MAX_PROFILES ? LIMIT_MESSAGE : null;

  const switchAction = (id: number) => ({
    label: 'Switch to it',
    onClick: () => void wpRef.current.switchProfile(id),
  });

  let dialogProps: Omit<PlanNameDialogProps, 'isOpen' | 'onClose'> | null = null;
  if (dialog?.mode === 'save') {
    dialogProps = {
      title: 'Save as a new plan',
      description: activeProfile
        ? `A copy of ${activeProfile.name} as it is now. ${activeProfile.name} itself stays as it is.`
        : 'Keeps the suggested plan as one of your own plans, so you can change it freely.',
      initialName: weekPlan.nextProfileName(),
      submitLabel: 'Save plan',
      busyLabel: 'Saving…',
      switchDefault: true,
      validate: (name) => nameTaken(name) ?? roomForOneMore(),
      onSubmit: async (name, switchTo) => {
        const saved = await wpRef.current.saveAsProfile(name, { activate: switchTo });
        if (switchTo) toast.success(`Saved as ${saved.name} and switched to it`);
        else toast.success(`Saved as ${saved.name}`, { action: switchAction(saved.id) });
      },
    };
  } else if (dialog?.mode === 'rename') {
    const { id, name: current } = dialog;
    dialogProps = {
      title: `Rename ${current}`,
      initialName: current,
      submitLabel: 'Rename',
      busyLabel: 'Renaming…',
      validate: (name) => nameTaken(name, id),
      onSubmit: async (name) => {
        if (name === current) return;
        await wpRef.current.renameProfile(id, name);
        toast.success(`Renamed to ${name}`);
      },
    };
  } else if (dialog?.mode === 'duplicate') {
    const { id, name: source } = dialog;
    dialogProps = {
      title: `Duplicate ${source}`,
      description:
        'The same questions and weeks under a new name, so you can rearrange one without touching the other.',
      initialName: weekPlan.nextProfileName(`${source} copy`),
      submitLabel: 'Duplicate',
      busyLabel: 'Duplicating…',
      switchDefault: false,
      validate: (name) => nameTaken(name) ?? roomForOneMore(),
      onSubmit: async (name, switchTo) => {
        const copy = await wpRef.current.duplicateProfile(id, name);
        if (switchTo) {
          await wpRef.current.switchProfile(copy.id);
          toast.success(`Duplicated as ${copy.name} and switched to it`);
        } else {
          toast.success(`Duplicated as ${copy.name}`, { action: switchAction(copy.id) });
        }
      },
    };
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Week plan: ${planName}. Switch or manage plans`}
        title={planName}
        className={`todo-btn todo-btn-quiet min-w-0 max-w-full ${
          compact ? 'h-8 px-2.5' : 'h-9 px-3'
        } ${className}`}
      >
        <Icon
          name={switching ? 'ArrowPathIcon' : 'BookmarkIcon'}
          variant={activeProfile && !switching ? 'solid' : 'outline'}
          size={14}
          className={`shrink-0 ${
            switching
              ? 'text-muted-foreground motion-safe:animate-spin'
              : activeProfile
                ? 'text-primary'
                : 'text-muted-foreground'
          }`}
        />
        <span
          className={`truncate ${compact ? 'max-w-[7.5rem] sm:max-w-[10rem]' : 'max-w-[14rem]'}`}
        >
          {planName}
        </span>
        <Icon
          name="ChevronDownIcon"
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <span role="status" className="sr-only">
        {announcement}
      </span>

      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        label="Week plans"
        placement="bottom-end"
        className={`${menuPopoverClass} w-[min(19rem,calc(100vw-1rem))]`}
      >
        <div className="flex items-baseline justify-between gap-2 px-2.5 pb-1 pt-1.5">
          <p className="dsa-caption text-muted-foreground">Your plans</p>
          {profilesLoaded && !profilesError && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {profiles.length} of {MAX_PROFILES}
            </p>
          )}
        </div>

        {!profilesLoaded && !profilesError && (
          <p
            role="status"
            className="px-2.5 py-2 text-[13px] font-medium mix-text-foreground/[0.74]"
          >
            Loading your plans…
          </p>
        )}
        {profilesError && (
          <div role="alert" className="flex items-center gap-2 px-2.5 pb-1.5 pt-1">
            <p className="min-w-0 flex-1 text-[13px] font-medium mix-text-foreground/[0.74]">
              Could not load your plans.
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => void weekPlan.refreshProfiles()}
              className="todo-btn todo-btn-ghost -mr-1 shrink-0 px-2 py-1"
            >
              Retry
            </button>
          </div>
        )}
        {profilesLoaded && !profilesError && profiles.length === 0 && (
          <p className="px-2.5 pb-2 pt-1 leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74]">
            No saved plans yet. Save this one, or edit the week plan and it is kept as My plan.
          </p>
        )}
        {profiles.length > 0 && (
          <div className="max-h-[16rem] overflow-y-auto scrollbar-clean">
            {profiles.map((p) => {
              const current = p.id === activeProfile?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  aria-current={current ? 'true' : undefined}
                  disabled={locked && !current}
                  onClick={() => choose(p.id, p.name)}
                  title={p.summary || undefined}
                  className={itemClass}
                >
                  <Icon
                    name="CheckIcon"
                    size={14}
                    className={`mt-0.5 shrink-0 text-primary ${current ? '' : 'invisible'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-foreground">{p.name}</span>
                    <span className="block tabular-nums text-[13px] font-medium mix-text-foreground/[0.74]">
                      {plural(p.planned, 'question')} · {plural(p.weeks, 'week')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {separator}
        <button
          type="button"
          role="menuitem"
          aria-current={activeProfile ? undefined : 'true'}
          disabled={locked && !!activeProfile}
          onClick={chooseSuggested}
          className={itemClass}
        >
          <Icon
            name="CheckIcon"
            size={14}
            className={`mt-0.5 shrink-0 text-primary ${activeProfile ? 'invisible' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">{SUGGESTED}</span>
            <span className="block tabular-nums text-[13px] font-medium mix-text-foreground/[0.74]">
              {plural(weekPlan.coreOrder.length, 'core question')} · {DEFAULT_WEEKS} weeks
              {activeProfile ? ' · your plans stay saved' : ''}
            </span>
          </span>
        </button>

        {separator}
        <button
          type="button"
          role="menuitem"
          aria-disabled={atLimit || !loaded ? 'true' : undefined}
          onClick={loaded ? saveAs : () => setOpen(false)}
          className={itemClass}
        >
          <Icon name="PlusIcon" size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">Save as new plan…</span>
            {atLimit && (
              <span className="block text-[13px] font-medium mix-text-foreground/[0.74]">
                {LIMIT_MESSAGE}
              </span>
            )}
          </span>
        </button>
        {activeProfile && (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => openDialog({ mode: 'rename', ...activeProfile })}
              className={`${itemClass} items-center`}
            >
              <Icon name="PencilSquareIcon" size={14} className="shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">Rename…</span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-disabled={atLimit ? 'true' : undefined}
              onClick={() => {
                if (!atLimit) openDialog({ mode: 'duplicate', ...activeProfile });
                else {
                  setOpen(false);
                  toast.error(LIMIT_MESSAGE);
                }
              }}
              className={`${itemClass} items-center`}
            >
              <Icon
                name="DocumentDuplicateIcon"
                size={14}
                className="shrink-0 text-muted-foreground"
              />
              <span className="font-medium text-foreground">Duplicate…</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={switching}
              onClick={() => void remove()}
              className={`${itemClass} items-center text-error`}
            >
              <Icon name="TrashIcon" size={14} className="shrink-0" />
              <span className="font-medium">Delete…</span>
            </button>
          </>
        )}
      </Popover>

      {dialogProps && (
        <PlanNameDialog
          isOpen
          onClose={() => {
            setDialog(null);
            refocus();
          }}
          {...dialogProps}
        />
      )}
    </>
  );
}
