/**
 * fe-apis/lms/docxText.ts
 *
 * The text of a .docx file, for POST /api/lms/upload-source in nextjs-api mode (the Python twin uses python-docx).
 * A .docx is a zip; the body is word/document.xml. This reads the zip's central directory, inflates that one entry
 * with node:zlib and keeps each paragraph's text (runs, tabs and line breaks), one blank line between paragraphs,
 * skipping empty ones, like the Python side's "\n\n".join(p.text for p in doc.paragraphs if p.text.strip()).
 * Tables are read too (python-docx's doc.paragraphs skips them): more of the material, never less.
 */

import zlib from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_XML_BYTES = 50 * 1024 * 1024;

function findEntry(buf: Buffer, name: string): Buffer | null {
  // The end-of-central-directory record sits in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && offset + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return null;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const entryName = buf.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (entryName === name) {
      if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
        return null;
      const start =
        localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
    if (dec || hex) {
      const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
    }
    return ENTITIES[String(name).toLowerCase()] ?? match;
  });
}

/** The paragraphs of a .docx as plain text, or throws when the file is not a readable .docx. */
export function docxText(bytes: ArrayBuffer | Buffer): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const xml = findEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('This is not a readable .docx file.');
  const body = xml.toString('utf8');
  const paragraphs: string[] = [];
  for (const match of body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    let text = '';
    for (const piece of match[0].matchAll(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g
    )) {
      if (piece[1] !== undefined) text += decodeXml(piece[1]);
      else if (piece[0].startsWith('<w:tab')) text += '\t';
      else text += '\n';
    }
    if (text.trim()) paragraphs.push(text);
  }
  return paragraphs.join('\n\n').trim();
}
