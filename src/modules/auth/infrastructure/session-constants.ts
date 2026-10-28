import { SERVICE_BRAND } from "@/lib/service-brand";

export const ADMIN_SESSION_COOKIE_NAME = SERVICE_BRAND.id === "community"
  ? `gg_community_${SERVICE_BRAND.communityId}_session`
  : { klol: "klol_v2_session", nexus: "nexus_session", hub: "gg_hub_session" }[SERVICE_BRAND.id];
export const ACCOUNT_SESSION_COOKIE_NAME = SERVICE_BRAND.id === "community"
  ? `gg_community_${SERVICE_BRAND.communityId}_account_session`
  : { klol: "klol_v2_account_session", nexus: "nexus_account_session", hub: "gg_hub_account_session" }[SERVICE_BRAND.id];
// Backward-compatible name for the administrator elevation cookie.
export const SESSION_COOKIE_NAME = ADMIN_SESSION_COOKIE_NAME;

export function sessionCookieName(purpose: "ACCOUNT" | "ADMIN") {
  return purpose === "ACCOUNT" ? ACCOUNT_SESSION_COOKIE_NAME : ADMIN_SESSION_COOKIE_NAME;
}
export const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 60;
export const ACCOUNT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// Kept as the administrator default for existing callers. Account sessions
// must opt into the longer purpose-bound lifetime explicitly.
export const SESSION_MAX_AGE_SECONDS = ADMIN_SESSION_MAX_AGE_SECONDS;

export function sessionMaximumAgeSeconds(purpose: "ACCOUNT" | "ADMIN") {
  return purpose === "ACCOUNT"
    ? ACCOUNT_SESSION_MAX_AGE_SECONDS
    : ADMIN_SESSION_MAX_AGE_SECONDS;
}
