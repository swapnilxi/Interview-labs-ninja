import Icon from '@/components/ui/AppIcon';

interface ThemeToggleIconProps {
  /** The theme once it is known; `null` before the header has read the stored theme (the first render). */
  theme: 'light' | 'dark' | null;
  size?: number;
  variant?: 'outline' | 'solid';
}

/**
 * The icon of a theme toggle: the sun while the theme is dark (it switches to light), the moon while it is light.
 *
 * Server HTML and the first client render must match, and neither can know the theme: `layout.tsx`'s inline script sets
 * the `dark` class on <html> before the first paint, but React state has not read it yet. So while `theme` is null BOTH
 * icons are rendered and the `dark` class picks one with CSS. The markup is then identical on server and client (no
 * hydration warning) and the right icon is there from the first paint (no one-frame swap). Once the theme is known a
 * single icon renders.
 */
export default function ThemeToggleIcon({ theme, size = 18, variant }: ThemeToggleIconProps) {
  if (theme === null) {
    return (
      <>
        <Icon name="SunIcon" size={size} variant={variant} className="hidden dark:block" />
        <Icon name="MoonIcon" size={size} variant={variant} className="dark:hidden" />
      </>
    );
  }
  return <Icon name={theme === 'dark' ? 'SunIcon' : 'MoonIcon'} size={size} variant={variant} />;
}
