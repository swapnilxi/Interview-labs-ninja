'use client';

import Icon from '@/components/ui/AppIcon';
import CopilotChat, { type CopilotPrompt } from '@/modules/common/copilot/CopilotChat';
import { todoService } from '@/lib/services/todoService';
import { onTopTaskCompleted } from '@/lib/services/paretoService';
import ParetoSidebar from '../pareto/ParetoSidebar';

interface TodoCopilotProps {
  model: 'ollama' | 'gemini';
  onModelChange: (model: 'ollama' | 'gemini') => void;
  onCollapse?: () => void;
  /** What the collapse button is called: "Collapse" for the side column, "Close" when it is a drawer. */
  collapseLabel?: string;
}

// `text` is what is sent (unchanged); `label` is the short form shown in the compact suggestion rows.
const QUICK_PROMPTS: CopilotPrompt[] = [
  { icon: 'StarIcon', label: 'Highest-leverage task', text: 'What is my highest leverage task right now?' },
  { icon: 'ClockIcon', label: 'Plan my next hour', text: 'If I only had 1 hour, what should I do?' },
  { icon: 'ArrowTrendingDownIcon', label: 'Low-impact tasks', text: 'What tasks am I doing that have low impact?' },
  { icon: 'MagnifyingGlassIcon', label: 'Best project return', text: 'Which of my projects will give the biggest return?' },
  { icon: 'BoltIcon', label: 'Spend 30 minutes', text: 'I have 30 mins, what can I do?' },
  { icon: 'CalendarDaysIcon', label: 'Weekend priorities', text: 'What should I focus on this weekend?' },
];

// Proactive nudge whenever a Top 20% task is completed anywhere in the app.
const subscribeTopTask = (push: (content: string) => void) =>
  onTopTaskCompleted((title) =>
    push(`You just completed a high-leverage task: **${title}**. Great work! Want me to identify your next top 20% task?`)
  );

export default function TodoCopilot({ model, onModelChange, onCollapse, collapseLabel }: TodoCopilotProps) {
  const modelButton = (value: 'ollama' | 'gemini', label: string, icon: string, hint: string) => (
    <button
      type="button"
      onClick={() => onModelChange(value)}
      aria-pressed={model === value}
      title={hint}
      className="todo-segment flex-1 justify-center"
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );

  return (
    <CopilotChat
      variant="quiet"
      title="Task Copilot"
      subtitle="AI-powered productivity assistant"
      welcome="I can see your tasks, priorities and deadlines. Ask what to do next."
      placeholder="Ask about your tasks..."
      prompts={QUICK_PROMPTS}
      collapseLabel={collapseLabel}
      onAsk={(question) => todoService.askCopilot(question, model)}
      onCollapse={onCollapse}
      subscribe={subscribeTopTask}
      headerExtra={
        <div className="todo-segmented todo-segmented-quiet todo-segmented-accent flex w-full" role="group" aria-label="Where the answers are generated">
          {modelButton('ollama', 'Local', 'ComputerDesktopIcon', 'Runs on a model on your own machine (Ollama)')}
          {modelButton('gemini', 'Online', 'CloudIcon', 'Uses the online model set in Config')}
        </div>
      }
      topSlot={<ParetoSidebar model={model} />}
    />
  );
}
