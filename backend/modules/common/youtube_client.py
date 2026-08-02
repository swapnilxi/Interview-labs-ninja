"""YouTube video content fetching for the "generate exercise from video" feature.

Two independent sources are combined:
- Transcript (the actual spoken content) — always fetched via the unofficial
  `youtube-transcript-api` library, since YouTube's official Data API only
  allows caption *download* for videos the caller owns.
- Metadata (title/description) — fetched via the official Data API, and only
  if the caller supplied a key. Purely supplementary context for the prompt.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Optional

from youtube_transcript_api import YouTubeTranscriptApi

_VIDEO_ID_PATTERNS = (
    re.compile(r"(?:v=|/embed/|youtu\.be/|/shorts/)([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),
)


def extract_video_id(url: str) -> Optional[str]:
    url = url.strip()
    for pattern in _VIDEO_ID_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    return None


def fetch_transcript(video_id: str) -> str:
    """Best-effort transcript fetch: prefer English, else fall back to whatever's available."""
    api = YouTubeTranscriptApi()
    try:
        transcript = api.fetch(video_id, languages=("en", "en-US", "en-GB"))
    except Exception:
        transcript_list = api.list(video_id)
        try:
            found = transcript_list.find_transcript(["en"])
        except Exception:
            found = next(iter(transcript_list))
        transcript = found.fetch()

    text = " ".join(snippet.text.strip() for snippet in transcript if snippet.text and snippet.text.strip())
    if not text:
        raise ValueError("Transcript came back empty")
    return text


def fetch_video_metadata(video_id: str, api_key: str) -> dict:
    params = urllib.parse.urlencode({"part": "snippet", "id": video_id, "key": api_key})
    url = f"https://www.googleapis.com/youtube/v3/videos?{params}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read())
    items = data.get("items") or []
    if not items:
        raise ValueError("Video not found via YouTube Data API")
    snippet = items[0]["snippet"]
    return {
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "channel": snippet.get("channelTitle", ""),
    }
