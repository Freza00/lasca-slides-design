import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless function config for screenshot (Puppeteer)
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  // Don't ship .js.map files to browsers — prevents full source code exposure
  // in DevTools Sources tab. Server-side source maps are unaffected.
  productionBrowserSourceMaps: false,

  // Strip console.* from production client bundles. This catches the ~18
  // direct console calls in shared libs that bypass our logger silencing.
  // Server-side console calls (API routes) are NOT affected.
  compiler: {
    removeConsole: {
      exclude: ['error'], // keep console.error for critical runtime failures
    },
  },

  // Security headers — prevent clickjacking, MIME sniffing, referrer leaks.
  // No strict CSP script-src because renderSlide.ts sets innerHTML imperatively.
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }],
};

export default nextConfig;
