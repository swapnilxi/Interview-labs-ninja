"""Read-only web research: search the web, fetch a few result pages and return their text.

It never logs in, submits forms, runs scripts or follows anything but plain GET links, so the model gets sources to
read, not a browser to drive. Because it fetches URLs for a user, every request is guarded against SSRF: http(s) only,
the host must resolve to public addresses only, every redirect is re-checked, and size and time are capped. Search is
DuckDuckGo's HTML endpoint (no API key); if it changes or blocks us the search returns no results and callers carry on
without sources.

Twin: frontend/fe-apis/research/web.ts (nextjs-api mode) -- limits, cleaning and parsing must match.
"""

from __future__ import annotations

import html
import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Optional, Tuple

USER_AGENT = "Mozilla/5.0 (compatible; LabNinjaResearch/1.0; read-only)"
MAX_QUERY_CHARS = 200
MAX_RESULTS = 6
MAX_FETCH = 4
MAX_PAGE_BYTES = 400_000
PAGE_TEXT_CHARS = 1800
SNIPPET_CHARS = 300
FETCH_TIMEOUT_S = 8
MAX_REDIRECTS = 3
SEARCH_URL = "https://html.duckduckgo.com/html/"
LITE_SEARCH_URL = "https://lite.duckduckgo.com/lite/"
# DuckDuckGo sometimes answers a burst of queries with a results-free throttling page (HTTP 202) for the form POST.
# A plain GET is no way round it: checked 2026-11-19, a GET of either endpoint gets the bot-check page (HTTP 202,
# "anomaly") while the form POST of both works. So the retry, after a pause, is a form POST to the lite endpoint (its
# own markup, own counter). Answers are remembered for a while so the same query isn't asked twice.
# Twin: SEARCH_RETRY_MS / SEARCH_CACHE_* in web.ts.
SEARCH_RETRY_S = 0.8
SEARCH_CACHE_TTL_S = 15 * 60
SEARCH_CACHE_MAX = 100
_search_cache: dict = {}


class UnsafeUrlError(ValueError):
    pass


def _public_ip(addr: str) -> bool:
    ip = ipaddress.ip_address(addr.split("%")[0])
    if ip.version == 6:
        if ip.ipv4_mapped is not None:  # ::ffff:a.b.c.d is judged by the embedded IPv4 address
            return _public_ip(str(ip.ipv4_mapped))
        # Only global unicast (2000::/3) is a public website; then drop the global ranges that embed or tunnel IPv4
        # (6to4, Teredo) or are documentation space. Twin: publicIp() in frontend/fe-apis/research/web.ts.
        if (ip.packed[0] & 0xE0) != 0x20:
            return False
        first, second = int.from_bytes(ip.packed[0:2], "big"), int.from_bytes(ip.packed[2:4], "big")
        if first == 0x2002 or (first == 0x2001 and second in (0, 0xDB8)):
            return False
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )


