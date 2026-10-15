import type { NextConfig } from 'next';

/**
 * The engine URL is proxied through this Next.js server so the browser only
 * ever talks to its own origin. That keeps hosted previews working (no CORS,
 * no mixed-content blocks) and means `npm run dev` alone is enough.
 */
const engineTarget = (process.env.ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/engine/:path*', destination: `${engineTarget}/:path*` },
    ];
  },
  async redirects() {
    return [
      // The reference-voice workflow was removed: keep old links working.
      { source: '/custom-voice', destination: '/voice-forge', permanent: true },
    ];
  },
};

export default nextConfig;
