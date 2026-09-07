"""Gemini (Google AI Studio) connectivity check.

Reads GEMINI_API_KEY from backend/.env (or the environment) and:
  1. Calls generateContent on a model (default gemini-2.5-flash).
  2. On failure, prints Gemini's OWN error message, not the bare HTTP code
     (a 429 "prepayment credits are depleted" is a billing issue, not rate-limit).
  3. Lists the models this key can actually use, so you can pick a valid one.

Usage:
    python tests/gemini_test.py                 # default model
    python tests/gemini_test.py gemini-2.5-pro  # test a specific model
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    import certifi  # fixes macOS "CERTIFICATE_VERIFY_FAILED"
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash"


def load_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("No GEMINI_API_KEY in env or backend/.env")


def call(url: str, data: bytes | None = None):
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if data else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(body)["error"]["message"]
        except Exception:
            msg = body.strip()
        raise RuntimeError(f"HTTP {e.code}: {msg}") from None


def main() -> int:
    key = load_key()
    model = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL

    print(f"→ generateContent on {model}")
    prompt = "Reply with 'ok' then one short sentence confirming the connection works."
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()
    try:
        data = call(f"{BASE}/models/{model}:generateContent?key={key}", body)
        print("  ✅", data["candidates"][0]["content"]["parts"][0]["text"].strip())
        return 0
    except RuntimeError as e:
        print("  ❌", e)

    print("\nModels available to this key (support generateContent):")
    try:
        data = call(f"{BASE}/models?key={key}&pageSize=200")
        for m in data.get("models", []):
            if "generateContent" in m.get("supportedGenerationMethods", []):
                print("  •", m["name"].replace("models/", ""))
    except RuntimeError as e:
        print("  ❌", e)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
