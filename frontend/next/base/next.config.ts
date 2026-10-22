import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Emits .next/standalone for the Dockerfile.
  output: 'standalone',
  reactStrictMode: true,
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
  // Cache Components (`cacheComponents: true`, which create-next-app enables) is left off:
  // pages fetch through feature loaders and render dynamically, which keeps the data model
  // explicit for agents. Turn it on as a deliberate task, together with `'use cache'`.
}

export default nextConfig
