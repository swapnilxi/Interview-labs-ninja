import Icon from '@/components/ui/AppIcon';

interface AchievementBadgeProps {
  title: string;
  description: string;
  icon: string;
  isUnlocked: boolean;
  unlockedDate?: string;
}

/** An achievement as a row: a toned symbol tile (jade once unlocked), title, one-line description. Not rendered today. */
export default function AchievementBadge({
  title,
  description,
  icon,
  isUnlocked,
  unlockedDate,
}: AchievementBadgeProps) {
  return (
    <div className={`ds-card flex items-start gap-3 p-4 ${isUnlocked ? '' : 'opacity-60'}`}>
      <span
        className={`ds-icon-tile ${isUnlocked ? 'ds-tone-jade' : 'ds-tone-neutral'}`}
        aria-hidden="true"
      >
        <Icon name={icon} size={20} variant={isUnlocked ? 'solid' : 'outline'} />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="ds-h3">{title}</h4>
        <p className="mt-0.5 line-clamp-2 text-[0.8rem] leading-snug ds-faint">{description}</p>
        {isUnlocked && unlockedDate && (
          <p className="mt-1.5 text-[0.75rem] font-semibold ds-tone-jade ds-tone-text">
            Unlocked {unlockedDate}
          </p>
        )}
      </div>
    </div>
  );
}
