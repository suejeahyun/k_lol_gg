import { NextRequest, NextResponse } from "next/server";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { COMMUNITY_ACCOUNT_PRIVACY_VERSION as ACCOUNT_PRIVACY_VERSION, COMMUNITY_ACCOUNT_TERMS_VERSION as ACCOUNT_TERMS_VERSION } from "@/modules/accounts/domain/account-policies";
import { normalizeAccountNext, normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";
import { COMMUNITY_SSO_CALLBACK_PATH, SSO_TOKEN_PATTERN } from "@/modules/auth/domain/community-sso";
import { decodeCommunitySsoFlow } from "@/modules/auth/infrastructure/community-sso-crypto";
import { communitySsoRepository, managedCommunitySsoRuntime, ssoFlowCookieOptions } from "@/modules/auth/infrastructure/runtime-community-sso";
import { issueRuntimeSession, sessionCookieName, sessionCookieOptions } from "@/modules/auth/infrastructure/runtime-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (SERVICE_BRAND.id !== "community") return new Response(null, { status: 404 });
  let config;
  try { config = managedCommunitySsoRuntime(); } catch { return NextResponse.json({ message: "로그인 연결 설정을 확인할 수 없습니다." }, { status: 503 }); }
  const finish = (response: NextResponse) => {
    response.cookies.set(config.cookieName, "", ssoFlowCookieOptions(config.childOrigin.startsWith("https:"), 0));
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const failed = () => finish(NextResponse.redirect(new URL("/login?sso=failed", config.childOrigin), 303));
  const search = request.nextUrl.searchParams;
  if ([...search.keys()].some((key) => !["code", "state"].includes(key)) || ["code", "state"].some((key) => search.getAll(key).length !== 1)) return failed();
  const code = search.get("code")!, state = search.get("state")!;
  if (!SSO_TOKEN_PATTERN.test(code) || !SSO_TOKEN_PATTERN.test(state)) return failed();
  const flow = await decodeCommunitySsoFlow(request.cookies.get(config.cookieName)?.value, config.siteId);
  if (!flow || flow.state !== state) return failed();
  try {
    const response = await fetch(`${config.hubOrigin}/api/auth/community-sso/exchange`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.clientSecret}` },
      body: JSON.stringify({ siteId: config.siteId, code, verifier: flow.verifier, callbackUrl: `${config.childOrigin}${COMMUNITY_SSO_CALLBACK_PATH}` }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return failed();
    const text = await response.text(); if (text.length > 4096) return failed();
    const identity = JSON.parse(text) as Record<string, unknown>;
    if (identity.issuer !== config.hubOrigin || identity.siteId !== config.siteId || identity.purpose !== flow.purpose
      || typeof identity.subject !== "string" || !/^[0-9a-f-]{36}$/u.test(identity.subject)
      || identity.termsVersion !== ACCOUNT_TERMS_VERSION || identity.privacyVersion !== ACCOUNT_PRIVACY_VERSION) return failed();
    const local = await communitySsoRepository().resolveLocalAccount({ issuer: config.hubOrigin, subject: identity.subject, purpose: flow.purpose });
    const token = await issueRuntimeSession(local.seed);
    const next = flow.purpose === "ADMIN" ? normalizeInternalNext(flow.nextPath) : normalizeAccountNext(flow.nextPath, "/");
    const destination = local.needsProfile && flow.purpose === "ACCOUNT" ? `/account/community-profile?next=${encodeURIComponent(next)}` : next;
    // A cross-site redirect chain still withholds a newly issued Strict cookie.
    // Commit a same-origin document before navigating; keep durable sessions Strict.
    const destinationJson = JSON.stringify(new URL(destination, config.childOrigin).href).replaceAll("<", "\\u003c");
    const result = new NextResponse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 완료</title><body><p>로그인되었습니다. 사이트로 이동하고 있습니다.</p><a id="continue" href="/">사이트로 이동</a><script>const destination=${destinationJson};document.getElementById("continue").href=destination;window.location.replace(destination);</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    result.cookies.set(sessionCookieName(flow.purpose), token, sessionCookieOptions(config.childOrigin.startsWith("https:"), process.env.NODE_ENV, flow.purpose));
    return finish(result);
  } catch { return failed(); }
}
