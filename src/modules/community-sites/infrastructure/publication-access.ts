import "server-only";
import type { NextRequest } from "next/server";
import { getRuntimeSessionFromToken, sessionCookieName } from "@/modules/auth/infrastructure/runtime-session";
import { isPublicCommunityPreviewRequest, mayAccessCommunityPreview } from "../domain/publication-access";
import { readRuntimeCommunitySiteConfiguration } from "./runtime-site-configuration";

export async function requireCommunityPublicationAccess(request: NextRequest): Promise<Response | null> {
  const pathname = request.nextUrl.pathname;
  if (isPublicCommunityPreviewRequest(pathname, request.method, process.env.NODE_ENV === "development")) return null;
  try {
    const runtime = await readRuntimeCommunitySiteConfiguration();
    if (!runtime) throw new Error("Missing runtime");
    if (runtime.publicationState === "ACTIVE") return null;
    for (const purpose of ["ACCOUNT", "ADMIN"] as const) {
      const session = await getRuntimeSessionFromToken(request.cookies.get(sessionCookieName(purpose))?.value, purpose);
      if (mayAccessCommunityPreview(runtime.ownerUserAccountId, session)) return null;
    }
    const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
    if (pathname.startsWith("/api/")) return Response.json({ code: "COMMUNITY_AWAITING_OWNER", message: "소유자의 공개 확인을 기다리는 사이트입니다." }, { status: 403, headers });
    return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사이트 공개 준비 중</title><body style="font-family:sans-serif;background:#10141f;color:#edf1ff;padding:8vw"><h1>사이트 공개 준비 중</h1><p>소유자가 사이트를 확인하고 있습니다. 공개 후 다시 방문해 주세요.</p><a style="color:#9fc8ff" href="/login">소유자 로그인</a></body></html>', { status: 403, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return Response.json({ code: "COMMUNITY_CONFIGURATION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
