import type { LmsClass, LmsLesson, LmsProjectPlanItem, LmsSubject } from '../types';
import type { LmsCopilotPageContext } from '../context/LmsCopilotContext';

const MAX_TEXT = 6000;

/** Readable text from lesson HTML: drops script/style, tags and entities, collapses whitespace. */
export function htmlToPlainText(html: string | undefined, max = MAX_TEXT): string {
  if (!html) return '';
  return html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e] ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, max);
}

const clip = (s: string | undefined, n: number) => (s ?? '').trim().slice(0, n);

function planOutline(plan: LmsProjectPlanItem[] | undefined): string {
  if (!plan?.length) return '(no modules planned yet)';
  return plan
    .map((m, i) => {
      const subs = (m.sublessons ?? []).map((s, j) => `    ${i + 1}.${j + 1} ${s.title} - ${clip(s.focus, 120)}`).join('\n');
      return `  ${i + 1}. ${m.title} - ${clip(m.focus, 160)}${subs ? '\n' + subs : ''}`;
    })
    .join('\n');
}

export function homeCopilotContext(classes: LmsClass[]): LmsCopilotPageContext {
  const text = classes
    .map((c) => `- ${c.name} (${c.subject_count} subjects, ${c.lesson_count} lessons): ${clip(c.description, 160)}`)
    .join('\n');
  return { key: 'home', scope: 'home', title: 'AI Learning Platform', breadcrumb: 'Home', text: text.slice(0, MAX_TEXT) };
}

export function classCopilotContext(cls: LmsClass): LmsCopilotPageContext {
  const subjects = (cls.subjects ?? [])
    .map((s) => `- ${s.kind === 'project' ? '[Project] ' : ''}${s.name} (${s.lesson_count} lessons): ${clip(s.description, 160)}`)
    .join('\n');
  const direct = (cls.direct_lessons ?? []).map((l) => `- ${l.title}: ${clip(l.summary, 140)}`).join('\n');
  const text = [
    `Class: ${cls.name}`,
    cls.description && `Description: ${clip(cls.description, 500)}`,
    cls.ai_context && `Teaching focus: ${clip(cls.ai_context, 600)}`,
    subjects && `Subjects & projects:\n${subjects}`,
    direct && `Lessons directly in this class:\n${direct}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { key: `class:${cls.id}`, scope: 'class', title: cls.name, breadcrumb: cls.name, text: text.slice(0, MAX_TEXT) };
}

export function subjectCopilotContext(subject: LmsSubject, cls: LmsClass | null, lessons: LmsLesson[]): LmsCopilotPageContext {
  const crumb = [cls?.name, subject.name].filter(Boolean).join(' > ');
  if (subject.kind === 'project') {
    const text = [
      `Project: ${subject.name}`,
      subject.description && `Description: ${clip(subject.description, 500)}`,
      `README / project context:\n${clip(subject.context_summary || subject.project_context, 2500)}`,
      `Planned modules:\n${planOutline(subject.project_plan)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    return { key: `project:${subject.id}`, scope: 'project', title: subject.name, breadcrumb: crumb, text: text.slice(0, MAX_TEXT) };
  }
  const list = lessons.map((l, i) => `${i + 1}. ${l.title}: ${clip(l.summary, 140)}`).join('\n');
  const text = [
    `Subject: ${subject.name}`,
    subject.description && `Description: ${clip(subject.description, 500)}`,
    subject.ai_context && `Teaching focus: ${clip(subject.context_summary || subject.ai_context, 800)}`,
    list && `Lessons:\n${list}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { key: `subject:${subject.id}`, scope: 'subject', title: subject.name, breadcrumb: crumb, text: text.slice(0, MAX_TEXT) };
}

function findPlanItem(plan: LmsProjectPlanItem[] | undefined, lessonId: string): { item: LmsProjectPlanItem; label: string } | null {
  for (const [i, m] of (plan ?? []).entries()) {
    if (m.lesson_id === lessonId) return { item: m, label: `Module ${i + 1}` };
    for (const [j, s] of (m.sublessons ?? []).entries()) {
      if (s.lesson_id === lessonId) return { item: s, label: `Step ${i + 1}.${j + 1} (${m.title})` };
    }
  }
  return null;
}

/** A lesson, or - when it belongs to a project - that project module/step with its plan notes. */
export function lessonCopilotContext(lesson: LmsLesson, subject: LmsSubject | null, cls: LmsClass | null): LmsCopilotPageContext {
  const body = htmlToPlainText(lesson.generated_html, 4500);
  const planHit = subject?.kind === 'project' ? findPlanItem(subject.project_plan, lesson.id) : null;
  const crumb = [cls?.name, subject?.name, planHit?.label, lesson.title].filter(Boolean).join(' > ');
  const text = [
    planHit && `Project: ${subject?.name}\n${planHit.label}: ${planHit.item.title}\nFocus: ${clip(planHit.item.focus, 300)}${planHit.item.context ? `\nNotes: ${clip(planHit.item.context, 600)}` : ''}`,
    lesson.summary && `Summary: ${clip(lesson.summary, 300)}`,
    `Lesson content:\n${body || '(no content yet)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    key: `${planHit ? 'module' : 'lesson'}:${lesson.id}`,
    scope: planHit ? 'module' : 'lesson',
    title: planHit ? planHit.item.title : lesson.title,
    breadcrumb: crumb,
    text: text.slice(0, MAX_TEXT),
  };
}
