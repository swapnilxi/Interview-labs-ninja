/**
 * fe-apis/dailySession/youtube.ts
 *
 * Twin of backend/modules/common/youtube_client.py (the labs' "generate exercise from a YouTube video"), with one
 * deliberate difference:
 *   - extractVideoId: same two patterns as Python.
 *   - fetchVideoMetadata: the official YouTube Data API, only when the learner gave a key (supplementary context).
 *   - Captions: Python downloads them with the unofficial `youtube-transcript-api` library (it scrapes YouTube's
 *     internal player API). That is not copied here: YouTube refuses most requests from cloud hosts such as Vercel
 *     anyway, so in nextjs-api mode the route always asks for the transcript to be pasted (422, the same answer FastAPI
 *     gives when the library fails), and the panel shows its paste box.
 */

const VIDEO_ID_PATTERNS = [
  /(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
  /^([A-Za-z0-9_-]{11})$/,
];

export function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) return match[1];
  }
  return null;
}

/** Why there is no transcript without a pasted one (the 422 detail wraps it in "Couldn't fetch captions ... (here)"). */
export const NO_AUTO_CAPTIONS = 'automatic captions are only downloaded by the FastAPI backend';

const TIMEOUT_MS = 15_000;

export async function fetchVideoMetadata(
  videoId: string,
  apiKey: string
): Promise<{ title: string; description: string; channel: string }> {
  const params = new URLSearchParams({ part: 'snippet', id: videoId, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube Data API answered ${res.status}`);
  const data = (await res.json()) as { items?: { snippet: Record<string, string> }[] };
  const items = data.items ?? [];
  if (!items.length) throw new Error('Video not found via YouTube Data API');
  const snippet = items[0].snippet;
  return {
    title: snippet.title ?? '',
    description: snippet.description ?? '',
    channel: snippet.channelTitle ?? '',
  };
}
