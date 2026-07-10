import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getKakaoStatsDashboardData } from "@/lib/kakao/kakao-stats-dashboard-data";
import { requireSiteFeature } from "@/lib/site/feature-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  const days = Number(request.nextUrl.searchParams.get("days") ?? "30");
  const data = await getKakaoStatsDashboardData({ days });
  return NextResponse.json(data);
}
