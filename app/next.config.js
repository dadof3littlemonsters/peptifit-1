/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' produces a self-contained server bundle — the correct mode
  // for Docker / `next start` deployments.
  //
  // Previous config had two bugs:
  //   1. `output: 'export'` generates static files and is incompatible with
  //      `next start` (the Docker CMD). Next.js 14 throws an error on startup.
  //   2. `module.exports` was missing entirely, so ALL config was silently
  //      ignored (Next.js received an empty object and used defaults).
  output: 'standalone',

  images: {
    // Keep unoptimized for PWA/mobile — avoids needing a domain whitelist
    // and works correctly with the standalone output.
    unoptimized: true,
  },
}

module.exports = nextConfig
