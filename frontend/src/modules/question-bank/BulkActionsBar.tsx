'use client';

import Icon from '@/components/ui/AppIcon';

interface BulkActionsBarProps {
  selectedCount: number;
  onExport: () => void;
  onMarkForReview: () => void;
  onClearSelection: () => void;
}

/** A floating glass bar while questions are selected (above the tab bar on phones, centred on wider screens). */
export default function BulkActionsBar({
  selectedCount,
  onExport,
  onMarkForReview,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="ins-bulk" role="region" aria-label="Selected questions">
      <button
        type="button"
        onClick={onClearSelection}
        className="ins-icon-btn"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <Icon name="XMarkIcon" size={18} variant="outline" />
      </button>
      <p
        className="mr-auto min-w-0 truncate pr-1 text-[0.88rem] font-semibold ds-ink ds-num"
        aria-live="polite"
      >
        {selectedCount} selected
      </p>
      <button type="button" onClick={onMarkForReview} className="ds-btn ds-btn-secondary ds-btn-sm">
        <Icon name="BookmarkIcon" size={16} variant="outline" />
        <span className="hidden sm:inline">Mark for review</span>
        <span className="sm:hidden">Mark</span>
      </button>
      <button type="button" onClick={onExport} className="ds-btn ds-btn-primary ds-btn-sm">
        <Icon name="ArrowDownTrayIcon" size={16} variant="outline" />
        Export
      </button>
    </div>
  );
}
