import { isIP } from "node:net";

type HeaderReader = Pick<Headers, "get">;
type RateLimitRuntimeEnvironment = Readonly<{ VERCEL?: string }>;

const SHARED_UNTRUSTED_PROXY_KEY = "shared-untrusted-proxy";
const UNKNOWN_VERCEL_CLIENT_KEY = "unknown-vercel-client";

export function resolveRateLimitClientKey(
  headers: HeaderReader,
  environment: RateLimitRuntimeEnvironment = { VERCEL: process.env.VERCEL },
): string {
  if (environment.VERCEL !== "1") return SHARED_UNTRUSTED_PROXY_KEY;

  const value = headers.get("x-vercel-forwarded-for");
  if (!value || value.length > 128) return UNKNOWN_VERCEL_CLIENT_KEY;
  const candidate = value.split(",", 1)[0]?.trim() ?? "";
  return isIP(candidate) === 0 ? UNKNOWN_VERCEL_CLIENT_KEY : candidate;
}
