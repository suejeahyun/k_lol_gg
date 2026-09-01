type FixtureRuntimeEnvironment = Readonly<{
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  V2_PUBLIC_ORIGIN?: string;
  V2_TEST_AUTH_ENABLED?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
}>;

export function isFixtureAuthEnvironmentEnabled(
  environment: FixtureRuntimeEnvironment,
): boolean {
  if (
    environment.NODE_ENV === "production" ||
    environment.V2_TEST_AUTH_ENABLED !== "true" ||
    environment.VERCEL ||
    environment.VERCEL_ENV ||
    environment.VERCEL_URL
  ) {
    return false;
  }

  const configuredOrigin = environment.V2_PUBLIC_ORIGIN ?? environment.NEXT_PUBLIC_SITE_URL;
  if (!configuredOrigin) return false;

  try {
    const origin = new URL(configuredOrigin);
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
    return (
      (origin.protocol === "http:" || origin.protocol === "https:") &&
      loopbackHosts.has(origin.hostname)
    );
  } catch {
    return false;
  }
}
