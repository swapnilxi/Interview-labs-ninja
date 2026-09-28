/**
 * fe-apis/voice/localWhisper.ts
 *
 * Local speech-to-text by shelling out to the Python backend's MLX-Whisper CLI
 * (backend/scripts/transcribe_local.py) -- MLX-Whisper is Python/Apple-Silicon
 * only, with no Node.js equivalent, so this reuses the exact model/code already
 * verified on the Python side (modules/common/voice/whisper_local.py) instead of
 * standing up a second local-Whisper stack in Node. Runs entirely on-device: no
 * network call, no per-request cost, no audio leaves the machine.
 */

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  wav: '.wav',
  mp4: '.m4a',
  m4a: '.m4a',
  ogg: '.ogg',
};

function extFromContentType(contentType: string): string {
  for (const [marker, ext] of Object.entries(EXT_BY_CONTENT_TYPE)) {
    if (contentType.includes(marker)) return ext;
  }
  return '.webm';
}

/**
 * Locates the backend/ directory regardless of which directory the Next.js
 * process was launched from -- mirrors the same multi-candidate approach
 * frontend/src/lib/server/sqliteReader.ts already uses for the same reason.
 */
function resolveBackendDir(): string {
  const candidates = [
    path.join(process.cwd(), 'backend'),
    path.join(process.cwd(), '..', 'backend'),
  ];
  const found = candidates.find((dir) => existsSync(path.join(dir, 'scripts', 'transcribe_local.py')));
  if (!found) {
    throw new Error('Could not locate backend/scripts/transcribe_local.py for local transcription.');
  }
  return found;
}

export async function transcribeAudioLocal(audioBuffer: ArrayBuffer, contentType: string): Promise<string> {
  const backendDir = resolveBackendDir();
  const tmpPath = path.join(tmpdir(), `voice-stt-${randomUUID()}${extFromContentType(contentType)}`);
  await writeFile(tmpPath, Buffer.from(audioBuffer));

  try {
    const transcript = await new Promise<string>((resolve, reject) => {
      execFile(
        'uv',
        ['run', 'python', 'scripts/transcribe_local.py', tmpPath, contentType],
        { cwd: backendDir, timeout: 30000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr.trim() || err.message));
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
    return transcript;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
