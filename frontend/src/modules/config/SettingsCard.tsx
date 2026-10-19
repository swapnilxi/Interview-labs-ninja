import type { ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * The Settings page cards: one hairline surface, 16px padding on a phone and 24px from `sm`, a 20px rhythm between its parts.
 * Spacing is written in rem because the keys 6/12/18/24/36/48 are pixels in this repo's Tailwind config.
 */
export const SETTINGS_CARD =
  'rounded-lg border border-border bg-card p-4 sm:p-[1.5rem] space-y-[1.25rem]';

/** Card title row: the section icon in the accent chip, a title, one line of help, and an optional control on the right. */
export function SettingsCardHeader({
  icon,
  title,
  description,
  trailing,
}: {
  icon: string;
  title: string;
  description: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="todo-icon-chip h-9 w-9">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {trailing}
    </div>
  );
}
