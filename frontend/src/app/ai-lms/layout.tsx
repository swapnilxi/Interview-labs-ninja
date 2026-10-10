import { LmsViewModeProvider } from '@/modules/ai-lms/context/LmsViewModeContext';
import { LmsCopilotProvider } from '@/modules/ai-lms/context/LmsCopilotContext';
import ViewModeToggle from '@/modules/ai-lms/components/ViewModeToggle';
import LmsCopilot from '@/modules/ai-lms/components/LmsCopilot';

export default function AiLmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <LmsViewModeProvider>
      <LmsCopilotProvider>
        {children}
        <LmsCopilot />
        <ViewModeToggle />
      </LmsCopilotProvider>
    </LmsViewModeProvider>
  );
}
