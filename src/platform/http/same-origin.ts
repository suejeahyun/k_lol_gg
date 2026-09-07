export function hasSameOrigin(request: Request, configuredPublicOrigin?: string) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    const expectedOrigin = configuredPublicOrigin
      ? new URL(configuredPublicOrigin).origin
      : new URL(request.url).origin;
    // A browser Origin header is the serialized origin itself, never a URL
    // with a path, query, or fragment. Exact comparison rejects non-browser
    // spellings that URL().origin would otherwise silently canonicalize.
    return suppliedOrigin === expectedOrigin;
  } catch {
    return false;
  }
}
