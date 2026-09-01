const INTERNAL_ORIGIN = "https://internal.klol.invalid";

export function normalizeInternalNext(
  value: string | string[] | undefined,
  fallback = "/admin",
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    !candidate ||
    candidate.length > 2_048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\u0000-\u001f\u007f\\]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || parsed.username || parsed.password) return fallback;

    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath.includes("\\") || decodedPath.startsWith("//")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
