/**
 * Text out of a .docx, in the browser, with no library: a .docx is a ZIP file, and the words are in `word/document.xml`.
 * The ZIP is read through its central directory (the only place that always holds the real sizes, even when the file
 * was written with data descriptors) and the one entry is inflated with the platform's `DecompressionStream`.
 *
 * Kept free of project imports on purpose: it is checked in Node against real .docx files.
 */

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

/** The document body is plain text in XML; a real one is a few MB at most. A larger claim is a corrupt or hostile file. */
const MAX_XML_BYTES = 40 * 1024 * 1024;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new DocxError('This browser cannot open Word files. Paste the text instead.');
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new DocxError('This Word file is too large to read.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The bytes of one entry of a ZIP file, or null when it has no such entry. */
async function zipEntry(zip: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End of central directory record: the last 22 bytes, or up to 64 KB earlier when the file has a comment.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let n = 0; n < entries; n++) {
    if (p + 46 > zip.length || view.getUint32(p, true) !== CENTRAL) {
      throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(zip.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;

    if (flags & 1)
      throw new DocxError(
        'This Word file is password-protected. Remove the password, then try again.'
      );
    if (
      compressed === 0xffffffff ||
      local + 30 > zip.length ||
      view.getUint32(local, true) !== LOCAL
    ) {
      throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = zip.subarray(start, start + compressed);
    if (raw.length !== compressed)
      throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
    if (method === 0) return raw;
    if (method === 8) return inflateRaw(raw, MAX_XML_BYTES);
    throw new DocxError('This Word file uses a compression this reader does not support.');
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body.toLowerCase()] ?? whole;
    const code =
      body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : whole;
  });
}

/**
 * Paragraph text out of WordprocessingML: one line per paragraph, list items marked with "- ", tabs and line breaks
 * kept. Formatting, images, headers, footers and comments are dropped.
 */
export function docxXmlToText(xml: string): string {
  const token =
    /<w:p(?=[\s/>])[^>]*>|<\/w:p>|<w:numPr>|<w:pStyle\s[^>]*w:val="List[^"]*"[^>]*>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br[^>]*\/>/g;
  const lines: string[] = [];
  let line = '';
  let listItem = false;
  // A paragraph ends at </w:p> (or is an empty <w:p/>); blank lines before the first words are dropped.
  const endParagraph = () => {
    if (line.trim() || lines.length)
      lines.push(listItem && line.trim() ? `- ${line.trim()}` : line);
    line = '';
    listItem = false;
  };
  for (const m of xml.matchAll(token)) {
    const t = m[0];
    if (m[1] !== undefined) line += decodeEntities(m[1]);
    else if (t === '</w:p>') endParagraph();
    else if (t.startsWith('<w:pStyle'))
      listItem = true; // a list style (ListBullet, ListParagraph...)
    else if (t.startsWith('<w:p')) {
      if (t.endsWith('/>')) endParagraph();
      else {
        line = '';
        listItem = false;
      }
    } else if (t === '<w:numPr>') listItem = true;
    else if (t.startsWith('<w:tab')) line += '\t';
    else if (t.startsWith('<w:br')) line += '\n';
  }
  return lines.join('\n');
}

/** The text of a .docx file. Throws `DocxError` with a message that can be shown as is. */
export async function extractDocxText(file: Blob): Promise<string> {
  const zip = new Uint8Array(await file.arrayBuffer());
  if (zip.length < 22) throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
  const body = await zipEntry(zip, 'word/document.xml');
  if (!body) throw new DocxError('This is not a Word (.docx) file, or it is damaged.');
  return docxXmlToText(new TextDecoder('utf-8').decode(body));
}
