import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Emits .next/standalone for the Dockerfile.
  output: 'standalone',
  reactStrictMode: true,
  // Cache Components: the static shell of a route is prerendered at build, everything else is a
  // request-time hole inside Suspense. A data widget awaits `connection()` before its
  // `'use cache'` loader (AGENTS.md › Adding to a layer › Reads), so the image build never needs
  // the API.
  cacheComponents: true,
  // The docs enable both together; setting it explicitly also silences the build warning.
  partialPrefetching: true,
  // Tailwind v4 runs inside Turbopack (create-next-app 16 default); there is no PostCSS
  // config and none should be added.
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
