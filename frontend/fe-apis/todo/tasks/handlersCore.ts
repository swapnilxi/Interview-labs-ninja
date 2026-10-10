/**
 * fe-apis/todo/tasks/handlersCore.ts
 *
 * Port of backend/modules/ai_todo/tasks/router.py from the top of the file through
 * `GET /todo/tasks/{task_id}/resume`: task CRUD, AI breakdown, context upload, copilot
 * and notes. Keep in sync with the Python router (prompts are copied verbatim).
 */

import zlib from 'zlib';
import type { AISettingsPayload } from '../../ai';
import {
  HttpError,
  aiSettings,
  callAi,
  callAiVision,
  extractJsonArray,
  imageMimeType,
  withTodoDb,
  type Row,
} from '../_shared';
import { errMsg, pyStr } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import {
  createHandwritingExtraction,
  createNote,
  createSubtasksBatch,
  createTask,
  deleteChildren,
  deleteTask,
  getActiveTasksForCopilot,
  getChildren,
  getNote,
  getSiblingTitles,
  getTask,
  getTaskNotes,
  getTaskTree,
  getUnprocessedInboxItems,
  updateTask,
} from './db';

// ── Request validation (Pydantic models, lax mode) ──────────────────────────

type FieldKind = 'str' | 'int' | 'float' | 'bool' | 'strList';
interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
  nullable?: boolean;
}

const KIND_LABEL: Record<FieldKind, string> = {
  str: 'a valid string',
  int: 'a valid integer',
  float: 'a valid number',
  bool: 'a valid boolean',
  strList: 'a valid list of strings',
};

/** Pydantic's lax coercion; undefined = invalid. */
function coerce(value: unknown, kind: FieldKind): unknown {
  if (kind === 'str') return typeof value === 'string' ? value : undefined;
  if (kind === 'strList')
    return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined;
  if (kind === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 1) return value === 1;
    const s = typeof value === 'string' ? value.toLowerCase() : '';
    if (['true', '1', 'yes', 'on', 't', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'off', 'f', 'n'].includes(s)) return false;
    return undefined;
  }
  const n =
    typeof value === 'boolean'
      ? Number(value)
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return kind === 'int' && !Number.isInteger(n) ? undefined : n;
}

/** Validate a JSON body against a model spec: 422 like FastAPI; returns only the keys present. */
function validate(body: unknown, spec: Record<string, FieldSpec>): Row {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'Input should be a valid dictionary');
  }
  const src = body as Row;
  const out: Row = {};
  for (const [key, { kind, required, nullable }] of Object.entries(spec)) {
    if (!(key in src)) {
      if (required) throw new HttpError(422, `${key}: Field required`);
      continue;
    }
    const value = src[key] === null && nullable ? null : coerce(src[key], kind);
    if (value === undefined)
      throw new HttpError(422, `${key}: Input should be ${KIND_LABEL[kind]}`);
    out[key] = value;
  }
  return out;
}

const optStr: FieldSpec = { kind: 'str', nullable: true };

const TASK_CREATE: Record<string, FieldSpec> = {
  title: { kind: 'str', required: true },
  parent_id: { kind: 'int', nullable: true },
  status: { kind: 'str' },
  priority: { kind: 'str' },
  time_estimate: optStr,
  due_date: optStr,
  context: optStr,
  attachments: { kind: 'strList', nullable: true },
  is_recurring: { kind: 'int' },
  recurrence_interval: optStr,
  recurrence_custom_days: optStr,
  intention: optStr,
  definition_of_done: optStr,
};

const TASK_UPDATE: Record<string, FieldSpec> = {
  title: optStr,
  status: optStr,
  priority: optStr,
  time_estimate: optStr,
  due_date: optStr,
  context: optStr,
  attachments: { kind: 'strList', nullable: true },
  is_recurring: { kind: 'int', nullable: true },
  recurrence_interval: optStr,
  recurrence_custom_days: optStr,
  intention: optStr,
  definition_of_done: optStr,
  eisenhower_quadrant: optStr,
  is_top_20: { kind: 'bool', nullable: true },
  pareto_score: { kind: 'float', nullable: true },
  pareto_reason: optStr,
};

