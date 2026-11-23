/** @type {import('next').NextConfig} */
// Baseline hardening headers for every response. The CSP is deliberately limited to
// directives that cannot break Next.js inline scripts/styles: no framing (clickjacking),
// no <object>/<embed>, no <base> hijack, forms only post to this origin.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig = {
  poweredByHeader: false,
  // Source maps expose original source to anyone; ship them only when explicitly asked.
  productionBrowserSourceMaps: process.env.PUBLIC_SOURCE_MAPS === '1',
  distDir: process.env.DIST_DIR || '.next',
  // The dev-only 'static route' badge sat bottom-left on top of the sidebar rail's account button.
  devIndicators: { appIsrStatus: false },
  outputFileTracingIncludes: {
    '/api/pdf/documents': ['../backend/data/lab_ninja.sqlite3'],
    '/api/pdf/documents/[id]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/pdf/upload': ['../backend/data/lab_ninja.sqlite3'],
    '/api/health': ['../backend/data/lab_ninja.sqlite3'],
    '/api/auth/login': ['../backend/data/lab_ninja.sqlite3'],
    '/api/auth/signup': ['../backend/data/lab_ninja.sqlite3'],
    '/api/auth/me': ['../backend/data/lab_ninja.sqlite3'],
    // AI LMS class folders (lesson/landing HTML) and their templates, read by
    // fe-apis/lms/classFolders.ts.
    '/api/lms/**': ['./src/modules/ai-lms/classes/**/*', '../backend/modules/ai_lms/templates/**/*'],
    // To-Do suite (fe-apis/todo): seeds /tmp/lab_ninja.sqlite3 on a cold start like the routes above.
    '/api/todo/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/pareto/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    // Every other route that opens the database (fe-apis): without its own entry a Vercel function ships without the
    // file and, unless Neon seeds /tmp (DATABASE_URL), starts on an empty database — the page then shows no data.
    '/api/auth/profile': ['../backend/data/lab_ninja.sqlite3'],
    '/api/access-requests/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/admin/db/pull': ['../backend/data/lab_ninja.sqlite3'],
    '/api/admin/db/push': ['../backend/data/lab_ninja.sqlite3'],
    // Admin portal catch-all (stats, user management, permission overrides, access-request review).
    '/api/admin/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/dsa/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/cv/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/system-design/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    // The topic labs also read their seed topics (fe-apis/labs seedTopicLabs).
    '/api/communication/[...path]': ['../backend/data/lab_ninja.sqlite3', '../backend/modules/communication_lab/topics.json'],
    '/api/finance/[...path]': ['../backend/data/lab_ninja.sqlite3', '../backend/modules/finance_lab/topics.json'],
    '/api/python/[...path]': ['../backend/data/lab_ninja.sqlite3', '../backend/modules/python_lab/topics.json'],
    '/api/genai/[...path]': ['../backend/data/lab_ninja.sqlite3', '../backend/modules/genai_lab/topics.json'],
    '/api/lab-sections/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/lab-projects/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    // Career Studio (fe-apis/career): its own DB plus lab_ninja for the auth lookup.
    '/api/career/[[...path]]': ['../backend/data/career_studio.sqlite3', '../backend/data/lab_ninja.sqlite3'],
    // Guided Practice (fe-apis/guidedPractice): the saved path and progress of a DSA page, plus its AI endpoints.
    '/api/guided-practice/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/sessions/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/lab/[...path]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/questions/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/session-progress/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    // Auth only (the account-status check reads the users table); the cards themselves live in the browser.
    '/api/swipe-learn/generate': ['../backend/data/lab_ninja.sqlite3'],
    // Per-user AI memory table, and the research tool (auth only).
    '/api/memory/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/research/[[...path]]': ['../backend/data/lab_ninja.sqlite3'],
    '/api/push/subscribe': ['../backend/data/lab_ninja.sqlite3'],
    '/api/push/test': ['../backend/data/lab_ninja.sqlite3'],
    '/api/push/fcm-token': ['../backend/data/lab_ninja.sqlite3'],
    '/api/push/fcm-test': ['../backend/data/lab_ninja.sqlite3'],
    '/api/push/sweep': ['../backend/data/lab_ninja.sqlite3'],
    // Login-only since 2026-11-16: these check the account (users table) before answering.
    '/api/config/ai-default': ['../backend/data/lab_ninja.sqlite3'],
    '/api/config/test-key': ['../backend/data/lab_ninja.sqlite3'],
    '/api/config/env-prefill': ['../backend/data/lab_ninja.sqlite3'],
    // Text-to-speech / speech-to-text (Question review's Listen mode, AI LMS voice): auth reads the users table.
    '/api/voice/stt': ['../backend/data/lab_ninja.sqlite3'],
    '/api/voice/tts': ['../backend/data/lab_ninja.sqlite3'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Left on: ~600 pre-existing prettier-only formatting violations across
    // the codebase would fail the build if this were false. Fix those (e.g.
    // `npm run lint:fix`) before flipping it.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'images.pixabay.com' },
      { protocol: 'https', hostname: 'img.rocket.new' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/daily-session',
        permanent: false,
      },
      {
        source: '/lms',
        destination: '/ai-lms',
        permanent: false,
      },
      {
        source: '/lms/:path*',
        destination: '/ai-lms/:path*',
        permanent: false,
      },
      // Career Studio aliases
      {
        source: '/career-studio',
        destination: '/career',
        permanent: false,
      },
      // The To-Do page moved to /ai-todo. Exact path only (query like ?tab=smart is kept):
      // /todo/* is the To-Do API, not a page.
      {
        source: '/todo',
        destination: '/ai-todo',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/health', destination: '/api/health' },
      { source: '/auth/:path*', destination: '/api/auth/:path*' },
      { source: '/admin/:path*', destination: '/api/admin/:path*' },
      // Exact path only: '/config/:path*' would also match '/config' and hijack the Config page.
      { source: '/config/ai-default', destination: '/api/config/ai-default' },
      { source: '/config/test-key', destination: '/api/config/test-key' },
      // To-Do API (fe-apis/todo). ':path+' needs at least one segment, so the bare /todo
      // URL still reaches the redirect to the /ai-todo page above.
      { source: '/todo/:path+', destination: '/api/todo/:path+' },
      { source: '/pareto/:path*', destination: '/api/pareto/:path*' },
      // Lab AI sections + quizzes (fe-apis/labSections). ':path*' also matches the bare /lab-sections.
      { source: '/lab-sections/:path*', destination: '/api/lab-sections/:path*' },
      // Labs Projects + their saved sections (fe-apis/labProjects).
      { source: '/lab-projects/:path*', destination: '/api/lab-projects/:path*' },
      // Guided Practice's saved progress and AI endpoints (fe-apis/guidedPractice). No page lives under /guided-practice
      // (the page is /dsa-lab/guided-practice).
      { source: '/guided-practice/:path*', destination: '/api/guided-practice/:path*' },
      // DSA lab: only the week plan has a Next.js twin (fe-apis/dsaLab: the active plan, profiles, AI
      // organizer). ':path*' also matches the bare /dsa/week-plan; /dsa/topics etc. stay untouched.
      { source: '/dsa/week-plan/:path*', destination: '/api/dsa/week-plan/:path*' },
      // Lab topics and sections (fe-apis/labs), Daily Session data (fe-apis/dailySession), the account's profile and
      // access requests (fe-apis/account). No page lives under these paths (the pages are /dsa-lab, /cv-lab, ...).
      { source: '/dsa/topics', destination: '/api/dsa/topics' },
      { source: '/dsa/sections', destination: '/api/dsa/sections' },
      { source: '/cv/:path+', destination: '/api/cv/:path+' },
      { source: '/system-design/:path+', destination: '/api/system-design/:path+' },
      { source: '/communication/:path+', destination: '/api/communication/:path+' },
      { source: '/finance/:path+', destination: '/api/finance/:path+' },
      { source: '/python/:path+', destination: '/api/python/:path+' },
      { source: '/genai/:path+', destination: '/api/genai/:path+' },
      { source: '/sessions/:path*', destination: '/api/sessions/:path*' },
      // The labs' Generate Practice panel (fe-apis/dailySession/labGenerate.ts). No page lives under /lab.
      { source: '/lab/:path+', destination: '/api/lab/:path+' },
      { source: '/questions/:path*', destination: '/api/questions/:path*' },
      { source: '/session-progress/:path*', destination: '/api/session-progress/:path*' },
      { source: '/memory/:path*', destination: '/api/memory/:path*' },
      { source: '/memory', destination: '/api/memory' },
      { source: '/research/:path*', destination: '/api/research/:path*' },
      // Exact path: /swipe-learn itself is a page.
      { source: '/swipe-learn/generate', destination: '/api/swipe-learn/generate' },
      { source: '/access-requests/:path*', destination: '/api/access-requests/:path*' },
      // Career Studio API (fe-apis/career). Prefix-specific on purpose: /career and
      // /career/view/[id] are pages, so a blanket /career/:path* would hijack them.
      { source: '/career/profiles/:path*', destination: '/api/career/profiles/:path*' },
      { source: '/career/resumes/:path*', destination: '/api/career/resumes/:path*' },
      { source: '/career/views/:path*', destination: '/api/career/views/:path*' },
      { source: '/career/jobs/:path*', destination: '/api/career/jobs/:path*' },
      { source: '/career/portfolios/:path*', destination: '/api/career/portfolios/:path*' },
      { source: '/career/portfolio-versions/:path*', destination: '/api/career/portfolio-versions/:path*' },
      { source: '/career/cover-letters/:path*', destination: '/api/career/cover-letters/:path*' },
      { source: '/career/templates/:path*', destination: '/api/career/templates/:path*' },
      { source: '/career/versions/:path*', destination: '/api/career/versions/:path*' },
      { source: '/career/sections/:path*', destination: '/api/career/sections/:path*' },
      { source: '/career/import/:path*', destination: '/api/career/import/:path*' },
      { source: '/career/generate/:path*', destination: '/api/career/generate/:path*' },
      { source: '/career/copilot/:path*', destination: '/api/career/copilot/:path*' },
      { source: '/career/analytics/:path*', destination: '/api/career/analytics/:path*' },
      { source: '/career/public/:path*', destination: '/api/career/public/:path*' },
      { source: '/career/tracker/:path*', destination: '/api/career/tracker/:path*' },
    ];
  },
  // The reader's service worker (public/sw.js) must never be served stale, or
  // an old offline cache pins a broken app shell. Cross-Origin Isolation was
  // dropped: PDF.js text extraction does not need SharedArrayBuffer, and
  // `require-corp` blocked subresources (fonts, the pdf.js worker asset) on
  // mobile browsers.
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  webpack(
    config,
    { dev }
  ) {
    if (dev) {
      try {
        config.module.rules.push({
          test: /\.(jsx|tsx)$/,
          exclude: [/node_modules/],
          use: [{
            loader: '@dhiwise/component-tagger/nextLoader',
          }],
        });
      } catch {}

      const ignoredPaths = (process.env.WATCH_IGNORED_PATHS || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      config.watchOptions = {
        ignored: ignoredPaths.length
          ? ignoredPaths.map((p) => `**/${p.replace(/^\/+|\/+$/g, '')}/**`)
          : undefined,
      };
    }
    return config;
  },
};

export default nextConfig;
