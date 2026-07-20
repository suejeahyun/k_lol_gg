import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { createRiotRsoAuthorizeUrl, getRiotRsoStatus } from "@/lib/riot/rso";

function safeReturnTo(value: string | null) {
  const text = (value ?? "").trim();
  if (!text || !text.startsWith("/") || text.startsWith("//") || text.startsWith("/api/")) return "/me/riot";
  return text;
}

function redirectWithMessage(req: NextRequest, returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, req.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("riot");
  if (premiumLock) return premiumLock;

  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));

  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return redirectWithMessage(req, returnTo, {
        rso: "error",
        message: "연결된 플레이어가 없어 Riot 본인 인증을 시작할 수 없습니다.",
      });
    }

    const rsoStatus = getRiotRsoStatus();
    if (!rsoStatus.enabled) {
      return redirectWithMessage(req, returnTo, {
        rso: "error",
        message: rsoStatus.message,
      });
    }

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "RIOT_RSO_START",
      limit: 8,
      windowSeconds: 10 * 60,
      key: String(user.userAccountId),
    });
    if (rateLimitRejected) return rateLimitRejected;

    const authorizeUrl = await createRiotRsoAuthorizeUrl({
      userAccountId: user.userAccountId,
      playerId: user.playerId,
      returnTo,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return redirectWithMessage(req, returnTo, { rso: "error", message: "로그인이 필요합니다." });
      }
      if (error.message === "NOT_APPROVED") {
        return redirectWithMessage(req, returnTo, { rso: "error", message: "관리자 승인 후 이용 가능합니다." });
      }
      logServerError("[RIOT_RSO_START_ERROR]", error);
      return redirectWithMessage(req, returnTo, { rso: "error", message: "Riot 본인 인증 시작 중 오류가 발생했습니다." });
    }

    logServerError("[RIOT_RSO_START_ERROR]", error);
    return redirectWithMessage(req, returnTo, { rso: "error", message: "Riot 본인 인증 시작 중 오류가 발생했습니다." });
  }
}
