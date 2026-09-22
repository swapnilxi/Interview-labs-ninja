import { NextResponse } from 'next/server';

/**
 * GET /api/config/env-prefill
 *
 * Reads NEXT_PUBLIC_* and well-known provider env vars from the server
 * (process.env) and returns only the keys that are actually set, so
 * the Config UI can pre-fill the matching fields.
 *
 * Security: only whitelisted env var names are exposed — this route
 * never dumps the full process.env.
 */

/** Map of env var → the UserSettings key it maps to in the frontend. */
const ENV_MAP = [
  // ── AI provider keys ─────────────────────────────────────────────
  { env: 'GEMINI_API_KEY',      setting: 'geminiKey',     label: 'Google Gemini API Key'    },
  { env: 'OPENAI_API_KEY',      setting: 'openaiKey',     label: 'OpenAI API Key'           },
  { env: 'ANTHROPIC_API_KEY',   setting: 'anthropicKey',  label: 'Anthropic API Key'        },
  { env: 'DEEPSEEK_API_KEY',    setting: 'deepseekKey',   label: 'DeepSeek API Key'         },
  { env: 'GROQ_API_KEY',        setting: 'groqKey',       label: 'Groq API Key'             },
  // ── YouTube ──────────────────────────────────────────────────────
  { env: 'YOUTUBE_API_KEY',     setting: 'youtubeApiKey', label: 'YouTube Data API Key'     },
  // ── Model / URL config ────────────────────────────────────────────
  { env: 'OLLAMA_URL',          setting: 'ollamaUrl',     label: 'Ollama Server URL'        },
  { env: 'OLLAMA_MODEL',        setting: 'ollamaModel',   label: 'Ollama Model'             },
  { env: 'TEXT_GENERATION_MODEL', setting: 'textGenerationModel', label: 'Text Generation Model' },
  { env: 'ANSWER_MODEL',        setting: 'answerModel',   label: 'Answer Evaluation Model'  },
] as const;

export const dynamic = 'force-dynamic'; // never cache — env can change at deploy time

export async function GET() {
  const found: { setting: string; label: string; env: string; masked: string }[] = [];
  const missing: { setting: string; label: string; env: string }[] = [];

  for (const entry of ENV_MAP) {
    const val = process.env[entry.env];
    if (val && val.trim()) {
      found.push({
        setting: entry.setting,
        label: entry.label,
        env: entry.env,
        // Mask the actual value — the caller uses it to pre-fill, but we send it as-is.
        // Client side handles display masking; here we send the real value so
        // it can be written into settings state. Treat this route as
        // server-internal (only hit from the same origin config page).
        masked: val,
      });
    } else {
      missing.push({ setting: entry.setting, label: entry.label, env: entry.env });
    }
  }

  return NextResponse.json({ found, missing });
}
