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
}

const QUICK_PROMPTS: CopilotPrompt[] = [
  { icon: 'StarIcon', text: 'What is my highest leverage task right now?' },
  { icon: 'ArrowTrendingDownIcon', text: 'What tasks am I doing that have low impact?' },
  { icon: 'ClockIcon', text: 'If I only had 1 hour, what should I do?' },
  { icon: 'MagnifyingGlassIcon', text: 'Which of my projects will give the biggest return?' },
  { icon: 'BoltIcon', text: 'I have 30 mins, what can I do?' },
  { icon: 'CalendarDaysIcon', text: 'What should I focus on this weekend?' },
];

// Proactive nudge whenever a Top 20% task is completed anywhere in the app.
const subscribeTopTask = (push: (content: string) => void) =>
  onTopTaskCompleted((title) =>
    push(`You just completed a high-leverage task: **${title}**. Great work! Want me to identify your next top 20% task?`)
  );

export default function TodoCopilot({ model, onModelChange, onCollapse }: TodoCopilotProps) {
  const modelButton = (value: 'ollama' | 'gemini', label: string, icon: string) => (
    <button
      type="button"
      onClick={() => onModelChange(value)}
      aria-pressed={model === value}
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
      welcome="I'm your productivity copilot. I can see all your tasks, priorities, and deadlines. Ask me anything about your workload, or tap a quick prompt below!"
      placeholder="Ask about your tasks..."
      prompts={QUICK_PROMPTS}
      onAsk={(question) => todoService.askCopilot(question, model)}
      onCollapse={onCollapse}
      subscribe={subscribeTopTask}
      headerExtra={
        <div className="todo-segmented todo-segmented-quiet flex w-full">
          {modelButton('ollama', 'Local', 'ComputerDesktopIcon')}
          {modelButton('gemini', 'Online', 'CloudIcon')}
        </div>
      }
      topSlot={<ParetoSidebar model={model} />}
    />
  );
}
