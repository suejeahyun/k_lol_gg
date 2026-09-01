export function hasSameOrigin(request: Request, configuredPublicOrigin?: string) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    const expectedOrigin = configuredPublicOrigin
      ? new URL(configuredPublicOrigin).origin
      : new URL(request.url).origin;
    return new URL(suppliedOrigin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
