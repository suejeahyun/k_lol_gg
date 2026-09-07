import { containsUnsafeText } from "@/platform/security/input-safety";

const INTERNAL_ORIGIN = "https://internal.klol.invalid";

export function normalizeInternalNext(
  value: string | string[] | undefined,
  fallback = "/admin",
) {
  const candidate = Array.isArray(value) ? undefined : value;
  if (
    !candidate ||
    candidate.length > 2_048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    containsUnsafeText(candidate) ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || parsed.username || parsed.password) return fallback;

    const decodedPath = decodeURIComponent(parsed.pathname);
    const decodedUrl = decodeURIComponent(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    if (
      decodedPath.includes("\\") ||
      decodedPath.startsWith("//") ||
      containsUnsafeText(decodedUrl)
    ) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function normalizeAccountNext(
  value: string | string[] | undefined,
  fallback = "/account",
) {
  // Duplicate `next` values are ambiguous and must not use first-value wins.
  if (Array.isArray(value)) return fallback;
  const normalized = normalizeInternalNext(value, fallback);
  if (normalized === fallback && value !== fallback) return fallback;

  try {
    const parsed = new URL(normalized, INTERNAL_ORIGIN);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath === "/admin" || decodedPath.startsWith("/admin/")) return fallback;
    return normalized;
  } catch {
    return fallback;
  }
}
