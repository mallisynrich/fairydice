import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Generate a cryptographically strong nonce in the Edge runtime.
 * We avoid Node Buffer here; Edge provides crypto.getRandomValues.
 */
function nonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  // Base64 encode without Buffer:
  // Turn bytes -> string, then btoa to base64.
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

/**
 * Build a conservative CSP using our per-request nonce.
 * Note: We still allow 'unsafe-inline' during early dev (can be removed later).
 * Tighten as integrations (Discord, analytics, CDNs) are added.
 */
function buildCSP(n: string, extraConnect: string[] = []) {
  const directives = [
    "default-src 'self'",
    // Allow inline/nonce scripts during bootstrap; prefer migrating to nonce-only.
    `script-src 'self' 'nonce-${n}' 'unsafe-inline' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    ["connect-src 'self'", ...extraConnect].join(" "),
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/**
 * Small helper: should we skip middleware work for this path?
 * We bypass _next assets, static files, favicon, and health checks.
 */
function isBypassedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/api/health"
  );
}

export function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  if (isBypassedPath(path)) {
    return NextResponse.next();
  }

  // Generate per-request nonce
  const n = nonce();

  // Prepare response and propagate request headers if needed later
  const res = NextResponse.next();

  // Security headers (align with next.config.mjs where possible)
  const corsOrigins =
    (req.headers.get("x-cors-origin-override") ??
      process.env.CORS_ORIGIN ??
      "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const csp = buildCSP(n, corsOrigins);

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");

  // Pass nonce to the app for inline <script> tags in _document.tsx
  // Example usage in _document: <script nonce={nonce} dangerouslySetInnerHTML={{__html: "..."}}
  res.headers.set("x-nonce", n);

  // Attach a request id if not present (useful in logs)
  if (!req.headers.get("x-request-id")) {
    res.headers.set("x-request-id", crypto.randomUUID());
  }

  // --- Future hook: lightweight auth gating / feature flags ---
  // const isAuthed = Boolean(req.cookies.get("auth")?.value);
  // if (!isAuthed && path.startsWith("/user")) {
  //   return NextResponse.redirect(new URL("/guest", req.url));
  // }

  return res;
}

/**
 * Only run middleware for "application paths":
 * - Skip static assets, _next, favicon, health, etc.
 */
export const config = {
  matcher: [
    // Everything except the excluded patterns
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health|static).*)",
  ],
};
