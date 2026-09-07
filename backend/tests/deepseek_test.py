"""DeepSeek connectivity check (OpenAI-compatible chat/completions API).

Reads DEEPSEEK_API_KEY from backend/.env (or the environment) and:
  1. Calls /chat/completions on a model (default deepseek-chat).
  2. On failure, prints DeepSeek's OWN error message, not the bare HTTP code
     (a 402 "Insufficient Balance" is a billing issue, not a bad key).
  3. Lists the models this key can access via /models.

Usage:
    python tests/deepseek_test.py                    # default model
    python tests/deepseek_test.py deepseek-reasoner  # test a specific model
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

BASE = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


def load_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("No DEEPSEEK_API_KEY in env or backend/.env")


def call(url: str, key: str, data: bytes | None = None):
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
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

    print(f"→ chat/completions on {model}")
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "Reply with 'ok' then one short sentence confirming the connection works."}],
        "max_tokens": 40,
    }).encode()
    try:
        data = call(f"{BASE}/chat/completions", key, body)
        print("  ✅", data["choices"][0]["message"]["content"].strip())
        return 0
    except RuntimeError as e:
        print("  ❌", e)

    print("\nModels available to this key:")
    try:
        data = call(f"{BASE}/models", key)
        for m in data.get("data", []):
            print("  •", m.get("id"))
    except RuntimeError as e:
        print("  ❌", e)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
