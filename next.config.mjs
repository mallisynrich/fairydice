/**
 * FairyDice Next.js configuration
 *
 * - Enforces Content Security Policy (CSP) headers
 * - Restricts allowed image domains
 * - Pulls values from environment variables (.env/.env.local)
 * - Keeps future hooks open for i18n, redirects, rewrites, etc.
 */

import { createHash } from "crypto";

/**
 * Generate a CSP header string. This version uses strict defaults
 * but allows NEXT_PUBLIC_* domains or ENV-configured origins to pass.
 */
function buildCSP() {
  // Default-src: self only.
  let csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // Allow CORS origins from env.
  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(",");
    origins.forEach((origin) => {
      csp.push(`connect-src ${origin.trim()}`);
    });
  }

  return csp.join("; ");
}

const nextConfig = {
  reactStrictMode: true,

  /**
   * Security headers (applied at every route).
   * Note: These headers are additive; in production
   * you may need reverse proxy alignment (nginx, Caddy).
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildCSP(),
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },

  /**
   * Image domains:
   * - Localhost for dev
   * - PlayCanvas CDN (if you host textures/assets there)
   * - Add more via NEXT_IMAGE_DOMAINS env (comma-separated)
   */
  images: {
    domains: [
      "localhost",
      "127.0.0.1",
      "playcanvas.com",
      ...(process.env.NEXT_IMAGE_DOMAINS
        ? process.env.NEXT_IMAGE_DOMAINS.split(",")
        : []),
    ],
  },

  /**
   * Experimental toggles, ready for future upgrades
   */
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },
};

export default nextConfig;
