/**
 * Turns a picked image file into a preview image a lab link can store: a JPEG data URL no wider than 960 px that the servers
 * accept (<= 200 KB decoded, see PREVIEW_BYTES_MAX in ./videoLinks). Browser only (canvas). The size is the reason for the
 * re-encoding: the image is saved in the database with the link, so it is made small before it is sent.
 */

import { PREVIEW_PAYLOAD_MAX, normalizePreviewImage } from '@/lib/video/videoLinks';

const MAX_WIDTH = 960;
const MIN_WIDTH = 320;
const QUALITIES = [0.82, 0.7, 0.58, 0.46];
/** Do not even decode a file bigger than this: a phone photo is a few MB, anything past this is not a picture for a card. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const PREVIEW_FILE_ERROR = 'Choose a JPEG, PNG, WebP or GIF image.';
export const PREVIEW_FILE_TOO_BIG = 'That image is too large to use. Choose a smaller one.';
export const PREVIEW_FILE_UNREADABLE = 'That image could not be read. Choose another one.';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function decode(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // fall through to an <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(PREVIEW_FILE_UNREADABLE));
    img.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

/** Rejects with a readable message. */
export async function fileToPreviewDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error(PREVIEW_FILE_ERROR);
  if (file.size > MAX_FILE_BYTES) throw new Error(PREVIEW_FILE_TOO_BIG);
  const decoded = await decode(file).catch(() => {
    throw new Error(PREVIEW_FILE_UNREADABLE);
  });
  try {
    if (!decoded.width || !decoded.height) throw new Error(PREVIEW_FILE_UNREADABLE);
    let width = Math.min(MAX_WIDTH, decoded.width);
    for (;;) {
      const height = Math.max(1, Math.round((decoded.height * width) / decoded.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(PREVIEW_FILE_UNREADABLE);
      // JPEG has no transparency: a transparent PNG would turn black without a white ground.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (payload.length <= PREVIEW_PAYLOAD_MAX) {
          const checked = normalizePreviewImage(dataUrl);
          if (!checked.ok) throw new Error(checked.error);
          return checked.image;
        }
      }
      if (width <= MIN_WIDTH) throw new Error(PREVIEW_FILE_TOO_BIG);
      width = Math.max(MIN_WIDTH, Math.floor(width * 0.75));
    }
  } finally {
    decoded.close();
  }
}
