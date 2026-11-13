"""Adds baseline security headers to every FastAPI response (API only returns JSON, so a
locked-down CSP is safe here)."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Cache-Control": "no-store",
}
# Swagger UI (/docs) needs scripts/styles from a CDN, so only lock down the JSON routes.
_DOCS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_docs = scope["path"].startswith(_DOCS)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for k, v in _HEADERS.items():
                    if k == "Cache-Control" and (is_docs or k in headers):
                        continue
                    headers.setdefault(k, v)
                if not is_docs:
                    headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            await send(message)

        await self.app(scope, receive, send_wrapper)
