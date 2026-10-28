import "server-only";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { getDatabase } from "@/platform/db/client";
import { COMMUNITY_SSO_CALLBACK_PATH, parseCommunitySsoRequest, ssoOrigin, SSO_TOKEN_PATTERN } from "../domain/community-sso";
import { PostgresCommunitySso } from "./postgres-community-sso";

export function communitySsoRepository() { return new PostgresCommunitySso(getDatabase()); }
export function managedCommunitySsoRuntime() {
  if (SERVICE_BRAND.id !== "community" || !SERVICE_BRAND.communityId) throw new Error("SSO_UNAVAILABLE");
  const clientSecret = process.env.COMMUNITY_HUB_CLIENT_SECRET;
  if (!clientSecret || !SSO_TOKEN_PATTERN.test(clientSecret)) throw new Error("SSO_UNAVAILABLE");
  const allowLocal = process.env.NODE_ENV !== "production";
  return {
    siteId: SERVICE_BRAND.communityId,
    hubOrigin: ssoOrigin(process.env.COMMUNITY_HUB_ORIGIN, allowLocal),
    childOrigin: ssoOrigin(process.env.NEXT_PUBLIC_SITE_URL, allowLocal),
    clientSecret,
    cookieName: `gg_community_${SERVICE_BRAND.communityId}_sso_flow`,
  };
}
export function hubSsoOrigin() { return ssoOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV !== "production"); }
export function readCommunitySsoQuery(search: URLSearchParams) {
  const keys = ["siteId", "callbackUrl", "codeChallenge", "state", "purpose"];
  if ([...search.keys()].some((key) => !keys.includes(key)) || keys.some((key) => search.getAll(key).length !== 1)) return null;
  return parseCommunitySsoRequest(Object.fromEntries(search));
}
export function ssoFlowCookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: COMMUNITY_SSO_CALLBACK_PATH, maxAge };
}
