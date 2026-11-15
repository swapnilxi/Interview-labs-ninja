import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters?: () => void;
}

export default function EmptyState({ hasFilters, onClearFilters }: EmptyStateProps) {
  return (
    <div className="ds-card flex flex-col items-center px-[1.5rem] py-[2.75rem] text-center">
      <span className="ds-icon-tile ds-icon-tile-lg ds-tone-neutral" aria-hidden="true">
        <FlatIcon name={hasFilters ? 'search' : 'inbox'} size={24} />
      </span>

      <h3 className="ds-h2 mt-4">{hasFilters ? 'No matching questions' : 'No questions yet'}</h3>

      <p className="ds-body mt-1.5 max-w-[42ch]">
        {hasFilters
          ? 'Nothing matches these filters. Try a different search, or clear the filters to see every question.'
          : 'Start a daily session to build your bank. Questions from your sessions appear here to review and practise again.'}
      </p>

      {hasFilters && onClearFilters && (
        <button type="button" onClick={onClearFilters} className="ds-btn ds-btn-secondary mt-5">
          <Icon name="XMarkIcon" size={17} variant="outline" />
          Clear filters
        </button>
      )}
    </div>
  );
}