// ── Small Python-isms ───────────────────────────────────────────────────────

/** `dict.get(key, default)` — the default only applies when the key is absent. */
function pyGet(row: Row, key: string, fallback: unknown): unknown {
  return key in row ? row[key] : fallback;
}

function requireTask(taskId: number, userId: number): Row {
  const task = getTask(taskId, userId);
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

// ── AI breakdown ────────────────────────────────────────────────────────────

/** `_build_ai_prompt`: the breakdown prompt with sibling awareness and context. */
function buildAiPrompt(task: Row, breakdownType: string, userId: number): string {
  const instruction =
    breakdownType === 'dive_deeper'
      ? `Break this task into 3–5 strategic subtasks or phases: "${task.title}".`
      : `Break this task into 3–5 small, concrete, immediately actionable steps: "${task.title}".`;

  let siblingContext = '';
  if (task.parent_id) {
    const siblings = getSiblingTitles(task.parent_id, userId);
    if (siblings.length) {
      const siblingList = siblings.map((s) => `  - ${s}`).join('\n');
      siblingContext =
        `\n\nThese subtasks already exist under the parent task. ` +
        `Generate NEW subtasks that complement these without repeating them:\n${siblingList}`;
    }
  }

  let contextAddendum = '';
  if (task.context) {
    contextAddendum =
      `\n\nAdditional context about this task: ${task.context}. ` +
      'Use this to make subtasks more specific and relevant.';
  }
  if (task.intention) contextAddendum += `\nWhy this task matters: ${task.intention}`;
  if (task.definition_of_done)
    contextAddendum += `\nThis task is done when: ${task.definition_of_done}`;

  return (
    `${instruction}${siblingContext}${contextAddendum}\n\n` +
    'Return ONLY a JSON array: [{"title": "...", "time_estimate": "...", "priority": "p1|p2|p3|p4"}]. ' +
    'No extra text.'
  );
}

async function breakdown(
  taskId: number,
  userId: number,
  body: Row,
  type: string,
  failure: string
): Promise<Row[]> {
  const task = requireTask(taskId, userId);
  const prompt = buildAiPrompt(task, type, userId);
  let subtasksData: any[];
  try {
    subtasksData = extractJsonArray(await callAi(prompt, aiSettings(body)));
  } catch (err) {
    throw new HttpError(500, `${failure}: ${errMsg(err)}`);
  }
  return createSubtasksBatch(taskId, userId, subtasksData.slice(0, 5), type);
}

// ── Context upload ──────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

const HANDWRITING_PROMPT = `This is a photo or scan of handwritten notes. Please:
1. Transcribe ALL handwritten text exactly as written, preserving structure (bullet points, numbered lists, headings, underlines) where visible
2. Fix obvious spelling errors caused by handwriting ambiguity but preserve intentional abbreviations
3. If there are diagrams or drawings, describe them briefly in [brackets] and extract any text labels within them
4. Separate distinct sections with a blank line
5. At the end, add a "Key Points" section summarizing the most important items in 3-5 bullet points
Return plain text only. No markdown formatting.`;

/** `_call_vision_ai_safe` */
async function callVisionSafe(imageB64: string, settings: AISettingsPayload, mimeType?: string): Promise<string> {
  try {
    return await callAiVision(imageB64, HANDWRITING_PROMPT, settings, mimeType);
  } catch (err) {
    throw new HttpError(
      500,
      `Could not read handwriting. Try a clearer photo with better lighting. Error: ${errMsg(err)}`
    );
  }
}

/** `Path(name).suffix.lower()` */
function fileSuffix(filename: string): string {
  const base = filename.split('/').pop() || '';
  const i = base.lastIndexOf('.');
  return i > 0 && i < base.length - 1 ? base.slice(i).toLowerCase() : '';
}

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        )
      : XML_ENTITIES[e.toLowerCase()]
  );
}

