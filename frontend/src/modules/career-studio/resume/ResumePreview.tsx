'use client';

import { useResumeStore } from './store/resumeStore';
import { SECTION_LABELS, type Resume, type ResumeSection } from '../shared/types';

function filterCustomFields(fields: any): Array<{ label?: string; value?: string }> {
  return Array.isArray(fields) ? fields.filter((f: any) => f?.label || f?.value) : [];
}

function ContactLine({ c }: { c: any }) {
  const bits = [c?.email, c?.phone, c?.location].filter(Boolean);
  const links: Array<{ label: string; url: string }> = Array.isArray(c?.links) ? c.links.filter((l: any) => l?.url || l?.label) : [];
  const customFields = filterCustomFields(c?.custom_fields);
  if (!bits.length && !links.length && !customFields.length) return null;
  return (
    <div className="mt-1 text-[12px] text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 justify-center">
      {bits.map((b, i) => (
        <span key={i}>{b}</span>
      ))}
      {links.map((l, i) => (
        <span key={`l${i}`} className="text-primary">{l.label || l.url}</span>
      ))}
      {customFields.map((f, i) => (
        <span key={`cf${i}`}>{f.label ? <><span className="font-medium">{f.label}:</span> {f.value}</> : f.value}</span>
      ))}
    </div>
  );
}

function ItemsView({ items }: { items: any[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => {
        const customFields = filterCustomFields(it.custom_fields);
        return (
          <div key={it.id || i}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-neutral-800">{it.title}{it.subtitle ? <span className="font-normal text-neutral-600"> — {it.subtitle}</span> : null}</span>
              {it.date ? <span className="text-[11px] text-neutral-500 flex-shrink-0">{it.date}</span> : null}
            </div>
            {(Array.isArray(it.bullets) && it.bullets.filter(Boolean).length > 0) || customFields.length > 0 ? (
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                {Array.isArray(it.bullets) && it.bullets.filter(Boolean).map((b: string, j: number) => (
                  <li key={`b${j}`} className="text-[12.5px] text-neutral-700 leading-snug">{b.replace(/^[-•]\s*/, '')}</li>
                ))}
                {customFields.map((f, j) => (
                  <li key={`cf${j}`} className="text-[12.5px] text-neutral-700 leading-snug">
                    {f.label ? <span className="font-medium">{f.label}: </span> : null}{f.value}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionView({ section }: { section: ResumeSection }) {
  const c = section.content || {};
  const heading = section.title || SECTION_LABELS[section.section_type] || 'Section';
  const hasItems = Array.isArray(c.items) && c.items.length > 0;
  const hasGroups = Array.isArray(c.groups) && c.groups.length > 0;
  const hasText = !!(c.text && String(c.text).trim());
  const customFields = filterCustomFields(c.custom_fields);
  if (!hasItems && !hasGroups && !hasText && !customFields.length) return null;

  return (
    <section className="mb-4">
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2">{heading}</h2>
      {hasText && <p className="text-[12.5px] text-neutral-700 leading-snug mb-2 whitespace-pre-wrap">{c.text}</p>}
      {hasGroups && (
        <div className="space-y-1">
          {c.groups.map((g: any, i: number) => (
            <div key={i} className="text-[12.5px] text-neutral-700">
              {g.name ? <span className="font-semibold text-neutral-800">{g.name}: </span> : null}
              {(g.items || []).join(' · ')}
            </div>
          ))}
        </div>
      )}
      {hasItems && <ItemsView items={c.items} />}
      {customFields.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {customFields.map((f, i) => (
            <p key={i} className="text-[12.5px] text-neutral-700 leading-snug">
              {f.label ? <span className="font-medium">{f.label}: </span> : null}{f.value}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Renders the given resume; falls back to the profile editor's live store when
 * no `resume` prop is passed, so existing callers inside the editor are unaffected. */
export default function ResumePreview({ resume: resumeProp }: { resume?: Resume | null } = {}) {
  const storeResume = useResumeStore((s) => s.resume);
  const resume = resumeProp ?? storeResume;
  if (!resume) return null;

  const personal = resume.sections.find((s) => s.section_type === 'personal_info');
  const pc = personal?.content || {};
  const body = resume.sections.filter((s) => s.section_type !== 'personal_info' && !s.is_hidden);

  return (
    <div className="bg-white rounded-lg shadow-sm ring-1 ring-black/5 mx-auto max-w-[820px] px-10 py-8 min-h-[600px]">
      {/* Header */}
      <header className="text-center border-b border-neutral-300 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{pc.name || resume.title || 'Your Name'}</h1>
        {pc.title && <p className="text-[13px] text-neutral-600 mt-0.5">{pc.title}</p>}
        <ContactLine c={pc} />
      </header>

      {body.length === 0 ? (
        <p className="text-center text-sm text-neutral-400 py-12">Add content on the left — it appears here live.</p>
      ) : (
        body.map((s) => <SectionView key={s.id} section={s} />)
      )}
    </div>
  );
}
