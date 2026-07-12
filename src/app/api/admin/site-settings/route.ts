import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { getSiteSettings, saveSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const settings = await getSiteSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(request: Request) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const settings = await saveSiteSettings({
    siteName: body.siteName,
    roomName: body.roomName,
    siteLogoUrl: body.siteLogoUrl,
    homeBackgroundUrl: body.homeBackgroundUrl,
    themePreset: body.themePreset,
    planStatus: body.planStatus,
    kakaoEnabled: body.kakaoEnabled,
    recruitEnabled: body.recruitEnabled,
    balanceAiEnabled: body.balanceAiEnabled,
    randomTeamEnabled: body.randomTeamEnabled,
    riotEnabled: body.riotEnabled,
    billingOwner: body.billingOwner,
    trialEndsAt: body.trialEndsAt,
    premiumMemo: body.premiumMemo,
    premiumNoticeTitle: body.premiumNoticeTitle,
    premiumNoticeMessage: body.premiumNoticeMessage,
    supportContact: body.supportContact,
  });

  return NextResponse.json({ ok: true, settings });
}
