/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',
  outputFileTracingIncludes: {
    '/api/pdf/documents': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/pdf/documents/[id]': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/pdf/upload': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/health': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/auth/login': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/auth/signup': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
    '/api/auth/me': ['../backend/data/lab_ninja.sqlite3', './data/lab_ninja.sqlite3'],
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
    ];
  },
  async rewrites() {
    return [
      { source: '/health', destination: '/api/health' },
      { source: '/auth/:path*', destination: '/api/auth/:path*' },
      { source: '/admin/:path*', destination: '/api/admin/:path*' },
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
