import { LmsViewModeProvider } from '@/modules/ai-lms/context/LmsViewModeContext';
import { LmsCopilotProvider } from '@/modules/ai-lms/context/LmsCopilotContext';
import ViewModeToggle from '@/modules/ai-lms/components/ViewModeToggle';
import LmsCopilot from '@/modules/ai-lms/components/LmsCopilot';

/**
 * `lms-touch` scopes the AI LMS's phone rules in tailwind.css: the 40px tap minimum on touch screens, 12px minimum text
 * on phones, and the bottom-right dock that Ask Copilot, the view-mode switch and Voice AI stack in (so they never
 * overlap each other or the tab bar, and the page keeps its last content clear of them).
 */
export default function AiLmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <LmsViewModeProvider>
      <LmsCopilotProvider>
        <div className="lms-touch">
          {children}
          <LmsCopilot />
          <ViewModeToggle />
        </div>
      </LmsCopilotProvider>
    </LmsViewModeProvider>
  );
}