/** python-docx `doc.paragraphs` texts: body-level <w:p> of word/document.xml (tables and text boxes skipped). */
function docxParagraphs(buf: Buffer): string[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('File is not a zip file');
  let xml: string | null = null;
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0 && buf.readUInt32LE(ptr) === 0x02014b50; i--) {
    const nameLen = buf.readUInt16LE(ptr + 28);
    if (buf.toString('utf8', ptr + 46, ptr + 46 + nameLen) === 'word/document.xml') {
      const local = buf.readUInt32LE(ptr + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + buf.readUInt32LE(ptr + 20));
      xml = (buf.readUInt16LE(ptr + 10) === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
      break;
    }
    ptr += 46 + nameLen + buf.readUInt16LE(ptr + 30) + buf.readUInt16LE(ptr + 32);
  }
  if (xml === null) throw new Error("There is no item named 'word/document.xml' in the archive");

  const paragraphs: string[] = [];
  let tblDepth = 0;
  let pDepth = 0;
  let inPPr = false;
  let inT = false;
  let current = '';
  const tokens = /<(\/?)w:(tbl|tab|pPr|p|t|br|cr)(?=[\s/>])([^>]*)>|([^<]+)/g;
  for (const [, close, tag, attrs, text] of xml.matchAll(tokens)) {
    if (text !== undefined) {
      if (inT && pDepth === 1 && !tblDepth) current += decodeXml(text);
      continue;
    }
    const selfClosing = attrs.endsWith('/');
    if (tag === 'tbl') tblDepth += close ? -1 : selfClosing ? 0 : 1;
    else if (tblDepth) continue;
    else if (tag === 'p') {
      if (selfClosing) continue;
      if (close) {
        if (pDepth === 1) paragraphs.push(current);
        pDepth--;
      } else if (++pDepth === 1) current = '';
    } else if (tag === 'pPr') inPPr = !close && !selfClosing;
    else if (tag === 't') inT = !close && !selfClosing;
    else if (!close && !inPPr && pDepth === 1) {
      current += tag === 'tab' ? '\t' : /w:type="(page|column)"/.test(attrs) ? '' : '\n';
    }
  }
  return paragraphs;
}

/** Open a PDF with pdf.js (legacy Node build) and run fn on it. */
async function withPdf<T>(bytes: Uint8Array, fn: (doc: any) => Promise<T>): Promise<T> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const g = globalThis as any;
  // Run the worker in-process: bundlers can't follow pdf.js's runtime worker import.
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  try {
    return await fn(await task.promise);
  } finally {
    await task.destroy();
  }
}

/** pdfplumber `page.extract_text()` stand-in. */
async function pdfPageText(doc: any, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  page.cleanup();
  return content.items
    .map((item: any) => (typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : '') : ''))
    .join('')
    .trimEnd();
}

/** `_is_scanned_pdf`: fewer than 50 chars of text across the first 3 pages. */
async function isScannedPdf(doc: any): Promise<boolean> {
  try {
    let totalChars = 0;
    for (let n = 1; n <= Math.min(3, doc.numPages); n++)
      totalChars += (await pdfPageText(doc, n)).trim().length;
    return totalChars < 50;
  } catch {
    return false;
  }
}

/** pdf2image `convert_from_path(dpi=200)` + JPEG quality 85, via pdf.js on @napi-rs/canvas. */
async function renderPdfPageJpeg(doc: any, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 200 / 72 });
  const target = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  try {
    await page.render({ canvasContext: target.context, canvas: target.canvas, viewport }).promise;
    return Buffer.from(target.canvas.toBuffer('image/jpeg', 85)).toString('base64');
  } finally {
    doc.canvasFactory.destroy(target);
    page.cleanup();
  }
}

