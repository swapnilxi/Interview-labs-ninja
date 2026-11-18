"""Video link rules shared by the labs and AI LMS (what a saved link may be).

Python twin of the validation half of frontend/src/lib/video/videoLinks.ts: the same strings are accepted and
refused, with the same words, so change both. (Showing a link, its provider and embed address, is browser-only.)

What is stored for a video is only its url and an optional title; the provider, playlist/video kind, start time and
embed address are derived from the url in the browser.

No FastAPI import on purpose: this module runs under a bare interpreter against a database copy (see
backend/tests/videos_test.py). The routers turn `VideoError` into an HTTPException with a plain string detail.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

MAX_PER_ITEM = 20
URL_MAX = 500
TITLE_MAX = 120

URL_ERROR = "Enter a full link that starts with https://."
URL_TOO_LONG = f"That link is too long. Links can be at most {URL_MAX} characters."
TITLE_TOO_LONG = f"A title can be at most {TITLE_MAX} characters."
TITLE_NOT_TEXT = "A title must be text."
LIMIT_ERROR = f"At most {MAX_PER_ITEM} videos per item."
DUPLICATE_ERROR = "That video is already added."

# Presentation of a lab link (an admin sets it): a rectangular card shape and a preview image. Not used by AI LMS.
SHAPES = ("wide", "side", "slim")
DEFAULT_SHAPE = "wide"
PREVIEW_BYTES_MAX = 204800  # the decoded size of an uploaded image: 200 KB
PREVIEW_PAYLOAD_MAX = (PREVIEW_BYTES_MAX + 2) // 3 * 4  # ...as base64 characters (273068)
SHAPE_ERROR = "A shape must be wide, side or slim."
PREVIEW_ERROR = "A preview image must be an https:// link or a JPEG, PNG, WebP or GIF image."
PREVIEW_URL_TOO_LONG = f"That image link is too long. Links can be at most {URL_MAX} characters."
PREVIEW_TOO_BIG = "That image is too large. A preview image can be at most 200 KB."
SHARED_ERROR = "Shared must be true or false."


class VideoError(Exception):
    """A request the caller can fix. `status_code` and `detail` go straight into the HTTP response."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# Whitespace and control characters of every kind, as explicit ranges (not \s) so the TS twin matches exactly.
_FORBIDDEN_RANGE = "\u0000- \u007f-   -‏ -  　﻿"
_FORBIDDEN = re.compile(f"[{_FORBIDDEN_RANGE}]")
_EDGE_WHITESPACE = re.compile(f"^[{_FORBIDDEN_RANGE}]+|[{_FORBIDDEN_RANGE}]+$")
_RUN_OF_FORBIDDEN = re.compile(f"[{_FORBIDDEN_RANGE}]+")

# One host label: letters, digits and inner hyphens. ASCII digits only ([0-9], never \d, which is unicode in Python).
_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
# http(s)://host[:port][/path?query#fragment], and no `user:pass@` (an `@` before the path cannot match).
# re.ASCII keeps IGNORECASE ASCII-only: without it Python folds "ſ" to "s" and "K" to "k" (JavaScript does not).
_URL_SHAPE = re.compile(rf"https?://{_LABEL}(?:\.{_LABEL})*(?::([0-9]{{1,5}}))?(?:[/?#].*)?", re.IGNORECASE | re.ASCII)


def clean_url(value: Any) -> str:
    """The trimmed link when it is a valid video link; otherwise raises VideoError(422) with the plain message."""
    if not isinstance(value, str):
        raise VideoError(422, URL_ERROR)
    url = _EDGE_WHITESPACE.sub("", value)
    if not url or _FORBIDDEN.search(url):
        raise VideoError(422, URL_ERROR)
    if len(url) > URL_MAX:  # len() counts code points, like the TS twin's Array.from(url).length
        raise VideoError(422, URL_TOO_LONG)
    match = _URL_SHAPE.fullmatch(url)
    if not match:
        raise VideoError(422, URL_ERROR)
    port = match.group(1)
    if port is not None and not 1 <= int(port) <= 65535:
        raise VideoError(422, URL_ERROR)
    return url


def clean_title(value: Any) -> str:
    """A title is optional: runs of whitespace and control characters become one space, then it is trimmed."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise VideoError(422, TITLE_NOT_TEXT)
    title = _RUN_OF_FORBIDDEN.sub(" ", value).strip(" ")
    if len(title) > TITLE_MAX:
        raise VideoError(422, TITLE_TOO_LONG)
    return title


# A preview image is an https link or an uploaded image as a data URL. Nothing else (no http, no svg, no other scheme).
_HTTPS_PREFIX = re.compile(r"https://", re.IGNORECASE | re.ASCII)
_HTTPS_SHAPE = re.compile(rf"https://{_LABEL}(?:\.{_LABEL})*(?::([0-9]{{1,5}}))?(?:[/?#].*)?", re.IGNORECASE | re.ASCII)
_DATA_IMAGE = re.compile(r"data:image/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})", re.ASCII)


def clean_shape(value: Any) -> str | None:
    """None (not sent) stays None; otherwise one of SHAPES, or VideoError(422)."""
    if value is None:
        return None
    if not isinstance(value, str) or value not in SHAPES:
        raise VideoError(422, SHAPE_ERROR)
    return value


def clean_preview_image(value: Any) -> str:
    """'' for no image (None and '' both mean that); else the https link or data URL as it will be stored.
    Raises VideoError(422) for anything else, or for an upload over PREVIEW_BYTES_MAX."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise VideoError(422, PREVIEW_ERROR)
    text = _EDGE_WHITESPACE.sub("", value)
    if text == "":
        return ""
    data = _DATA_IMAGE.fullmatch(text)
    if data:
        payload = data.group(1)
        if len(payload) % 4 != 0:
            raise VideoError(422, PREVIEW_ERROR)
        if len(payload) > PREVIEW_PAYLOAD_MAX:
            raise VideoError(422, PREVIEW_TOO_BIG)
        return text
    if not _HTTPS_PREFIX.match(text) or _FORBIDDEN.search(text):
        raise VideoError(422, PREVIEW_ERROR)
    if len(text) > URL_MAX:
        raise VideoError(422, PREVIEW_URL_TOO_LONG)
    match = _HTTPS_SHAPE.fullmatch(text)
    if not match:
        raise VideoError(422, PREVIEW_ERROR)
    port = match.group(1)
    if port is not None and not 1 <= int(port) <= 65535:
        raise VideoError(422, PREVIEW_ERROR)
    return text


def now_iso() -> str:
    """YYYY-MM-DDTHH:MM:SS.mmmZ: the text JavaScript's toISOString() gives, so both twins store the same shape."""
    moment = datetime.now(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"
