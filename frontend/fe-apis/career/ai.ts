/**
 * fe-apis/career/ai.ts
 *
 * TypeScript twin of backend/modules/career_studio/shared/{llm,prompt_builder,job_text}.py
 * and the AI parts of analysis/router.py, views/router.py and cover_letter/router.py.
 *
 * The Python twin has long, heavily-tuned prompts. These are deliberately compact but
 * ask for the same JSON shapes, so the frontend types in shared/types.ts keep working
 * and every AI feature stays usable in nextjs-api mode.
 */

import { callAIText, type AISettingsPayload } from '../ai';
import { extractJsonObjectLenient } from '../ai/utils';
import { HttpError, type Row } from './db';

const AI_TIMEOUT_MS = 5 * 60 * 1000;

export type Settings = AISettingsPayload;

async function ask(prompt: string, settings: Settings, maxTokens = 4096): Promise<string> {
  try {
    return await callAIText(prompt, settings, AI_TIMEOUT_MS, maxTokens);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'AI request failed');
  }
}

async function askJson(prompt: string, settings: Settings, maxTokens = 4096): Promise<Row> {
  const text = await ask(`${prompt}\n\nReply with a single JSON object and nothing else.`, settings, maxTokens);
  const parsed = extractJsonObjectLenient(text);
  if (!parsed) throw new HttpError(400, 'The AI returned an unreadable response. Please try again.');
  return parsed;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

/** Compact, readable representation of a profile/resume for a prompt. */
export function profileToText(profile: Row): string {
  const lines = [`Title: ${profile.title || ''}`];
  if (profile.primary_role) lines.push(`Target role: ${profile.primary_role}`);
  if (profile.description) lines.push(`About: ${profile.description}`);
  for (const s of (profile.sections || []) as Row[]) {
    if (s.is_hidden) continue;
    lines.push(`\n## ${s.title || s.section_type} (${s.section_type})\n${stringify(s.content)}`);
  }
  return lines.join('\n');
}

export function portfolioToText(portfolio: Row): string {
  const lines = [`Title: ${portfolio.title || ''}`];
  for (const w of (portfolio.widgets || []) as Row[]) {
    if (w.is_hidden) continue;
    lines.push(`\n## ${w.title || w.widget_type} (${w.widget_type})\n${stringify(w.content)}`);
  }
  return lines.join('\n');
}

function normalizeGap(value: unknown): Row {
  const v = value && typeof value === 'object' ? (value as Row) : {};
  const list = (x: unknown): Row[] => Array.isArray(x) ? x.filter((i) => i && typeof i === 'object') : [];
  return {
    overall_fit: v.overall_fit ?? v.score ?? null,
    summary: typeof v.summary === 'string' ? v.summary : '',
    strengths: list(v.strengths),
    gaps: list(v.gaps),
    recommendations: list(v.recommendations),
    matched_skills: Array.isArray(v.matched_skills) ? v.matched_skills : [],
    missing_skills: Array.isArray(v.missing_skills) ? v.missing_skills : [],
  };
}

// ── Resume / portfolio analyzers ───────────────────────────────────────────────

export async function analyzeResume(profile: Row, jobDescription: string | undefined, settings: Settings): Promise<Row> {
  return askJson(
    `You are an expert technical recruiter and resume reviewer. Analyze this resume against the job description.
Return JSON with numeric 0-100 scores: overall_score, ats_score, grammar_score, readability_score,
achievement_score, impact_score, action_verb_score, formatting_score, technical_skills_score,
soft_skills_score, leadership_score; keyword_match {matched:[], missing:[]}; arrays of
missing_skills, missing_sections, weak_bullets, passive_voice_instances, repetitive_words, cliches,
red_flags and top_suggestions (each item {text, suggestion} or {title, severity, explanation,
suggested_rewrite, section_id, content}); resume_length and summary.

RESUME:\n${profileToText(profile)}\n\nJOB DESCRIPTION:\n${jobDescription || '(none provided)'}`,
    settings,
    6144,
  );
}

export async function analyzeSections(profile: Row, jobDescription: string | undefined, jobTitle: string | undefined, settings: Settings): Promise<Row> {
  const visible = (profile.sections || []).filter((s: Row) => !s.is_hidden && s.section_type !== 'personal_info');
  const report = await askJson(
    `Review each resume section below. Return JSON: {"overall_score": 0-100, "overall_summary": string,
"sections": [{"section_id": "...", "good": [string], "improve": [string], "suggested_rewrite": string}]}.
Use ONLY the section ids given. Target role: ${jobTitle || 'not specified'}.
Job description: ${jobDescription || '(none)'}

SECTIONS:\n${visible.map((s: Row) => `id=${s.id} type=${s.section_type} title=${s.title || ''}\n${stringify(s.content)}`).join('\n\n')}`,
    settings,
    6144,
  );
  const byId = new Map<string, Row>((profile.sections || []).map((s: Row) => [s.id, s]));
  const sections = (Array.isArray(report.sections) ? report.sections : []).map((item: Row) => {
    const src = byId.get(item.section_id);
    if (!src) return null;
    return {
      section_id: src.id, section_type: src.section_type, title: src.title,
      good: Array.isArray(item.good) ? item.good : [],
      improve: Array.isArray(item.improve) ? item.improve : [],
      suggested_rewrite: item.suggested_rewrite ?? null,
    };
  }).filter(Boolean);
  return {
    overall_score: report.overall_score ?? null,
    overall_summary: report.overall_summary || '',
    sections,
  };
}

export async function analyzePortfolio(portfolio: Row, settings: Settings): Promise<Row> {
  return askJson(
    `You are a personal-brand and portfolio reviewer. Analyze this portfolio and return JSON with
overall_score (0-100), summary, strengths: [string], improvements: [string], and
sections: [{"widget_id", "good": [string], "improve": [string], "suggested_rewrite": string}].

PORTFOLIO:\n${portfolioToText(portfolio)}`,
    settings,
    6144,
  );
}

/** Streamed in Python; here the whole reply is returned as a plain text body. */
export async function rewriteSection(section: Row, instruction: string | undefined, jobDescription: string | undefined, settings: Settings): Promise<string> {
  return ask(
    `Rewrite the following resume section. Return ONLY the rewritten content as JSON matching the
original content's shape (e.g. {"text": "..."} or {"items": [...]}). Do not add commentary.
Instruction: ${instruction || 'Improve clarity, impact and action verbs.'}
Job description: ${jobDescription || '(none)'}

SECTION (${section.section_type}):\n${stringify(section.content)}`,
    settings,
    4096,
  );
}

export async function copilotAsk(question: string, profile: Row | undefined, settings: Settings): Promise<Row> {
  const answer = await ask(
    `You are the Career Studio copilot, a concise career coach. Answer the user's question using
their profile when relevant. Be practical and specific. Reply in plain text.

${profile ? `PROFILE:\n${profileToText(profile)}` : 'No profile selected.'}

QUESTION: ${question}`,
    settings,
    2048,
  );
  return { answer };
}

// ── Job extraction / matching / tailoring / generation ─────────────────────────

export async function extractJob(text: string, settings: Settings): Promise<Row> {
  return askJson(
    `Extract a structured job profile from the job description below. Return JSON with keys:
title, company, location, employment_type, experience_level, education, salary,
required_skills [string], preferred_skills [string], responsibilities [string], benefits [string],
certifications [string], extraction_confidence (0-100). Use empty strings/arrays when unknown.

JOB DESCRIPTION:\n${text.slice(0, 30000)}`,
    settings,
    4096,
  );
}

export async function matchJob(profile: Row, jobText: string, targetRole: string | undefined, targetCompany: string | undefined, settings: Settings): Promise<Row> {
  const report = await askJson(
    `Compare this profile with the job description and return JSON {"gap_analysis": {...}} where
gap_analysis has overall_fit (0-100), summary, strengths [{title, detail}], gaps [{title, detail}],
recommendations [{title, detail}], matched_skills [string], missing_skills [string].
Target role: ${targetRole || 'not specified'}. Target company: ${targetCompany || 'not specified'}.

PROFILE:\n${profileToText(profile)}\n\nJOB:\n${jobText.slice(0, 30000)}`,
    settings,
    6144,
  );
  return { gap_analysis: normalizeGap(report.gap_analysis ?? report) };
}

export async function tailorResume(profile: Row, jobText: string, notes: string | undefined, settings: Settings): Promise<Row> {
  const report = await askJson(
    `Tailor this profile to the job. Return JSON with:
"updates": [{"section_id": "<existing id>", "title": string|null, "content": <same shape as original>}],
"new_sections": [{"section_type": one of certifications,awards,achievements,research,languages,volunteer,publications,interests,custom, "title": string, "content": object}],
"summary": string, "keywords_added": [string], "gap_analysis": object.
Only include sections you actually improve. Preserve the original content shape.
Notes: ${notes || '(none)'}

PROFILE:\n${profileToText(profile)}\n\nJOB:\n${jobText.slice(0, 30000)}`,
    settings,
    8192,
  );
  return {
    updates: Array.isArray(report.updates) ? report.updates : [],
    new_sections: Array.isArray(report.new_sections) ? report.new_sections : [],
    summary: report.summary || '',
    keywords_added: Array.isArray(report.keywords_added) ? report.keywords_added : [],
    gap_analysis: normalizeGap(report.gap_analysis),
  };
}

export async function generateResume(profile: Row, jobText: string, notes: string | undefined, targetRole: string | undefined, targetCompany: string | undefined, settings: Settings): Promise<Row> {
  const report = await askJson(
    `Generate a job-tailored resume from this profile. Return JSON with:
"updates": [{"section_id", "title", "content"}], "new_sections": [{"section_type", "title", "content"}],
"summary": string, "keywords_added": [string], "gap_analysis": object.
Target role: ${targetRole || 'not specified'}. Company: ${targetCompany || 'not specified'}.
Notes: ${notes || '(none)'}

PROFILE:\n${profileToText(profile)}\n\nJOB:\n${jobText.slice(0, 30000)}`,
    settings,
    8192,
  );
  return {
    updates: Array.isArray(report.updates) ? report.updates : [],
    new_sections: Array.isArray(report.new_sections) ? report.new_sections : [],
    summary: report.summary || '',
    keywords_added: Array.isArray(report.keywords_added) ? report.keywords_added : [],
    gap_analysis: normalizeGap(report.gap_analysis),
  };
}

// ── Profile import / enrichment ────────────────────────────────────────────────

export async function structureImport(rawText: string, settings: Settings): Promise<Row> {
  return askJson(
    `Parse the following resume/CV text into structured profile sections. Return JSON:
{"sections": [{"section_type": one of personal_info,summary,experience,projects,education,skills,
certifications,awards,publications,languages,interests,custom; "title": string; "content": object;
"is_hidden": false}], "mapping_notes": [string]}.
Use {"text": "..."} for summary-like sections, {"items": [...]} for lists, {"groups": [...]} for skills,
and {name,title,email,phone,location,links} for personal_info.

TEXT:\n${rawText.slice(0, 40000)}`,
    settings,
    8192,
  );
}

export async function enrichPreview(profile: Row, rawText: string, kind: string, settings: Settings): Promise<Row> {
  return askJson(
    `The user is enriching an existing profile with a new document of kind "${kind}". Identify what
should be added or merged. Return JSON:
{"proposals": [{"section_id": existing id|null, "section_type": string, "title": string,
"content": object, "action": "append"|"replace"|"new", "reason": string}], "summary": string}.
Do not propose duplicates of content already present.

CURRENT PROFILE:\n${profileToText(profile)}\n\nNEW DOCUMENT:\n${rawText.slice(0, 30000)}`,
    settings,
    8192,
  );
}

// ── Cover letters ──────────────────────────────────────────────────────────────

export async function generateCoverLetter(profile: Row, jobText: string, tone: string, settings: Settings): Promise<string> {
  return ask(
    `Write a ${tone || 'professional'} cover letter for this profile and job. Return only the letter text,
with no commentary and no markdown fences.

PROFILE:\n${profileToText(profile)}\n\nJOB:\n${jobText.slice(0, 20000)}`,
    settings,
    4096,
  );
}