/** POST /todo/tasks/upload-context — text extraction from .txt/.pdf/.docx, vision LLM for images. */
async function uploadContext(ctx: TodoCtx): Promise<Row> {
  let form: FormData;
  try {
    form = await ctx.formData();
  } catch {
    throw new HttpError(422, 'file: Field required');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(422, 'file: Field required');
  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  if (!file.name) throw new HttpError(400, 'No file provided');

  const visionModel = field('vision_model');
  // Empty form values fall back to the Form() defaults, like FastAPI.
  const settings = aiSettings({
    model: visionModel,
    geminiKey: field('geminiKey'),
    ollamaUrl: field('ollamaUrl') || 'http://localhost:11434',
    ollamaModel: field('ollamaModel') || 'llama3.2',
  });

  const ext = fileSuffix(file.name);
  if (!['.txt', '.pdf', '.docx'].includes(ext) && !IMAGE_EXTENSIONS.has(ext)) {
    throw new HttpError(
      400,
      `Unsupported file type '${ext}'. Accepted: .txt, .pdf, .docx, .jpg, .jpeg, .png, .webp, .heic`
    );
  }

  // Python also saves the upload under backend/data/uploads; nothing reads it back, so it's kept in memory here.
  const content = Buffer.from(await file.arrayBuffer());
  if (content.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(
      413,
      `File too large. Max size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`
    );
  }

  let extractedText = '';
  let isHandwriting = false;
  let confidenceNote: string | null = null;

  try {
    if (ext === '.txt') {
      extractedText = new TextDecoder('utf-8').decode(content);
    } else if (ext === '.docx') {
      extractedText = docxParagraphs(content)
        .filter((p) => p.trim())
        .join('\n');
    } else if (ext === '.pdf') {
      const pdf = await withPdf(new Uint8Array(content), async (doc) => {
        const pages: string[] = [];
        if (await isScannedPdf(doc)) {
          // Scanned PDF — process each page as image via vision LLM
          for (let n = 1; n <= doc.numPages; n++) {
            const pageText = await callVisionSafe(await renderPdfPageJpeg(doc, n), settings);
            pages.push(`--- Page ${n} ---\n${pageText}`);
          }
          return {
            text: pages.join('\n\n'),
            note: `Scanned PDF processed via vision LLM (${doc.numPages} pages)`,
          };
        }
        for (let n = 1; n <= doc.numPages; n++) {
          const pageText = await pdfPageText(doc, n);
          if (pageText) pages.push(pageText);
        }
        return { text: pages.join('\n\n'), note: null };
      });
      extractedText = pdf.text;
      isHandwriting = pdf.note !== null;
      confidenceNote = pdf.note;
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      isHandwriting = true;
      // No Pillow here: HEIC can't be converted, other images go to the vision model as uploaded.
      if (ext === '.heic') {
        throw new HttpError(400, 'Failed to convert HEIC image. Ensure pillow-heif is installed.');
      }
      extractedText = await callVisionSafe(content.toString('base64'), settings, imageMimeType(ext));

      if (!extractedText || extractedText.trim().length < 10) {
        extractedText = 'No text detected in this image.';
        confidenceNote = 'No text detected';
      } else if (
        ['unclear', 'blurry', 'cannot read', 'illegible'].some((kw) =>
          extractedText.toLowerCase().includes(kw)
        )
      ) {
        confidenceNote = 'Some text may be unclear due to image quality. Please review carefully.';
      }
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(500, `Failed to extract text: ${errMsg(err)}`);
  }

  const text = extractedText.trim();
  if (isHandwriting && text) {
    createHandwritingExtraction(ctx.userId, file.name, text, visionModel, {
      source: 'task_context',
      confidence_note: confidenceNote,
    });
  }

  const result: Row = { filename: file.name, extracted_text: text, char_count: [...text].length };
  if (isHandwriting) {
    result.is_handwriting = true;
    if (confidenceNote) result.confidence_note = confidenceNote;
  }
  return result;
}

// ── Copilot ─────────────────────────────────────────────────────────────────

/** `_get_top20_titles_across_tabs`: Top 20% titles across tasks, quick_tasks and project_nodes. */
function getTop20TitlesAcrossTabs(userId: number, limit = 15): string[] {
  return withTodoDb((db) => {
    const titles = [
      ...db.all(
        "SELECT title FROM tasks WHERE user_id = ? AND is_top_20 = 1 AND status != 'done' LIMIT ?",
        userId,
        limit
      ),
      ...db.all(
        "SELECT title FROM quick_tasks WHERE user_id = ? AND is_top_20 = 1 AND done = 0 AND date = date('now') LIMIT ?",
        userId,
        limit
      ),
      ...db.all(
        'SELECT title FROM project_nodes WHERE user_id = ? AND is_top_20 = 1 LIMIT ?',
        userId,
        limit
      ),
    ].map((row) => row.title as string);
    return titles.slice(0, limit);
  });
}

/** `_build_task_summary`: the task tree as text for the copilot prompt. */
function buildTaskSummary(tasks: Row[], userId: number, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  for (const task of tasks) {
    const status = String(pyGet(task, 'status', 'backlog'));
    const priority = String(pyGet(task, 'priority', 'p3'));
    const timeEst = pyStr(pyGet(task, 'time_estimate', 'no estimate'));
    const due = pyStr(pyGet(task, 'due_date', 'no due date'));

    const detailPieces: string[] = [];
    if (task.context) detailPieces.push(`Context: ${String(task.context).slice(0, 100)}...`);
    if (task.intention) detailPieces.push(`Why it matters: ${task.intention}`);
    if (task.definition_of_done) detailPieces.push(`Done when: ${task.definition_of_done}`);

    // Include last 3 notes
    const notes = getTaskNotes(task.id, userId);
    if (notes.length) {
      const notesStr = notes
        .slice(0, 3)
        .map((n) => `[${n.note_type}]: ${String(n.content).slice(0, 50)}...`)
        .join('; ');
      detailPieces.push(`Recent Notes: ${notesStr}`);
    }

    const details = detailPieces.join(' | ');
    const detailsStr = details ? ` | ${details}` : '';

    lines.push(
      `${prefix}- [${status.toUpperCase()}] [${priority.toUpperCase()}] ${task.title} ` +
        `(Time: ${timeEst}, Due: ${due})${detailsStr}`
    );

    const children = (pyGet(task, 'children', []) as Row[]) || [];
    if (children.length) lines.push(buildTaskSummary(children, userId, indent + 1));
  }
  return lines.join('\n');
}

// ── Intention suggestions ───────────────────────────────────────────────────

function intentionPrompt(title: unknown, context: unknown): string {
  return `You are a productivity coach.
For the task: "${title}"
Task Context: ${context || 'None'}

Suggest:
1. An intention (why does this task matter? what is the value or motivation?)
2. A definition of done (what does completed state look like?)

Return ONLY a JSON object:
{"intention": "motivation/why", "definition_of_done": "conditions of completion"}
No markdown formatting, no comments, no extra text.`;
}

/** The suggest-intention endpoints' inline JSON-object parsing; 500 "AI suggest failed" on any error. */
async function suggestIntention(prompt: string, settings: AISettingsPayload): Promise<unknown> {
  try {
    const responseText = await callAi(prompt, settings);
    const text = responseText
      .trim()
      .replace(/```[a-z]*\n?/g, '')
      .replace(/^`+|`+$/g, '')
      .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in response');
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    throw new HttpError(500, `AI suggest failed: ${errMsg(err)}`);
  }
}

/** Whole days since a stored timestamp (`datetime.utcnow() - fromisoformat(value)`), or null if unparseable. */
function daysSince(value: string): number | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      value
    );
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0', tz] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +frac.padEnd(3, '0').slice(0, 3));
  // Naive values are UTC (the db writes datetime.utcnow()); honour an explicit offset if present.
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const digits = tz.slice(1).replace(':', '');
    ms -= sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) * 60000;
  }
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  /** POST /todo/tasks */
  {
    method: 'POST',
    path: '/tasks',
    handler: async (ctx) => {
      const p = validate(await ctx.json(), TASK_CREATE);
      return createTask(ctx.userId, p.title, {
        parent_id: p.parent_id ?? null,
        status: p.status ?? 'backlog',
        priority: p.priority ?? 'p3',
        time_estimate: p.time_estimate ?? null,
        due_date: p.due_date ?? null,
        context: p.context ?? null,
        attachments: p.attachments ?? null,
        is_recurring: p.is_recurring ?? 0,
        recurrence_interval: p.recurrence_interval ?? null,
        recurrence_custom_days: p.recurrence_custom_days ?? null,
        intention: p.intention ?? null,
        definition_of_done: p.definition_of_done ?? null,
      });
    },
  },

  /** GET /todo/tasks/tree */
  { method: 'GET', path: '/tasks/tree', handler: (ctx) => getTaskTree(ctx.userId) },

  /** GET /todo/tasks/{task_id} */
  {
    method: 'GET',
    path: '/tasks/:task_id',
    handler: (ctx) => requireTask(ctx.intParam('task_id'), ctx.userId),
  },

  /** GET /todo/tasks/{task_id}/children */
  {
    method: 'GET',
    path: '/tasks/:task_id/children',
    handler: (ctx) => getChildren(ctx.intParam('task_id'), ctx.userId),
  },

  /** PATCH /todo/tasks/{task_id} — model_dump(exclude_none=True); is_top_20 locks the Pareto flag. */
  {
    method: 'PATCH',
    path: '/tasks/:task_id',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const updates = Object.fromEntries(
        Object.entries(validate(await ctx.json(), TASK_UPDATE)).filter(([, v]) => v !== null)
      );
      // A human explicitly toggled this via the Pareto modal — lock it so the
      // bulk /pareto/analyze sweep never silently overwrites the override.
      if ('is_top_20' in updates) updates.pareto_locked = 1;
      const task = updateTask(taskId, ctx.userId, updates);
      if (task === null || task === undefined) throw new HttpError(404, 'Task not found');
      return task;
    },
  },

  /** DELETE /todo/tasks/{task_id} */
  {
    method: 'DELETE',
    path: '/tasks/:task_id',
    handler: (ctx) => {
      const taskId = ctx.intParam('task_id');
      if (!deleteTask(taskId, ctx.userId)) throw new HttpError(404, 'Task not found');
      return { status: 'deleted', id: taskId };
    },
  },

  /** POST /todo/tasks/{task_id}/dive-deeper */
  {
    method: 'POST',
    path: '/tasks/:task_id/dive-deeper',
    handler: async (ctx) => ({
      subtasks: await breakdown(
        ctx.intParam('task_id'),
        ctx.userId,
        await ctx.json(),
        'dive_deeper',
        'AI generation failed'
      ),
    }),
  },

  /** POST /todo/tasks/{task_id}/chunk */
  {
    method: 'POST',
    path: '/tasks/:task_id/chunk',
    handler: async (ctx) => ({
      subtasks: await breakdown(
        ctx.intParam('task_id'),
        ctx.userId,
        await ctx.json(),
        'chunk',
        'AI generation failed'
      ),
    }),
  },

  /** POST /todo/tasks/{task_id}/regenerate — delete children, then re-run the task's breakdown type. */
  {
    method: 'POST',
    path: '/tasks/:task_id/regenerate',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await ctx.json();
      const task = requireTask(taskId, ctx.userId);
      const genType = pyGet(task, 'generation_type', 'manual');
      const breakdownType =
        genType === 'dive_deeper' || genType === 'chunk' ? genType : 'dive_deeper';

      const deletedCount = deleteChildren(taskId, ctx.userId);
      const prompt = buildAiPrompt(task, breakdownType, ctx.userId);
      let subtasksData: any[];
      try {
        subtasksData = extractJsonArray(await callAi(prompt, aiSettings(body)));
      } catch (err) {
        throw new HttpError(500, `AI regeneration failed: ${errMsg(err)}`);
      }
      const created = createSubtasksBatch(
        taskId,
        ctx.userId,
        subtasksData.slice(0, 5),
        breakdownType
      );
      return { subtasks: created, deleted_count: deletedCount };
    },
  },

  /** POST /todo/tasks/upload-context */
  { method: 'POST', path: '/tasks/upload-context', handler: uploadContext },

  /** POST /todo/copilot/ask */
  {
    method: 'POST',
    path: '/copilot/ask',
    handler: async (ctx) => {
      const body = await ctx.json();
      validate(body, { question: { kind: 'str', required: true } });
      const copilotData = getActiveTasksForCopilot(ctx.userId);
      const activeTree: Row[] = copilotData.active_tree;
      const summary = copilotData.summary;

      const taskSummary = activeTree?.length
        ? buildTaskSummary(activeTree, ctx.userId)
        : 'No active tasks.';

      const inboxItems = getUnprocessedInboxItems(ctx.userId);
      const inboxSummary = inboxItems.length
        ? inboxItems
            .map((item) => `- ${item.content} (captured: ${pyStr(item.created_at)})`)
            .join('\n')
        : 'No unprocessed items in inbox.';

      const top20Titles = getTop20TitlesAcrossTabs(ctx.userId);
      const top20Block = top20Titles.length
        ? `\nTasks marked as Top 20% (high leverage, Pareto-analyzed): ${top20Titles.join(', ')}. ` +
          "Bias your recommendations strongly toward these tasks — they're the ones that matter most " +
          'right now.\n'
        : '';

      const prompt = `You are a productivity copilot. Here are the user's current active tasks with priorities, statuses, time estimates, due dates, intentions, definition of done criteria, recent activity/notes, and subtask trees:

${taskSummary}

Summary: ${summary.total} total tasks, ${summary.done_count} completed, ${summary.backlog_no_date_count} in backlog without due dates, ${summary.active_count} active.
${top20Block}
Inbox/Distractions Captured (needs processing later):
${inboxSummary}

User's question: ${body.question}

Answer the user's question helpfully and concisely based on these tasks and distractions. Be specific — reference actual task or distraction names. Keep responses under 200 words unless the user asks for detail.`;

      let responseText: string;
      try {
        responseText = await callAi(prompt, aiSettings(body));
      } catch (err) {
        throw new HttpError(500, `AI call failed: ${errMsg(err)}`);
      }
      return { answer: responseText.trim() };
    },
  },

  /** GET /todo/tasks/{task_id}/notes */
  {
    method: 'GET',
    path: '/tasks/:task_id/notes',
    handler: (ctx) => getTaskNotes(ctx.intParam('task_id'), ctx.userId),
  },

  /** POST /todo/tasks/{task_id}/notes */
  {
    method: 'POST',
    path: '/tasks/:task_id/notes',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const p = validate(await ctx.json(), { content: { kind: 'str', required: true } });
      const note = createNote(taskId, ctx.userId, p.content, { note_type: 'manual' });
      if (note === null || note === undefined) throw new HttpError(404, 'Task not found');
      return note;
    },
  },

  /** POST /todo/tasks/{task_id}/notes/explain — AI explanation saved as a note. */
  {
    method: 'POST',
    path: '/tasks/:task_id/notes/explain',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await ctx.json();
      const task = requireTask(taskId, ctx.userId);

      const notes = getTaskNotes(taskId, ctx.userId);
      const notesContext = notes.length
        ? '\nExisting Notes:\n' + notes.map((n) => `- ${n.content}`).join('\n')
        : '';
      const intentionContext = task.intention ? `\nIntention: ${task.intention}` : '';
      const dodContext = task.definition_of_done
        ? `\nDefinition of Done: ${task.definition_of_done}`
        : '';

      const prompt = `You are a productivity assistant.
Generate a clear, detailed explanation of this task — what it involves, why it matters, what skills or knowledge are needed, and potential challenges. Write it as a helpful briefing for someone starting this task fresh.

Task Title: ${task.title}
Task Context: ${task.context || 'No additional context.'}${intentionContext}${dodContext}${notesContext}

Provide a comprehensive, professional explanation. Make it directly useful, structured with clear paragraphs or bullets, and keep it under 300 words.`;

      let explanation: string;
      try {
        explanation = await callAi(prompt, aiSettings(body));
      } catch (err) {
        throw new HttpError(500, `AI generation failed: ${errMsg(err)}`);
      }
      return createNote(taskId, ctx.userId, explanation.trim(), { note_type: 'ai_explanation' });
    },
  },

  /** POST /todo/tasks/{task_id}/notes/{note_id}/expand — AI expansion saved as a new note. */
  {
    method: 'POST',
    path: '/tasks/:task_id/notes/:note_id/expand',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const noteId = ctx.intParam('note_id');
      const body = await ctx.json();
      const task = requireTask(taskId, ctx.userId);
      const note = getNote(noteId, ctx.userId);
      if (!note) throw new HttpError(404, 'Note not found');

      const prompt = `You are a productivity assistant.
The user wrote this quick note while working: '${note.content}' for the task: '${task.title}'.
Expand this note into a detailed explanation of what this means, why this decision was made, and what implications it has for the task.

Write a clean, detailed, and professional expansion under 150 words.`;

      let expandedContent: string;
      try {
        expandedContent = await callAi(prompt, aiSettings(body));
      } catch (err) {
        throw new HttpError(500, `AI generation failed: ${errMsg(err)}`);
      }
      return createNote(taskId, ctx.userId, expandedContent.trim(), { note_type: 'ai_expansion' });
    },
  },

  /** POST /todo/tasks/{task_id}/notes/summarize — AI decision log of all notes. */
  {
    method: 'POST',
    path: '/tasks/:task_id/notes/summarize',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await ctx.json();
      const task = requireTask(taskId, ctx.userId);

      const notes = getTaskNotes(taskId, ctx.userId);
      if (!notes.length) return { summary: 'No notes available to summarize.' };

      const notesText = notes
        .map((n) => `[${pyStr(n.created_at)}] (${n.note_type}): ${n.content}`)
        .join('\n');

      const prompt = `You are a productivity assistant.
Summarize all these notes for the task '${task.title}' into a concise decision log — key decisions made, insights gained, blockers encountered, and the current state of the task.

Notes:
${notesText}

Provide a concise, bulleted summary under 200 words.`;

      let summaryText: string;
      try {
        summaryText = await callAi(prompt, aiSettings(body));
      } catch (err) {
        throw new HttpError(500, `AI generation failed: ${errMsg(err)}`);
      }
      return { summary: summaryText.trim() };
    },
  },

  /** POST /todo/tasks/{task_id}/suggest-intention — AI intention/DoD for an existing task. */
  {
    method: 'POST',
    path: '/tasks/:task_id/suggest-intention',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await ctx.json();
      const task = requireTask(taskId, ctx.userId);
      return suggestIntention(intentionPrompt(task.title, task.context), aiSettings(body));
    },
  },

  /** POST /todo/tasks/suggest-intention — AI intention/DoD before the task exists. */
  {
    method: 'POST',
    path: '/tasks/suggest-intention',
    handler: async (ctx) => {
      const body = await ctx.json();
      const p = validate(body, { title: { kind: 'str', required: true }, context: optStr });
      return suggestIntention(intentionPrompt(p.title, p.context), aiSettings(body));
    },
  },

  /**
   * GET /todo/tasks/{task_id}/resume — "where you left off" briefing. Python streams it;
   * here the whole text is returned at once (errors in-band, like stream_ai_text).
   */
  {
    method: 'GET',
    path: '/tasks/:task_id/resume',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const task = requireTask(taskId, ctx.userId);

      const children = getChildren(taskId, ctx.userId);
      const completedSubtasks = children.filter((c) => c.status === 'done').map((c) => c.title);
      const remainingSubtasks = children.filter((c) => c.status !== 'done').map((c) => c.title);

      const notes = getTaskNotes(taskId, ctx.userId);
      const recentNotes = notes
        .slice(0, 5)
        .map((n) => `- [${n.note_type}]: ${n.content}`)
        .join('\n');

      const lastAct = task.last_activity_at || task.created_at;
      let daysInactive = 2;
      if (lastAct) daysInactive = daysSince(String(lastAct)) ?? daysInactive;

      const prompt = `You are a productivity coach. Rebuild the user's context for this task they haven't worked on in ${daysInactive} days.

Task: ${task.title}
Why it matters (Intention): ${task.intention || 'Not specified.'}
Done when (Definition of Done): ${task.definition_of_done || 'Not specified.'}
Context: ${task.context || 'No context notes.'}
Subtasks completed: ${completedSubtasks.length ? completedSubtasks.join(', ') : 'None'}
Subtasks remaining: ${remainingSubtasks.length ? remainingSubtasks.join(', ') : 'None'}
Recent notes & timeline activity:
${recentNotes || 'No notes logged.'}

Generate a "Where You Left Off" briefing in exactly 3 sections:
1. Quick Summary (2 sentences max summarizing current state)
2. What's Done So Far (bullet points of what is complete)
3. Suggested First Step to get back into it (1 clear, small, immediate action)

Keep the briefing clean, actionable, and under 250 words.`;

      const settings = aiSettings(ctx.query);
      // The Python query param defaults to this model when it's absent (an empty value means the .env default).
      if (!ctx.query.has('model')) settings.model = 'gemini-flash-latest';
      let text: string;
      try {
        text = await callAi(prompt, settings);
      } catch (err) {
        text = `\n[error: ${errMsg(err)}]`;
      }
      return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    },
  },
];
