'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: string;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: string;
  };
}

export default function EmptyState({
  icon = 'FolderIcon',
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center max-w-lg mx-auto my-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 border border-primary/20">
        <Icon name={icon as any} size={28} />
      </div>

      <h3 className="font-heading text-lg font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction &&
            (primaryAction.href ? (
              <Link
                href={primaryAction.href}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-102"
              >
                {primaryAction.icon && <Icon name={primaryAction.icon as any} size={15} />}
                <span>{primaryAction.label}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-102"
              >
                {primaryAction.icon && <Icon name={primaryAction.icon as any} size={15} />}
                <span>{primaryAction.label}</span>
              </button>
            ))}

          {secondaryAction &&
            (secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors"
              >
                {secondaryAction.icon && <Icon name={secondaryAction.icon as any} size={15} />}
                <span>{secondaryAction.label}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors"
              >
                {secondaryAction.icon && <Icon name={secondaryAction.icon as any} size={15} />}
                <span>{secondaryAction.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
