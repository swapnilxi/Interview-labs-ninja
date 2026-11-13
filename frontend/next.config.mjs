/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',
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
  // The reader's service worker (public/sw.js) must never be served stale, or
  // an old offline cache pins a broken app shell. Cross-Origin Isolation was
  // dropped: PDF.js text extraction does not need SharedArrayBuffer, and
  // `require-corp` blocked subresources (fonts, the pdf.js worker asset) on
  // mobile browsers.
  async headers() {
    return [
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
    config.module.rules.push({
      test: /\.(jsx|tsx)$/,
      exclude: [/node_modules/],
      use: [{
        loader: '@dhiwise/component-tagger/nextLoader',
      }],
    });
    if (dev) {
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
