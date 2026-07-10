import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
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
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ddragon.leagueoflegends.com", pathname: "/**" },
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
      { protocol: "https", hostname: "img.youtube.com", pathname: "/**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/**" },
    ],
  },

  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "bmp-js",
    "idb-keyval",
    "is-url",
    "node-fetch",
    "regenerator-runtime",
    "wasm-feature-detect",
    "zlibjs",
  ],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  outputFileTracingIncludes: {
    "/api/matches/import-lol-result": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
};

export default nextConfig;
