'use client';

import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from '../context/LmsViewModeContext';

/**
 * Floating control (pinned to the viewport corner, clear of the safe-area inset), editor+ only, that flips every AI LMS page between the
 * real editor/admin view and a student-preview (edit/generate/organize
 * controls hidden). Purely a rendering toggle — role and API permissions are
 * untouched, so switching back is instant and nothing server-side depends on it.
 */
export default function ViewModeToggle() {
  const { canEdit, user } = useAuth();
  const { isPreviewingAsStudent, toggle } = useLmsViewMode();

  if (!canEdit) return null;

  const roleLabel = user?.role === 'editor' ? 'Instructor' : 'Admin';

  const label = isPreviewingAsStudent ? 'Viewing as Student' : `Viewing as ${roleLabel}`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${label}. ${isPreviewingAsStudent ? `Switch back to ${roleLabel} view` : 'Switch to student preview'}`}
      title={isPreviewingAsStudent ? `Switch back to ${roleLabel} view` : 'Preview as a student'}
      className={`lms-admin-pill ${isPreviewingAsStudent ? 'lms-admin-pill-student' : ''}`}
    >
      <Icon name={isPreviewingAsStudent ? 'AcademicCapIcon' : 'EyeIcon'} size={15} />
      <span>{label}</span>
      <span className="lms-admin-pill-action">Switch</span>
    </button>
  );
}
