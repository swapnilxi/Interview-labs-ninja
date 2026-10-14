import FlatIcon from '@/components/ui/FlatIcon';

/** A project that never had an icon picked is saved with this one (the first choice in New Project). */
export const DEFAULT_PROJECT_ICON = '📁'; // emoji-ok

/**
 * A project's icon. An emoji the user picked is theirs and is shown as it is; the default (and no icon at all)
 * is drawn as the flat folder, so a list of projects doesn't mix emoji with the rest of the icon set.
 */
export default function ProjectIcon({ icon, size = 22 }: { icon?: string | null; size?: number }) {
  if (!icon || icon === DEFAULT_PROJECT_ICON) return <FlatIcon name="folder" size={size} />;
  return <>{icon}</>;
}
