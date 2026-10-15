'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useSmartBack } from '@/lib/navigation/smartBack';

interface BackButtonProps {
  /** The screen this one belongs to, e.g. `/daily-session?tab=session`. */
  href: string;
  /** What it says after the arrow; "Back" on its own, or the parent's name ("Sessions"). */
  label?: string;
  /** Screens reachable from several places: return to wherever the user came from (see useSmartBack). */
  preferHistory?: boolean;
  className?: string;
}

/**
 * The one Back control for any screen that sits below a page's top level (a quiz inside Daily Session,
 * a project inside Plan, a lesson inside a class). It is a real link, so it can be opened in a new tab
 * and reads as navigation to a screen reader; a plain click goes through useSmartBack so Back steps
 * back in history when the parent is the previous screen, and goes to `href` otherwise.
 */
export default function BackButton({ href, label = 'Back', preferHistory = false, className = '' }: BackButtonProps) {
  const goBack = useSmartBack();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // let Cmd/Ctrl/Shift-click and middle-click open the parent the normal way
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        goBack(href, { preferHistory });
      }}
      className={`inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[2rem] ${className}`}
    >
      <Icon name="ArrowLeftIcon" size={16} />
      <span>{label}</span>
    </Link>
  );
}
