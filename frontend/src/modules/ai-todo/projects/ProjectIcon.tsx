import FlatIcon, { isFlatIconName } from '@/components/ui/FlatIcon';

/** A project that never had an icon picked is saved with this one (the first choice in New Project). */
export const DEFAULT_PROJECT_ICON = '📁'; // emoji-ok: the stored default of older projects, drawn as the flat folder

/** Flat icons a project can have, saved as "fc:<name>". The first is the default (the folder). */
export const PROJECT_ICON_CHOICES: { value: string; label: string }[] = [
  { value: DEFAULT_PROJECT_ICON, label: 'Folder' },
  { value: 'fc:idea', label: 'Idea' },
  { value: 'fc:briefcase', label: 'Work' },
  { value: 'fc:home', label: 'Home' },
  { value: 'fc:study', label: 'Study' },
  { value: 'fc:reading', label: 'Reading' },
  { value: 'fc:fitness', label: 'Fitness' },
  { value: 'fc:money', label: 'Money' },
  { value: 'fc:code', label: 'Code' },
  { value: 'fc:travel', label: 'Travel' },
];

/**
 * A project's icon. New projects pick a flat icon ("fc:<name>"); the default (and no icon) is the flat folder; an
 * emoji saved by an older version is still shown as it was, so nothing a person picked before disappears.
 */
export default function ProjectIcon({ icon, size = 22 }: { icon?: string | null; size?: number }) {
  if (!icon || icon === DEFAULT_PROJECT_ICON) return <FlatIcon name="folder" size={size} />;
  if (icon.startsWith('fc:')) {
    const name = icon.slice(3);
    return isFlatIconName(name) ? <FlatIcon name={name} size={size} /> : <FlatIcon name="folder" size={size} />;
  }
  return <>{icon}</>;
}
