"""Shared job-text resolution — fetch a job posting URL (SSRF-guarded, with
Greenhouse/Lever API integrations) or accept pasted text/JSON, reduced to plain
text for feeding an LLM. Used by both the views (job-match / generate-resume)
and cover-letter verticals.
"""

from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

from fastapi import HTTPException

from .prompt_builder import _stringify

MAX_FETCH_BYTES = 2_000_000       # cap the download so a huge page can't OOM us
MAX_JOB_TEXT_CHARS = 20_000       # cap what we feed the model


def assert_public_http_url(url: str) -> None:
    """Block SSRF: this URL is fetched server-side, authenticated, on a
    multi-tenant deployment, and up to 20k chars of the response gets fed
    through an LLM whose output is handed back to the caller — a far richer
    read-oracle than a simple GET. Reject loopback/private/link-local/reserved
    targets (localhost, 127.0.0.1, 169.254.169.254 cloud metadata, RFC1918
    ranges, etc.) so a job link can't be used to probe internal infrastructure."""
    parsed = urllib.parse.urlsplit(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Job link must start with http:// or https://")
    hostname = parsed.hostname
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Couldn't resolve that job link's host")
    for family, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise HTTPException(status_code=400, detail="That job link points to a non-public address, which isn't allowed")


def strip_html_to_text(fragment: str) -> str:
    # Unescape FIRST: some sources (e.g. Greenhouse's job API) return HTML
    # that's itself entity-escaped (literal "&lt;h2&gt;"), so stripping tags
    # before unescaping would find no real "<...>" to strip and leave the
    # escaped markup sitting in the output as text.
    unescaped = html.unescape(fragment or "")
    text = re.sub(r"(?s)<[^>]+>", " ", unescaped)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def api_get_json(url: str, timeout: int = 10) -> Optional[dict]:
    """GET a fixed, hardcoded (never user-supplied) API URL and parse JSON.
    Returns None on ANY failure so callers can fall back to generic scraping —
    a site-specific integration should never be a new way for this feature to
    break, only a way to make it better when it works."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LabNinja Career Studio)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed host, not user input)
            return json.loads(resp.read())
    except Exception:  # noqa: BLE001 — deliberately broad, this is a best-effort enhancement
        return None


def fetch_greenhouse_job(url: str) -> Optional[str]:
    """Greenhouse publishes an official public job-board API for exactly this
    (developers.greenhouse.io/job-board.html) — calling it directly is more
    robust than scraping the rendered page, and is what it's meant for."""
    m = re.match(r"^https?://(?:www\.)?(?:job-boards|boards)\.greenhouse\.io/([^/?#]+)/jobs/(\d+)", url.strip(), re.IGNORECASE)
    if not m:
        return None
    board, job_id = m.group(1), m.group(2)
    data = api_get_json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}")
    if not data or not data.get("content"):
        return None
    header = " · ".join(x for x in [data.get("title"), data.get("company_name")] if x)
    body = strip_html_to_text(data["content"])
    return f"{header}\n\n{body}".strip() if header else body


def fetch_lever_job(url: str) -> Optional[str]:
    """Lever publishes an official public postings API (github.com/lever/postings-api)."""
    m = re.match(r"^https?://(?:www\.)?jobs\.lever\.co/([^/?#]+)/([0-9a-fA-F-]+)", url.strip(), re.IGNORECASE)
    if not m:
        return None
    site, posting_id = m.group(1), m.group(2)
    data = api_get_json(f"https://api.lever.co/v0/postings/{site}/{posting_id}?mode=json")
    if not data:
        return None
    body = data.get("descriptionPlain") or strip_html_to_text(data.get("description") or "")
    if not body:
        return None
    return f"{data['text']}\n\n{body}".strip() if data.get("text") else body


# Tried in order; the first one whose URL pattern matches AND whose API call
# succeeds wins. Everything else (LinkedIn, Indeed, Wellfound, Ashby, plain
# company career pages, …) falls through to the generic HTML scraper below —
# several of those sites actively restrict automated access, so this
# deliberately does NOT attempt to work around that; it only adds real,
# documented public APIs for platforms that offer one.
SITE_JOB_EXTRACTORS: list[Callable[[str], Optional[str]]] = [fetch_greenhouse_job, fetch_lever_job]


def fetch_url_text(url: str) -> str:
    """Fetch a job posting URL and reduce it to readable plain text (no JS/CSS/tags)."""
    assert_public_http_url(url)
    for extractor in SITE_JOB_EXTRACTORS:
        site_text = extractor(url)
        if site_text and len(site_text) >= 40:
            return site_text[:MAX_JOB_TEXT_CHARS]

    req = urllib.request.Request(
        url.strip(),
        headers={"User-Agent": "Mozilla/5.0 (compatible; LabNinja Career Studio)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (public-only, see assert_public_http_url)
            charset = resp.headers.get_content_charset() or "utf-8"
            raw = resp.read(MAX_FETCH_BYTES)
    except (urllib.error.URLError, ValueError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't fetch that link: {exc}")
    doc = raw.decode(charset, errors="replace")
    # Drop script/style/noscript blocks first (generic path only).
    doc = re.sub(r"(?is)<(script|style|noscript|template)[^>]*>.*?</\1>", " ", doc)
    text = strip_html_to_text(doc)
    if len(text) < 40:
        raise HTTPException(status_code=400, detail="That link didn't yield readable job text — paste the description instead.")
    return text[:MAX_JOB_TEXT_CHARS]


def resolve_job_source_text(job_source: str, job_url: Optional[str], job_text: Optional[str], job_json: Optional[Any]) -> str:
    """Shared job-text resolver for any endpoint that takes a job_source/job_url/
    job_text/job_json shape."""
    if job_source == "url":
        if not (job_url or "").strip():
            raise HTTPException(status_code=400, detail="Provide a job link")
        return fetch_url_text(job_url)
    if job_source == "json":
        if job_json is None:
            raise HTTPException(status_code=400, detail="Provide job JSON")
        text = _stringify(job_json).strip()
        if not text:
            raise HTTPException(status_code=400, detail="The job JSON had no readable content")
        return text[:MAX_JOB_TEXT_CHARS]
    text = (job_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste the job description or some context")
    return text[:MAX_JOB_TEXT_CHARS]


def safe_filename(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", (title or "document").strip()).strip("-").lower()
    return slug or "document"
