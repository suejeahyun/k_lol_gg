type SafeNextOptions = {
  fallback?: string;
};

export function safeLocalNextPath(value?: string | string[], options: SafeNextOptions = {}) {
  const fallback = options.fallback ?? "/";
  const rawValue = Array.isArray(value) ? value[0] : value;
  const candidate = rawValue?.trim();
  if (!candidate || !candidate.startsWith("/")) return fallback;

  try {
    const baseOrigin = "https://klol.local";
    const target = new URL(candidate, baseOrigin);
    if (target.origin !== baseOrigin) return fallback;

    const pathname = target.pathname.toLowerCase();
    if (pathname === "/api" || pathname.startsWith("/api/")) return fallback;
    if (pathname === "/login" || pathname.startsWith("/login/")) return fallback;
    if (pathname === "/app/login" || pathname.startsWith("/app/login/")) return fallback;

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
