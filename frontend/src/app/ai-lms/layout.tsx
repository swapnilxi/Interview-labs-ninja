import { LmsViewModeProvider } from '@/modules/ai-lms/context/LmsViewModeContext';
import ViewModeToggle from '@/modules/ai-lms/components/ViewModeToggle';

export default function AiLmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <LmsViewModeProvider>
      {children}
      <ViewModeToggle />
    </LmsViewModeProvider>
  );
}
