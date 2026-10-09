'use client';

import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from '../context/LmsViewModeContext';

/**
 * Floating control, editor+ only, that flips every AI LMS page between the
 * real editor/admin view and a student-preview (edit/generate/organize
 * controls hidden). Purely a rendering toggle — role and API permissions are
 * untouched, so switching back is instant and nothing server-side depends on it.
 */
export default function ViewModeToggle() {
  const { canEdit, user } = useAuth();
  const { isPreviewingAsStudent, toggle } = useLmsViewMode();

  if (!canEdit) return null;

  const roleLabel = user?.role === 'editor' ? 'Instructor' : 'Admin';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isPreviewingAsStudent ? `Switch back to ${roleLabel} view` : 'Preview as a student'}
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium shadow-lg transition-colors ${
        isPreviewingAsStudent
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
          : 'border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      <Icon name={isPreviewingAsStudent ? 'AcademicCapIcon' : 'EyeIcon'} size={18} />
      {isPreviewingAsStudent ? 'Viewing as Student' : `Viewing as ${roleLabel}`}
      <span className="text-xs opacity-70">· switch</span>
    </button>
  );
}
