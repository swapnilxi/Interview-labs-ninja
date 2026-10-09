import React from 'react';
import Link from 'next/link';

interface AbButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Ported from AI-Bootcamp-reference's `components/ui/Button.tsx`. */
export function AbButton({
  variant = 'primary',
  size = 'md',
  href,
  external = false,
  className = '',
  children,
  ...props
}: AbButtonProps) {
  const baseClasses =
    'group inline-flex items-center justify-center font-medium rounded-full transition-[transform,box-shadow,background-color,border-color,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-ab-gold focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[48px] whitespace-nowrap cursor-pointer';

  const sizeClasses = {
    sm: 'px-5 sm:px-6 py-2 text-xs uppercase tracking-wider',
    md: 'px-7 py-3 text-sm tracking-wide',
    lg: 'px-9 py-3.5 text-base tracking-wide',
  };

  const variantClasses = {
    // Primary: solid cream/ivory pill with black text; gold appears only as the glow
    primary:
      'btn-sheen text-[#0C0B0A] border border-ab-cream-dim/60 bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF6F0_55%,#F0E6D4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_20px_-10px_rgba(249,115,22,0.4)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_30px_-8px_rgba(249,115,22,0.55)] hover:-translate-y-0.5 active:translate-y-0 font-semibold',
    // Secondary: cream outline with cream text; gold only lights up on hover as a glow
    secondary:
      'btn-sheen bg-white/[0.02] backdrop-blur-sm text-ab-cream border border-ab-cream/40 hover:border-ab-cream/70 hover:bg-ab-cream/[0.06] hover:shadow-[0_0_18px_-4px_rgba(249,115,22,0.45)] hover:-translate-y-0.5 active:translate-y-0',
    // Outline: subtle hairline border, cream on hover, with a faint gold glow accent
    outline:
      'bg-transparent text-ab-text border border-ab-black-line hover:border-ab-cream/60 hover:text-ab-cream hover:shadow-[0_0_16px_-6px_rgba(249,115,22,0.4)] active:translate-y-0.5',
  };

  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={combinedClasses}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={combinedClasses}>
        {children}
      </Link>
    );
  }

  return (
    <button className={combinedClasses} {...props}>
      {children}
    </button>
  );
}
