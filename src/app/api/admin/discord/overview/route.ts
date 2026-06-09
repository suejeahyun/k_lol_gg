export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getDiscordOperationSettings } from "@/lib/discord/settings";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const now = new Date();
  const recentSince = new Date(now.getTime() - 1000 * 60 * 60 * 6);
  const settings = await getDiscordOperationSettings();
  const staleSince = new Date(now.getTime() - settings.staleHeartbeatSeconds * 1000);

  const [
    approvedUsers,
    linkedUsers,
    recentEvents,
    recentUnlinkedEvents,
    heartbeats,
    activeMonitors,
    linkLogs,
  ] = await Promise.all([
    prisma.userAccount.count({ where: { status: "APPROVED" } }),
    prisma.userAccount.count({ where: { discordId: { not: null } } }),
    prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: recentSince } }, orderBy: { occurredAt: "desc" }, take: 200, include: { userAccount: { select: { id: true, userId: true, discordServerNickname: true, discordGlobalName: true, discordUsername: true, player: { select: { name: true, nickname: true, tag: true } } } } } }),
    prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: recentSince }, userAccountId: null }, orderBy: { occurredAt: "desc" }, take: 50 }),
    prisma.discordBotHeartbeat.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.recruitPartyDiscordMonitor.findMany({ where: { status: { in: ["ACTIVE", "FINISH_CANDIDATE"] } }, orderBy: { updatedAt: "desc" }, take: 20, include: { party: { select: { id: true, recruitNo: true, title: true, type: true, status: true } } } }),
    prisma.discordAccountLinkLog.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { userAccount: { select: { userId: true, player: { select: { name: true, nickname: true, tag: true } } } } } }),
  ]);

  const lastByDiscord = new Map<string, (typeof recentEvents)[number]>();
  for (const event of recentEvents) {
    if (!lastByDiscord.has(event.discordId)) lastByDiscord.set(event.discordId, event);
  }
  const currentVoiceUsers = [...lastByDiscord.values()].filter((event) => event.eventType !== "LEAVE");

  return NextResponse.json({
    ok: true,
    summary: {
      approvedUsers,
      linkedUsers,
      unlinkedApprovedUsers: Math.max(0, approvedUsers - linkedUsers),
      linkRate: approvedUsers > 0 ? Math.round((linkedUsers / approvedUsers) * 1000) / 10 : 0,
      recentEventCount: recentEvents.length,
      currentVoiceUserCount: currentVoiceUsers.length,
      currentLinkedVoiceUserCount: currentVoiceUsers.filter((event) => event.userAccountId).length,
      currentUnlinkedVoiceUserCount: currentVoiceUsers.filter((event) => !event.userAccountId).length,
      activeMonitorCount: activeMonitors.length,
      healthyBotCount: heartbeats.filter((bot) => bot.updatedAt >= staleSince).length,
    },
    settings,
    heartbeats,
    currentVoiceUsers,
    recentUnlinkedEvents,
    activeMonitors,
    linkLogs,
    serverTime: now.toISOString(),
  });
}
