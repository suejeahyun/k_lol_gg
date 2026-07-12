import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import {
  getSiteSettings,
  isSiteFeatureEnabled,
  type SiteFeatureKey,
} from "@/lib/site/settings";
import { getDeployEnvWarnings } from "@/lib/security/deploy-env";

const LOG_PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const pageParam = req.nextUrl.searchParams.get("page");
    const page = pageParam ? Math.max(Number(pageParam), 1) : 1;
    const skip = (page - 1) * LOG_PAGE_SIZE;

    const [
      currentSeason,
      playerCount,
      matchCount,
      latestMatch,
      pendingUserCount,
      todayParticipationCount,
      riotFailureCount,
      activeRecruitCount,
      todayKakaoLogCount,
      recentErrors,
      logs,
      totalLogCount,
      siteSettings,
    ] = await Promise.all([
      prisma.season.findFirst({
        where: { isActive: true },
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      }),

      prisma.player.count(),

      prisma.matchSeries.count(),

      prisma.matchSeries.findFirst({
        orderBy: { matchDate: "desc" },
        select: {
          id: true,
          title: true,
          matchDate: true,
        },
      }),

      prisma.userAccount.count({ where: { status: "PENDING" } }),

      prisma.seasonParticipationApply.count({
        where: {
          status: "APPLIED",
          applyDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),

      prisma.adminLog.count({
        where: {
          action: { startsWith: "RIOT_" },
          message: { contains: "실패", mode: "insensitive" },
        },
      }),

      prisma.recruitParty.count({
        where: {
          status: "IN_PROGRESS",
        },
      }).catch(() => 0),

      prisma.recruitPartyLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }).catch(() => 0),

      prisma.adminLog.findMany({
        where: {
          OR: [
            { action: { contains: "ERROR", mode: "insensitive" } },
            { action: { contains: "FAIL", mode: "insensitive" } },
            { message: { contains: "오류", mode: "insensitive" } },
            { message: { contains: "실패", mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, action: true, message: true, createdAt: true },
      }),

      prisma.adminLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: LOG_PAGE_SIZE,
        select: {
          id: true,
          action: true,
          message: true,
          createdAt: true,
        },
      }),

      prisma.adminLog.count(),

      getSiteSettings(),
    ]);

    const featureKeys: SiteFeatureKey[] = ["kakao", "recruit", "balanceAi", "randomTeam", "riot"];
    const featureStates = featureKeys.map((feature) => ({
      feature,
      enabled: isSiteFeatureEnabled(siteSettings, feature),
    }));
    const deployWarnings = getDeployEnvWarnings();

    return NextResponse.json({
      currentSeason,
      playerCount,
      matchCount,
      pendingUserCount,
      todayParticipationCount,
      riotFailureCount,
      activeRecruitCount,
      todayKakaoLogCount,
      siteSettings: {
        siteName: siteSettings.siteName,
        roomName: siteSettings.roomName,
        planStatus: siteSettings.planStatus,
        themePreset: siteSettings.themePreset,
        trialEndsAt: siteSettings.trialEndsAt,
        billingOwner: siteSettings.billingOwner,
        featureStates,
        lockedFeatureCount: featureStates.filter((item) => !item.enabled).length,
        envReady: {
          superAdmin: Boolean(process.env.SUPER_ADMIN_ID),
          database: Boolean(process.env.DATABASE_URL),
          riotKey: Boolean(process.env.RIOT_API_KEY || process.env.RIOT_API_TOKEN),
          deployReady: deployWarnings.length === 0,
          deployWarnings,
        },
      },
      recentErrors: recentErrors.map((log) => ({
        id: log.id,
        action: log.action,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
      latestMatch: latestMatch
        ? {
            id: latestMatch.id,
            title: latestMatch.title,
            playedAt: latestMatch.matchDate.toISOString(),
          }
        : null,
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
      logPagination: {
        page,
        pageSize: LOG_PAGE_SIZE,
        totalCount: totalLogCount,
        totalPages: Math.max(Math.ceil(totalLogCount / LOG_PAGE_SIZE), 1),
      },
    });
  } catch (error) {
    logServerError("[ADMIN_DASHBOARD_GET_ERROR]", error);

    return NextResponse.json(
      { message: "관리자 대시보드 조회 실패" },
      { status: 500 }
    );
  }
}
