"""Vertex AI (standard, OAuth2) connectivity check — the $300-credit path.

Reads VERTEX_PROJECT_ID / VERTEX_LOCATION / GOOGLE_APPLICATION_CREDENTIALS from
backend/.env (or the environment), mints a service-account OAuth2 token, and
calls generateContent. On failure it prints Vertex's OWN error message.

Requires: a GCP project with the Vertex AI API enabled + billing attached, and
a service-account JSON with the "Vertex AI User" role (or `gcloud auth
application-default login`). Uses the same auth the app's Vertex provider uses.

Usage:
    python tests/vertex_test.py                    # default gemini-2.5-flash
    python tests/vertex_test.py gemini-2.5-pro     # a specific model
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

DEFAULT_MODEL = "gemini-2.5-flash"
SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def load_env():
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def access_token() -> str:
    from google.auth.transport.requests import Request
    sa = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if sa:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_file(sa, scopes=[SCOPE])
    else:
        import google.auth
        creds, _ = google.auth.default(scopes=[SCOPE])
    creds.refresh(Request())
    return creds.token


def main() -> int:
    load_env()
    project = os.getenv("VERTEX_PROJECT_ID", "").strip()
    location = os.getenv("VERTEX_LOCATION", "us-central1").strip() or "us-central1"
    model = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL

    if not project:
        sys.exit("Set VERTEX_PROJECT_ID in backend/.env (see .env.example).")

    try:
        token = access_token()
    except Exception as e:
        print("  ❌ could not get OAuth token:", e)
        print("     → check GOOGLE_APPLICATION_CREDENTIALS or run: gcloud auth application-default login")
        return 1

    host = "aiplatform.googleapis.com" if location == "global" else f"{location}-aiplatform.googleapis.com"
    url = (
        f"https://{host}/v1/projects/{project}/locations/{location}"
        f"/publishers/google/models/{model}:generateContent"
    )
    print(f"→ Vertex generateContent on {model} (project={project}, location={location})")
    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": "Reply with 'ok' then one short sentence confirming the connection works."}]}],
    }).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            data = json.loads(r.read())
        print("  ✅", data["candidates"][0]["content"]["parts"][0]["text"].strip())
        return 0
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            detail = detail.strip()
        print(f"  ❌ HTTP {e.code}: {detail}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
