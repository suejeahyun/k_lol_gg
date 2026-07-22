export function buildContentSecurityPolicy(isProduction: boolean) {
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
    isProduction
      ? "connect-src 'self'"
      : "connect-src 'self' https: ws: wss:",
    "worker-src 'self' blob:",
    "media-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function getSecurityHeaderEntries(isProduction: boolean) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Origin-Agent-Cluster", value: "?1" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isProduction),
    },
  ];
}
