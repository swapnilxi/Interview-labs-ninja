/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',
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
      // To-Do API (fe-apis/todo). ':path+' needs at least one segment, so the bare /todo
      // URL still reaches the redirect to the /ai-todo page above.
      { source: '/todo/:path+', destination: '/api/todo/:path+' },
      { source: '/pareto/:path*', destination: '/api/pareto/:path*' },
      // Lab AI sections + quizzes (fe-apis/labSections). ':path*' also matches the bare /lab-sections.
      { source: '/lab-sections/:path*', destination: '/api/lab-sections/:path*' },
      // Labs Projects + their saved sections (fe-apis/labProjects).
      { source: '/lab-projects/:path*', destination: '/api/lab-projects/:path*' },
      // DSA lab: only the week plan has a Next.js twin (fe-apis/dsaLab: the active plan, profiles, AI
      // organizer). ':path*' also matches the bare /dsa/week-plan; /dsa/topics etc. stay untouched.
      { source: '/dsa/week-plan/:path*', destination: '/api/dsa/week-plan/:path*' },
    ];
  },
  // Cross-Origin Isolation headers required by PDF.js 4.x (SharedArrayBuffer)
  // Only applied to the swipe-pdf-reader route to avoid breaking other routes.
  async headers() {
    return [
      {
        source: '/swipe-pdf-reader/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
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
