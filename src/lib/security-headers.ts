import { NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

export function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https://ddragon.leagueoflegends.com https://drive.google.com https://img.youtube.com https://i.ytimg.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "media-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Origin-Agent-Cluster", "?1");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  return response;
}
