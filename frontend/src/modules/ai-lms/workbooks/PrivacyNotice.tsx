import Icon from '@/components/ui/AppIcon';

/** The wording the spec asks for, shown when a workbook is started and reachable from inside it. */
export const PRIVACY_NOTICE =
  'This workbook is shared as a learning resource. Your personal answers, reflections, notes, checklists, and progress are private to your account and cannot be viewed by other users. Sharing a workbook does not make your responses public.';

export default function PrivacyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="wb-notice" aria-label="Privacy notice">
      <Icon name="ShieldCheckIcon" size={18} className="wb-notice-icon" />
      <div>
        {!compact && <p className="mb-1 font-semibold">Privacy notice</p>}
        <p className={compact ? 'text-muted-foreground' : ''}>{PRIVACY_NOTICE}</p>
      </div>
    </aside>
  );
}
