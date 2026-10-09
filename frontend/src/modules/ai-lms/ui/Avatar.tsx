import Image from 'next/image';

/**
 * One avatar treatment for every instructor/user on ai-bootcamp pages: photo
 * via next/image, else a deterministic gradient-monogram fallback. Ported
 * from AI-Bootcamp-reference's `components/ui/Avatar.tsx`, minus its
 * hardcoded per-name bespoke-illustration branch (reference-specific seed
 * data, not something this app has).
 */

export type AbAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<AbAvatarSize, string> = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-10 h-10 text-sm',
  md: 'w-14 h-14 text-lg',
  lg: 'w-20 h-20 text-2xl',
  xl: 'w-28 h-28 sm:w-36 sm:h-36 text-4xl sm:text-5xl',
};

const SIZE_PX: Record<AbAvatarSize, number> = { xs: 20, sm: 40, md: 56, lg: 80, xl: 144 };

const RADIUS_CLASS = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
} as const;

// Deterministic gradient palette for the initials fallback.
const GRADIENTS = [
  'from-orange-500/20 via-amber-500/10 to-transparent text-orange-300 border-orange-500/30',
  'from-purple-500/20 via-indigo-500/10 to-transparent text-purple-300 border-purple-500/30',
  'from-emerald-500/20 via-teal-500/10 to-transparent text-emerald-300 border-emerald-500/30',
  'from-blue-500/20 via-cyan-500/10 to-transparent text-blue-300 border-blue-500/30',
  'from-rose-500/20 via-amber-500/10 to-transparent text-rose-300 border-rose-500/30',
];

export function AbAvatar({
  src,
  name,
  size = 'md',
  radius = '2xl',
  glow = false,
  className = '',
}: {
  src?: string | null;
  name?: string | null;
  size?: AbAvatarSize;
  radius?: keyof typeof RADIUS_CLASS;
  /** Adds the premium gold bloom used on hero/profile-grade avatars. */
  glow?: boolean;
  className?: string;
}) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || '•';
  const charCode = (name || 'mentor').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const activeGradient = GRADIENTS[charCode % GRADIENTS.length];

  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-ab-cream/20 bg-[#16161c] shadow-sm transition-all duration-300 ${SIZE_CLASS[size]} ${
        RADIUS_CLASS[radius]
      } ${glow ? 'shadow-[0_8px_30px_-6px_rgba(249,115,22,0.35)] ring-2 ring-orange-500/30' : ''} ${className}`}
    >
      {src ? (
        <Image
          src={src}
          alt={name || 'Avatar'}
          fill
          unoptimized
          sizes={`${SIZE_PX[size]}px`}
          className="object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center font-ab-serif font-semibold bg-gradient-to-br ${activeGradient} backdrop-blur-sm select-none`}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
