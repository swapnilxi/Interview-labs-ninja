/**
 * fe-apis/dailySession/labGenerate.ts
 *
 * Twin of the labs' "Generate Practice" routes in backend/modules/daily_session/daily_session.py (the panel is
 * src/modules/labs/common/GenerateQuestionsPanel.tsx, used by the CV, DSA and System Design labs and the topic labs):
 *   POST /lab/generate-questions      generate_lab_questions     (5 interview questions about a topic/subtopic)
 *   POST /lab/generate-from-youtube   generate_lab_from_youtube  (a practice subtopic + mini-lab from a video)
 * Prompts, the lab -> domain map and the error texts are copied verbatim: change both sides together. One difference:
 * the video route needs a pasted transcript here (no automatic caption download, see youtube.ts).
 */

import { HttpError, aiSettings, callAi, extractJsonArray, type Row } from '../todo/_shared';
import { NO_AUTO_CAPTIONS, extractVideoId, fetchVideoMetadata } from './youtube';

// Lab key (as the lab pages send it) -> the domain named in the prompts below. Python: _LAB_DOMAINS.
const LAB_DOMAINS: Record<string, string> = {
  cv: 'Computer Vision',
  dsa: 'Data Structures & Algorithms',
  'system-design': 'System Design',
  communication: 'Business Communication & Leadership',
  finance: 'Finance & AI in Finance',
  python: 'Python',
};

// (interviewer, question types) for labs whose questions are not technical-interview questions. Python: _QUESTION_STYLES.
const QUESTION_STYLES: Record<string, [string, string[]]> = {
  communication: [
    'senior hiring manager',
    ['conceptual', 'scenario', 'behavioral', 'role-play', 'practical'],
  ],
  finance: [
    'senior finance interviewer',
    ['conceptual', 'calculation', 'practical', 'ai application'],
  ],
};
const DEFAULT_QUESTION_STYLE: [string, string[]] = [
  'senior technical interviewer',
  ['conceptual', 'implementation', 'system design', 'debugging', 'practical'],
];

const MAX_TRANSCRIPT_CHARS = 12000;

const AI_FAILED =
  'No API key configured or all providers failed. Add a key in Config. Last error: ';

/** Python slices strings by code point; JS `slice` counts UTF-16 units, which splits an emoji. */
function pySlice(text: string, n: number): string {
  return Array.from(text).slice(0, n).join('');
}

function requiredStr(body: Row, field: string): string {
  const v = body[field];
  if (typeof v !== 'string')
    throw new HttpError(422, `Field '${field}' is required and must be a string`);
  return v;
}

