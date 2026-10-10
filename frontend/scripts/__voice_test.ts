import fs from 'fs';
import path from 'path';

// tsx doesn't auto-load .env the way Next.js's dev server does -- load it manually so
// this test sees the same DEEPGRAM_API_KEY / AI provider config the real server would.
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const scratchDir = fs.readFileSync('/tmp/fe_voice_scratch.txt', 'utf-8').trim();
process.chdir(scratchDir);

async function main() {
  const { createAccessToken, findUserByEmail, createUser } = await import('../src/lib/server/authHelper');

  // Reuse an existing user, or create one in the scratch DB copy (never the real one).
  let user = findUserByEmail('voice-fe-test@example.com');
  if (!user) {
    user = createUser('voice-fe-test@example.com', 'TestPass123!', 'Voice FE Test');
  }
  const token = createAccessToken(user.id, user.email);
  console.log('minted token for user', user.id);

  const authReq = (body?: BodyInit, extraHeaders: Record<string, string> = {}) =>
    new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
      body,
    });

  // ── 1. voice-chat ──────────────────────────────────────────────────────
  console.log('\n=== Testing /api/lms/voice-chat handler directly ===');
  const voiceChatRoute = await import('../src/app/api/lms/voice-chat/route');
  const chatReq = new Request('http://localhost/api/lms/voice-chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'What is a load balancer?',
      contextTitle: 'How a Load Balancer Distributes Traffic',
      contextText: 'A load balancer distributes incoming requests across multiple servers.',
    }),
  });
  const chatRes = await voiceChatRoute.POST(chatReq as any);
  console.log('voice-chat status:', chatRes.status);
  console.log('voice-chat body:', await chatRes.text());

  // ── 2. STT ──────────────────────────────────────────────────────────────
  console.log('\n=== Testing /api/voice/stt handler directly ===');
  const sttRoute = await import('../src/app/api/voice/stt/route');
  const audioBytes = fs.readFileSync('/tmp/dg_test.mp3');
  const sttReq = new Request('http://localhost/api/voice/stt', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/mpeg' },
    body: audioBytes,
  });
  const sttRes = await sttRoute.POST(sttReq as any);
  console.log('stt status:', sttRes.status);
  console.log('stt body:', await sttRes.text());

  // ── 3. TTS ──────────────────────────────────────────────────────────────
  console.log('\n=== Testing /api/voice/tts handler directly ===');
  const ttsRoute = await import('../src/app/api/voice/tts/route');
  const ttsReq = new Request('http://localhost/api/voice/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'testing text to speech via fe apis' }),
  });
  const ttsRes = await ttsRoute.POST(ttsReq as any);
  console.log('tts status:', ttsRes.status);
  if (ttsRes.status === 200) {
    const buf = Buffer.from(await ttsRes.arrayBuffer());
    fs.writeFileSync('/tmp/fe_tts_out.mp3', buf);
    console.log('tts bytes written:', buf.length, 'content-type:', ttsRes.headers.get('content-type'));
  } else {
    console.log('tts body:', await ttsRes.text());
  }

  console.log('\nDONE');
}

main().catch((err) => {
  console.error('VOICE FE TEST FAILED:', err);
  process.exit(1);
});
