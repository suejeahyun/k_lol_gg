import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { completeRiotRsoVerification } from "@/lib/riot/rso";
import { getRiotRequestMeta } from "@/lib/riot/account-link";

function redirectTo(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin));
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("riot");
  if (premiumLock) return premiumLock;

  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  const state = req.nextUrl.searchParams.get("state")?.trim() ?? "";
  const error = req.nextUrl.searchParams.get("error")?.trim() ?? "";
  const fallback = "/me/riot";

  if (error) {
    const message = req.nextUrl.searchParams.get("error_description")?.trim() || "Riot 로그인에서 인증이 취소되었거나 실패했습니다.";
    return redirectTo(req, `${fallback}?rso=error&message=${encodeURIComponent(message)}`);
  }

  if (!code || !state) {
    return redirectTo(req, `${fallback}?rso=error&message=${encodeURIComponent("Riot 본인 인증 응답이 올바르지 않습니다.")}`);
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return redirectTo(req, `${fallback}?rso=error&message=${encodeURIComponent("로그인 세션이 만료되었습니다. 다시 로그인 후 시도해주세요.")}`);
    }

    if (user.status !== "APPROVED") {
      return redirectTo(req, `${fallback}?rso=error&message=${encodeURIComponent("관리자 승인 후 이용 가능합니다.")}`);
    }

    const meta = getRiotRequestMeta(req);
    const result = await completeRiotRsoVerification({
      code,
      state,
      currentUserAccountId: user.userAccountId,
      currentPlayerId: user.playerId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return redirectTo(req, result.redirectTo);
  } catch (err: unknown) {
    logServerError("[RIOT_RSO_CALLBACK_ERROR]", err);
    return redirectTo(req, `${fallback}?rso=error&message=${encodeURIComponent("Riot 본인 인증 처리 중 오류가 발생했습니다.")}`);
  }
}
