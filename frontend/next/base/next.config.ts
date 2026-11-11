import path from 'node:path'

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
  // Sheets `@use 'setup/functions'` through this load path, as in the other frontends; it is
  // derived from this file, so it holds whatever directory the build starts from.
  sassOptions: {
    implementation: 'sass-embedded',
    loadPaths: [path.join(import.meta.dirname, 'src/styles')],
  },
}

export default nextConfig
