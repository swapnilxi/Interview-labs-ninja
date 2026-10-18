import type { PlannerState } from '@/lib/services/projectPlannerService';
import { formatRange, formatSpan, daysBetween } from './plannerDates';

/** The plan as a Markdown document, ready to paste into a doc, an email or a ticket. */
export function planToMarkdown(projectTitle: string, state: PlannerState): string {
  const plan = state.plan;
  if (!plan) return '';
  const lines: string[] = [`# ${projectTitle} — project plan`, ''];

  const window = state.plan_for ?? { start_date: state.start_date, end_date: state.end_date };
  if (window.start_date && window.end_date) {
    lines.push(`**Timeline:** ${formatRange(window.start_date, window.end_date)} (${formatSpan(daysBetween(window.start_date, window.end_date))})`, '');
  }
  if (plan.summary) lines.push(plan.summary, '');

  const list = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`**${title}**`, ...items.map((item) => `- ${item}`), '');
  };

  plan.phases.forEach((phase, index) => {
    lines.push(`## ${phase.name || `Phase ${index + 1}`}`, '');
    lines.push(`_${formatRange(phase.start_date, phase.end_date)}${phase.duration ? ` · ${phase.duration}` : ''}_`, '');
    if (phase.description) lines.push(phase.description, '');
    list('Objectives', phase.objectives);
    if (phase.key_tasks.length) lines.push('**Key tasks**', ...phase.key_tasks.map((task) => `- [ ] ${task}`), '');
    list('Deliverables', phase.deliverables);
    if (phase.milestone) lines.push(`**Milestone:** ${phase.milestone}`, '');
    list('Risks', phase.risks);
  });

  if (plan.assumptions.length) {
    lines.push('## Assumptions', '', ...plan.assumptions.map((a) => `- ${a}`), '');
  }
  if (plan.risks.length) {
    lines.push('## Risks and mitigations', '', ...plan.risks.map((r) => `- **${r.risk}**${r.mitigation ? ` — ${r.mitigation}` : ''}`), '');
  }
  if (plan.success_metrics.length) {
    lines.push('## Success metrics', '', ...plan.success_metrics.map((m) => `- ${m}`), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
