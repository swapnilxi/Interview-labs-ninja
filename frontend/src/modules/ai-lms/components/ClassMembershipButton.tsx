'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { removeClassReminders, requestOpenClassReminders } from '@/lib/schedules/classReminders';
import { toast } from '@/lib/ui/toast';
import { lmsService } from '../services/lmsService';
import type { LmsMembership, LmsMembershipStatus } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { LMS_TOOLBAR_BTN } from './toolbarStyles';

interface ClassMembershipButtonProps {
  /** The class the button belongs to (its URL slug). */
  classSlug: string;
  /** Extra classes for the button, after the shared toolbar look. */
  className?: string;
  onChange?: (state: { status: LmsMembershipStatus | null; memberCount: number }) => void;
}

const LABEL: Record<'none' | LmsMembershipStatus, string> = {
  none: 'Join class',
  enrolled: 'Joined',
  interested: 'Following',
};

/**
 * "Join class" for learners: being in a class is how its instructor's updates reach you (and what the class's
 * practice reminders hang on). Joined = enrolled. "Following" is the state you land in by turning on a class's
 * practice reminders without joining; it gets the same updates. Leaving asks first, and also turns that class's
 * practice reminders off on this account.
 *
 * The change shows at once and is put back, with the reason, if the server refuses it.
 */
export default function ClassMembershipButton({ classSlug, className = '', onChange }: ClassMembershipButtonProps) {
  const [membership, setMembership] = useState<LmsMembership | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = (next: LmsMembership) => {
    setMembership(next);
    onChangeRef.current?.({ status: next.status, memberCount: next.member_count });
  };

  useEffect(() => {
    let cancelled = false;
    setMembership(null);
    setLoadError(null);
    lmsService
      .getClassMembership(classSlug)
      .then((m) => {
        if (cancelled) return;
        setMembership(m);
        onChangeRef.current?.({ status: m.status, memberCount: m.member_count });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your place in this class.');
      });
    return () => {
      cancelled = true;
    };
  }, [classSlug]);

  const status = membership?.status ?? null;
  const key: 'none' | LmsMembershipStatus = status ?? 'none';

  const join = async () => {
    if (!membership || busy) return;
    const before = membership;
    setBusy(true);
    apply({ ...before, status: 'enrolled', member_count: before.member_count + (before.status ? 0 : 1) });
    try {
      apply(await lmsService.setClassMembership(classSlug, 'enrolled'));
      toast.success('You joined this class. Updates from its instructor will show in your notifications.', {
        duration: 8000,
        action: { label: 'Set practice time', onClick: () => requestOpenClassReminders(classSlug) },
      });
    } catch (err) {
      apply(before);
      toast.error(err instanceof Error ? err.message : 'Could not join this class. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!membership || busy) return;
    const before = membership;
    setConfirmLeave(false);
    setBusy(true);
    apply({ ...before, status: null, member_count: Math.max(0, before.member_count - 1) });
    try {
      apply(await lmsService.leaveClass(classSlug));
      // The reminders belong to being in the class: they stop with it.
      const stopped = await removeClassReminders(classSlug).catch(() => 0);
      toast.info(stopped > 0 ? 'You left this class and its practice reminders are off.' : 'You left this class.');
    } catch (err) {
      apply(before);
      toast.error(err instanceof Error ? err.message : 'Could not leave this class. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (status ? setConfirmLeave(true) : void join())}
        disabled={busy || !membership}
        aria-pressed={status !== null}
        title={
          loadError
            ? loadError
            : status === 'enrolled'
              ? 'You are in this class. Select to leave.'
              : status === 'interested'
                ? 'You follow this class through its practice reminders. Select to stop.'
                : 'Join this class to get updates from its instructor and set practice reminders'
        }
        className={`${LMS_TOOLBAR_BTN} ${className}`}
      >
        <Icon name={status ? 'CheckIcon' : 'UserPlusIcon'} size={14} />
        <span>{LABEL[key]}</span>
        {membership && membership.member_count > 0 && (
          <span className="tabular-nums text-muted-foreground" aria-label={`${membership.member_count} in this class`}>
            {membership.member_count}
          </span>
        )}
      </button>

      <ConfirmDialog
        isOpen={confirmLeave}
        title={status === 'interested' ? 'Stop following this class?' : 'Leave this class?'}
        message="You will stop getting updates from its instructor, and the practice reminders you set for this class will be turned off. You can join again any time."
        confirmLabel={status === 'interested' ? 'Stop following' : 'Leave class'}
        isDestructive={false}
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}
