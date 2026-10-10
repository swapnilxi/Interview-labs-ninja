/**
 * fe-apis/voice/localTts.ts
 *
 * Local text-to-speech via macOS's built-in `say` command -- zero setup, zero
 * model download, native to Node (no Python involved, unlike local STT). More
 * robotic-sounding than a neural TTS model, but simplest possible local option.
 * macOS-only by nature.
 */

import { execFile } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

export async function synthesizeSpeechLocal(text: string): Promise<ArrayBuffer> {
  const tmpPath = path.join(tmpdir(), `voice-tts-${randomUUID()}.wav`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      'say',
      ['-o', tmpPath, '--data-format=LEI16@22050', text],
      { timeout: 30000 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(err.code === 'ENOENT' ? '`say` is not available -- local TTS requires macOS.' : (stderr.trim() || err.message)));
          return;
        }
        resolve();
      }
    );
  });

  try {
    const buf = await readFile(tmpPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