function optionalStr(body: Row, field: string): string | null {
  const v = body[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new HttpError(422, `Field '${field}' must be a string`);
  return v;
}

function readBody(raw: unknown): Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new HttpError(422, 'Body must be a JSON object');
  return raw as Row;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `extract_json_object` from modules/common/ai/utils.py: fences stripped, first `{` to last `}`. Unlike the shared
 * TS helper it keeps backticks inside the object, which the mini-lab markdown needs for inline code. */
function extractJsonObjectStrict(text: string): Row {
  const t = text
    .trim()
    .replace(/```[a-z]*\n?/g, '')
    .replace(/^`+|`+$/g, '')
    .trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(t.slice(start, end + 1));
}

// ── POST /lab/generate-questions ─────────────────────────────────────────────────────────────────────────────

function buildQuestionsPrompt(p: {
  topic: string;
  subtopic: string | null;
  lab: string;
  context: string | null;
  count: number;
}): string {
  const subject = p.subtopic || p.topic;
  const domain = LAB_DOMAINS[p.lab] ?? p.lab;
  const ctx = p.context ? `\n\nAdditional context:\n${p.context}` : '';
  const [role, types] = QUESTION_STYLES[p.lab] ?? DEFAULT_QUESTION_STYLE;
  return `You are a ${role} specializing in ${domain}.

Generate exactly ${p.count} interview questions about "${subject}" (topic: ${p.topic}).${ctx}

Requirements:
- Vary difficulty: mix Easy, Medium, Hard
- Mix question types: ${types.join(', ')}
- Each question should be specific, challenging, and interview-ready
- Do NOT number questions or add explanations

Respond with ONLY a valid JSON array (no markdown, no text outside the array):
[
  {"text": "...", "difficulty": "Easy|Medium|Hard", "sub_type": "${types.join('|')}"},
  {"text": "...", "difficulty": "Medium", "sub_type": "${types[1]}"}
]`;
}

export async function generateLabQuestions(raw: unknown): Promise<Row> {
  const body = readBody(raw);
  const countRaw = body.count === undefined || body.count === null ? 5 : Number(body.count);
  if (!Number.isInteger(countRaw)) throw new HttpError(422, "Field 'count' must be an integer");
  const payload = {
    topic: requiredStr(body, 'topic'),
    subtopic: optionalStr(body, 'subtopic'),
    lab: optionalStr(body, 'lab') ?? 'general',
    context: optionalStr(body, 'context'),
    count: countRaw,
  };
  let questions: unknown[];
  try {
    const text = await callAi(buildQuestionsPrompt(payload), aiSettings(body));
    questions = extractJsonArray(text);
  } catch (err) {
    throw new HttpError(400, AI_FAILED + errorText(err));
  }
  // Python's questions[:count]: a negative count counts from the end, like a list slice.
  const n = payload.count;
  return {
    questions:
      n >= 0 ? questions.slice(0, n) : questions.slice(0, Math.max(0, questions.length + n)),
  };
}

// ── POST /lab/generate-from-youtube ──────────────────────────────────────────────────────────────────────────

function buildYoutubePrompt(
  p: { topic: string; lab: string; context: string | null },
  transcript: string,
  metadata: { title: string; description: string } | null
): string {
  const domain = LAB_DOMAINS[p.lab] ?? p.lab;
  const metaBlock = metadata
    ? `\nVideo title: ${metadata.title}\nVideo description (partial): ${pySlice(metadata.description, 1000)}\n`
    : '';
  const ctx = p.context ? `\n\nAdditional context from the learner:\n${p.context}` : '';
  const trimmed = pySlice(transcript, MAX_TRANSCRIPT_CHARS);
  return `You are a senior ${domain} instructor turning a YouTube video into a hands-on practice subtopic.

Parent topic: ${p.topic}
${metaBlock}${ctx}

Video transcript (may be auto-generated captions with minor errors):
"""
${trimmed}
"""

Using ONLY the material above, produce a new practice subtopic. Respond with ONLY a valid JSON object
(no markdown fences, no text outside the object) of this exact shape:
{
  "subtopic": {"name": "short subtopic title, max 8 words", "brief": "one sentence description"},
  "content_markdown": "a markdown mini-lab: a short theory recap grounded in the video, then a '### Exercises' section with 2-4 short hands-on practice exercises the learner can actually do",
  "questions": [
    {"text": "...", "difficulty": "Easy|Medium|Hard", "sub_type": "conceptual|implementation|practical"}
  ]
}
Generate exactly 5 questions.`;
}

export async function generateLabFromYoutube(raw: unknown): Promise<Row> {
  const body = readBody(raw);
  const payload = {
    youtubeUrl: requiredStr(body, 'youtube_url'),
    topic: requiredStr(body, 'topic'),
    lab: optionalStr(body, 'lab') ?? 'general',
    context: optionalStr(body, 'context'),
    manualTranscript: optionalStr(body, 'manual_transcript'),
    youtubeApiKey: optionalStr(body, 'youtube_api_key'),
  };

  const videoId = extractVideoId(payload.youtubeUrl);
  if (!videoId) throw new HttpError(400, 'Could not parse a YouTube video ID from that URL.');

  let metadata: { title: string; description: string } | null = null;
  if (payload.youtubeApiKey) {
    try {
      metadata = await fetchVideoMetadata(videoId, payload.youtubeApiKey);
    } catch {
      metadata = null; // metadata is supplementary only — never block generation on it
    }
  }

  // FastAPI downloads the captions here; this twin does not (see youtube.ts), so it answers exactly as FastAPI does
  // when that download fails, and the panel shows its "paste the transcript" box.
  const transcript = (payload.manualTranscript ?? '').trim();
  if (!transcript) {
    throw new HttpError(
      422,
      `Couldn't fetch captions for this video (${NO_AUTO_CAPTIONS}). Paste the transcript manually and try again.`
    );
  }

  let responseText: string;
  try {
    responseText = await callAi(
      buildYoutubePrompt(payload, transcript, metadata),
      aiSettings(body)
    );
  } catch (err) {
    throw new HttpError(400, AI_FAILED + errorText(err));
  }

  let result: Row;
  try {
    result = extractJsonObjectStrict(responseText);
    if (!('subtopic' in result)) throw new Error("'subtopic'");
    const subtopic = result.subtopic;
    if (!subtopic || typeof subtopic !== 'object' || Array.isArray(subtopic) || !subtopic.name) {
      throw new Error("'subtopic' is missing a 'name'");
    }
    if (typeof result.content_markdown !== 'string')
      throw new Error("'content_markdown' is missing or not a string");
    if (!Array.isArray(result.questions ?? [])) throw new Error("'questions' is not a list");
  } catch (err) {
    throw new HttpError(
      502,
      `The AI response was malformed and couldn't be parsed. Try again. (${errorText(err)})`
    );
  }
  return result;
}
