'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import CopilotChat, { type CopilotPrompt } from '@/modules/common/copilot/CopilotChat';
import { useLmsCopilotValue, type CopilotScope } from '../context/LmsCopilotContext';
import { lmsService } from '../services/lmsService';

const SCOPE_LABEL: Record<CopilotScope, string> = {
  home: 'the platform',
  class: 'this class',
  subject: 'this subject',
  project: 'this project',
  module: 'this module',
  lesson: 'this lesson',
};

const PROMPTS: Record<CopilotScope, CopilotPrompt[]> = {
  home: [
    { icon: 'MapIcon', text: 'Where should I start learning?' },
    { icon: 'ScaleIcon', text: 'How do these classes relate to each other?' },
    { icon: 'ClockIcon', text: 'What can I learn in a weekend?' },
    { icon: 'AcademicCapIcon', text: 'Suggest a study plan for me' },
  ],
  class: [
    { icon: 'MapIcon', text: 'Give me a learning path through this class' },
    { icon: 'ListBulletIcon', text: 'Summarize what this class covers' },
    { icon: 'ForwardIcon', text: 'Which subject should I start with?' },
    { icon: 'PuzzlePieceIcon', text: 'What prerequisites do I need?' },
  ],
  subject: [
    { icon: 'ListBulletIcon', text: 'Summarize this subject in a few points' },
    { icon: 'MapIcon', text: 'In what order should I read the lessons?' },
    { icon: 'QuestionMarkCircleIcon', text: 'Quiz me on the key ideas' },
    { icon: 'LightBulbIcon', text: 'What are common mistakes here?' },
  ],
  project: [
    { icon: 'MapIcon', text: 'Walk me through the module plan' },
    { icon: 'ForwardIcon', text: 'What should I build first?' },
    { icon: 'ExclamationTriangleIcon', text: 'What are the riskiest parts?' },
    { icon: 'CheckCircleIcon', text: 'How will I know the project is done?' },
  ],
  module: [
    { icon: 'ListBulletIcon', text: 'What do I need to do in this module?' },
    { icon: 'WrenchScrewdriverIcon', text: 'Help me get unstuck on this step' },
    { icon: 'CheckCircleIcon', text: 'How do I verify this step works?' },
    { icon: 'ForwardIcon', text: 'What comes next after this?' },
  ],
  lesson: [
    { icon: 'ListBulletIcon', text: 'Summarize this lesson' },
    { icon: 'LightBulbIcon', text: 'Explain the key idea simply' },
    { icon: 'QuestionMarkCircleIcon', text: 'Quiz me on this lesson' },
    { icon: 'CodeBracketIcon', text: 'Give me a practical example' },
  ],
};

/**
 * Floating Copilot for the AI LMS. Same chat component as the To-Do copilot; the open page's
 * context (class / subject / project / module / lesson) comes from LmsCopilotContext. Login-required
 * like every AI feature, so it is hidden for guests.
 */
export default function LmsCopilot() {
  const { user } = useAuth();
  const { context } = useLmsCopilotValue();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user || !context) return null;
  const label = SCOPE_LABEL[context.scope];

  return (
    <>
      {open && (
        <aside
          aria-label="AI LMS Copilot"
          className="todo-popover fixed bottom-0 right-0 top-[60px] z-[120] flex w-[400px] max-w-full flex-col rounded-none border-y-0 border-r-0 animate-slide-up"
        >
          {/* key: a new open item starts a fresh, correctly scoped conversation */}
          <CopilotChat
            key={context.key}
            title="Learning Copilot"
            subtitle={`Answering about ${label}: ${context.title}`}
            welcome={`I can see ${label} you have open — **${context.title}**. Ask me anything about it, or tap a prompt below.`}
            placeholder={`Ask about ${label}...`}
            prompts={PROMPTS[context.scope]}
            onCollapse={() => setOpen(false)}
            onAsk={(question, history) =>
              lmsService.askCopilot({
                question,
                scope: context.scope,
                contextTitle: context.title,
                breadcrumb: context.breadcrumb,
                contextText: context.text,
                history: history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
              })
            }
          />
        </aside>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open Learning Copilot for ${label}`}
          className="lms-admin-pill !bottom-[4.5rem] !pl-2 !pr-4 animate-fade-in"
        >
          <span className="copilot-icon !h-7 !w-7">
            <Icon name="SparklesIcon" size={14} variant="solid" />
          </span>
          <span>Ask Copilot</span>
        </button>
      )}
    </>
  );
}