def check_public_url(url: str) -> urllib.parse.ParseResult:
    """Raises UnsafeUrlError unless `url` is http(s) and its host resolves only to public addresses."""
    parts = urllib.parse.urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeUrlError("Only http(s) links can be read.")
    if parts.username or parts.password:
        raise UnsafeUrlError("Links with credentials can't be read.")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Can't resolve {parts.hostname}.") from exc
    if not infos or not all(_public_ip(i[4][0]) for i in infos):
        raise UnsafeUrlError("That address isn't a public website.")
    return parts


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # we follow redirects ourselves, re-checking each hop
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def safe_get(url: str, data: Optional[bytes] = None) -> Tuple[str, str, bytes]:
    """GET (or form POST) `url`, following up to MAX_REDIRECTS redirects through the public-host check.
    Returns (final_url, content_type, body capped at MAX_PAGE_BYTES)."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        check_public_url(current)
        req = urllib.request.Request(current, data=data, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"})
        try:
            with _opener.open(req, timeout=FETCH_TIMEOUT_S) as resp:
                return current, resp.headers.get("content-type", ""), resp.read(MAX_PAGE_BYTES)
        except urllib.error.HTTPError as exc:
            location = exc.headers.get("location") if exc.code in (301, 302, 303, 307, 308) else None
            if not location:
                raise
            current, data = urllib.parse.urljoin(current, location), None
    raise UnsafeUrlError("Too many redirects.")


# ── Text ────────────────────────────────────────────────────────────────────

_DROP_RE = re.compile(r"<(script|style|noscript|svg|nav|header|footer|form|aside)\b.*?</\1\s*>", re.I | re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def page_text(raw: bytes, content_type: str, limit: int = PAGE_TEXT_CHARS) -> Tuple[str, str]:
    """(title, readable text) from an HTML page; non-HTML content gives ('', '')."""
    if content_type and "html" not in content_type.lower() and "text" not in content_type.lower():
        return "", ""
    doc = raw.decode("utf-8", errors="replace")
    t = _TITLE_RE.search(doc)
    title = _squash(_TAG_RE.sub(" ", t.group(1)))[:140] if t else ""
    body = _TAG_RE.sub(" ", _DROP_RE.sub(" ", doc))
    return title, _squash(body)[:limit].strip()


# ── Search ──────────────────────────────────────────────────────────────────

_RESULT_RE = re.compile(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
_SNIPPET_RE = re.compile(r'class="result__snippet"[^>]*>(.*?)</a>', re.S)
# lite.duckduckgo.com: <a rel="nofollow" href="URL" class='result-link'>Title</a> ... <td class='result-snippet'>..</td>
_LITE_RESULT_RE = re.compile(r"""<a\b([^>]*class=['"]result-link['"][^>]*)>(.*?)</a>""", re.S)
_LITE_HREF_RE = re.compile(r'href="([^"]+)"')
_LITE_SNIPPET_RE = re.compile(r"""class=['"]result-snippet['"][^>]*>(.*?)</td>""", re.S)


def _parse_results(doc: str, lite: bool) -> List[Tuple[str, str, str]]:
    """[(href, title, snippet)] from a results page; `lite` picks the lite endpoint's markup."""
    if lite:
        snippets = _LITE_SNIPPET_RE.findall(doc)
        hits = []
        for i, (attrs, title) in enumerate(_LITE_RESULT_RE.findall(doc)):
            href = _LITE_HREF_RE.search(attrs)
            if href:
                hits.append((href.group(1), title, snippets[i] if i < len(snippets) else ""))
        return hits
    snippets = _SNIPPET_RE.findall(doc)
    return [(href, title, snippets[i] if i < len(snippets) else "") for i, (href, title) in enumerate(_RESULT_RE.findall(doc))]


def _real_url(href: str) -> str:
    href = html.unescape(href)
    if href.startswith("//"):
        href = "https:" + href
    q = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
    return q["uddg"][0] if "uddg" in q else href


def web_search(query: str, max_results: int = MAX_RESULTS) -> List[dict]:
    """[{title, url, snippet}] from DuckDuckGo's HTML results; [] when the search is unavailable."""
    query = _squash(query)[:MAX_QUERY_CHARS]
    if not query:
        return []
    key = (query.lower(), max_results)
    hit = _search_cache.get(key)
    if hit and time.monotonic() - hit[0] < SEARCH_CACHE_TTL_S:
        return [dict(r) for r in hit[1]]
    hits: List[Tuple[str, str, str]] = []
    for attempt in range(2):
        try:
            form = urllib.parse.urlencode({"q": query})
            _, _, body = safe_get(SEARCH_URL if attempt == 0 else LITE_SEARCH_URL, data=form.encode())
        except Exception:
            body = b""
        doc = body.decode("utf-8", errors="replace")
        hits = _parse_results(doc, lite=attempt == 1)
        if hits:
            break
        if attempt == 0:
            time.sleep(SEARCH_RETRY_S)
    out, seen = [], set()
    for href, title, snippet in hits:
        url = _real_url(href)
        host = urllib.parse.urlparse(url).netloc
        if not url.startswith("http") or "duckduckgo.com" in host or url in seen:
            continue
        seen.add(url)
        out.append({
            "title": _squash(_TAG_RE.sub(" ", title))[:140],
            "url": url,
            "snippet": _squash(_TAG_RE.sub(" ", snippet))[:SNIPPET_CHARS],
        })
        if len(out) >= max_results:
            break
    if out:  # an empty answer is never cached: it is usually the throttling page
        if len(_search_cache) >= SEARCH_CACHE_MAX:
            _search_cache.pop(next(iter(_search_cache)))
        _search_cache[key] = (time.monotonic(), [dict(r) for r in out])
    return out


def research(query: str, fetch: int = 3, max_results: int = MAX_RESULTS) -> dict:
    """Searches, then reads the text of the top `fetch` pages (a page that fails keeps its snippet)."""
    fetch = min(max(int(fetch), 0), MAX_FETCH)
    results = web_search(query, max_results)
    for i, r in enumerate(results):
        r["text"] = ""
        if i >= fetch:
            continue
        try:
            _, ctype, raw = safe_get(r["url"])
            title, text = page_text(raw, ctype)
            r["text"] = text
            if title and not r["title"]:
                r["title"] = title
        except Exception:
            pass
    return {"query": _squash(query)[:MAX_QUERY_CHARS], "results": results}
