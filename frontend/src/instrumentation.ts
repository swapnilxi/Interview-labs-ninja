/**
 * Runs once per Next.js server instance at boot — on Vercel, that's once per cold
 * start, before any request is routed. Used to seed /tmp/lab_ninja.sqlite3 from the
 * latest Neon snapshot (when DATABASE_URL is set) instead of letting the first request
 * to touch the DB seed it from the stale git-committed file. See
 * src/lib/server/neonSync.ts for what this actually does and why it's needed.
 *
 * Must live at src/instrumentation.ts (not the project root) because this project uses
 * a src/ directory — Next.js only picks it up from whichever one holds src/app.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSeededFromNeon } = await import('./lib/server/neonSync');
    await ensureSeededFromNeon('lab_ninja');
  }
}
