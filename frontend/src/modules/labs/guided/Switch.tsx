'use client';

import { useId, type ReactNode } from 'react';

/** An iOS-style switch (styles/guided-practice.css, `.gp-switch`). Name it with `label`, or wrap it in a SwitchRow. */
export function Switch({
  checked,
  onChange,
  label,
  id,
  size = 'md',
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  id?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-size={size === 'sm' ? 'sm' : undefined}
      className="gp-switch todo-focus"
      onClick={() => onChange(!checked)}
    />
  );
}

/** A row of an inset grouped list: a title, one line of explanation, and the switch at the end. The whole row toggles. */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="gp-group-row cursor-pointer py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}
