export const COMMUNITY_SSO_CALLBACK_PATH = "/api/auth/community-sso/callback";
export const COMMUNITY_SSO_CODE_LIFETIME_MS = 60_000;
export const COMMUNITY_SSO_FLOW_SECONDS = 10 * 60;
export const SSO_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type CommunitySsoPurpose = "ACCOUNT" | "ADMIN";
export type CommunitySsoRequest = Readonly<{
  siteId: string;
  callbackUrl: string;
  codeChallenge: string;
  state: string;
  purpose: CommunitySsoPurpose;
}>;

export function ssoOrigin(value: string | undefined, allowLocal = false): string {
  if (!value) throw new Error("SSO_ORIGIN_UNAVAILABLE");
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("SSO_ORIGIN_INVALID");
  }
  return url.origin;
}

export function parseCommunitySsoRequest(value: unknown): CommunitySsoRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "callbackUrl,codeChallenge,purpose,siteId,state") return null;
  if (typeof record.siteId !== "string" || !uuidPattern.test(record.siteId)
    || typeof record.callbackUrl !== "string" || record.callbackUrl.length > 500
    || typeof record.codeChallenge !== "string" || !SSO_TOKEN_PATTERN.test(record.codeChallenge)
    || typeof record.state !== "string" || !SSO_TOKEN_PATTERN.test(record.state)
    || (record.purpose !== "ACCOUNT" && record.purpose !== "ADMIN")) return null;
  try {
    const callback = new URL(record.callbackUrl);
    if (callback.pathname !== COMMUNITY_SSO_CALLBACK_PATH || callback.search || callback.hash || callback.username || callback.password) return null;
    if (callback.protocol !== "https:" && callback.protocol !== "http:") return null;
  } catch { return null; }
  return record as CommunitySsoRequest;
}

export function communitySsoSiteAllowsAccount(site: { status: string; ownerUserAccountId: string }, userId: string): boolean {
  return site.status === "ACTIVE" || (["AWAITING_OWNER", "ACTIVATING"].includes(site.status) && site.ownerUserAccountId === userId);
}

export function communitySsoCallbackMatches(origin: string | null, callbackUrl: string): boolean {
  if (!origin) return false;
  try { return callbackUrl === `${ssoOrigin(origin)}${COMMUNITY_SSO_CALLBACK_PATH}`; }
  catch { return false; }
}
