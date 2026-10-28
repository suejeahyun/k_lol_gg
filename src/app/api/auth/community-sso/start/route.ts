import { NextRequest, NextResponse } from "next/server";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { normalizeAccountNext, normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";
import { COMMUNITY_SSO_CALLBACK_PATH, COMMUNITY_SSO_FLOW_SECONDS } from "@/modules/auth/domain/community-sso";
import { communitySsoChallenge, encodeCommunitySsoFlow, newCommunitySsoToken } from "@/modules/auth/infrastructure/community-sso-crypto";
import { managedCommunitySsoRuntime, ssoFlowCookieOptions } from "@/modules/auth/infrastructure/runtime-community-sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (SERVICE_BRAND.id !== "community") return new Response(null, { status: 404 });
  const search = request.nextUrl.searchParams;
  if ([...search.keys()].some((key) => !["next", "purpose"].includes(key)) || ["next", "purpose"].some((key) => search.getAll(key).length > 1)) return new Response(null, { status: 400 });
  const purpose = search.get("purpose") || "ACCOUNT";
  if (purpose !== "ACCOUNT" && purpose !== "ADMIN") return new Response(null, { status: 400 });
  try {
    const config = managedCommunitySsoRuntime();
    const state = newCommunitySsoToken(), verifier = newCommunitySsoToken();
    const nextPath = purpose === "ADMIN" ? normalizeInternalNext(search.get("next") ?? undefined) : normalizeAccountNext(search.get("next") ?? undefined, "/");
    const url = new URL("/sso/authorize", config.hubOrigin);
    url.search = new URLSearchParams({ siteId: config.siteId, callbackUrl: `${config.childOrigin}${COMMUNITY_SSO_CALLBACK_PATH}`, codeChallenge: communitySsoChallenge(verifier), state, purpose }).toString();
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(config.cookieName, await encodeCommunitySsoFlow({ siteId: config.siteId, state, verifier, purpose, nextPath }), ssoFlowCookieOptions(config.childOrigin.startsWith("https:"), COMMUNITY_SSO_FLOW_SECONDS));
    return response;
  } catch { return NextResponse.json({ message: "GG HUB 로그인을 준비할 수 없습니다. 운영팀에 문의해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
