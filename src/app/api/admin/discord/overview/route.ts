export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getDiscordOperationSettings } from "@/lib/discord/settings";

function normalizeName(value: string | null | undefined) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s#·ㆍ_\-\.\/\\|()[\]{}]+/g, "")
    .toLowerCase();
}

function isNonEmptyName(value: string | null | undefined) {
  return String(value || "").trim() !== "";
}

function isAgeToken(token: string) {
  const value = token.trim().toLowerCase();
  return /^\d{2,4}$/.test(value)
    || /^\d{2,4}년생$/.test(value)
    || /^\d{2}년$/.test(value)
    || /^(19|20)\d{2}$/.test(value);
}

function isLineToken(token: string) {
  return /^[a-z]{1,4}\([a-z]{1,4}\)$/i.test(token.trim()) || /^[탑정글미드원딜서폿올라운더]{1,6}$/i.test(token.trim());
}

function isKoreanNameToken(token: string) {
  const value = token.trim();
  if (isAgeToken(value) || isLineToken(value)) return false;
  return /^[가-힣]{2,4}$/.test(value);
}

function getVoiceUserDisplay(event: {
  discordId: string;
  memberDisplayName: string | null;
  memberNickname: string | null;
  discordGlobalName: string | null;
  discordUsername: string | null;
}) {
  return event.memberDisplayName || event.memberNickname || event.discordGlobalName || event.discordUsername || `Discord ${event.discordId.slice(-4)}`;
}

function extractPossibleNamesFromDiscordName(displayName: string) {
  const tokens = String(displayName || "")
    .replace(/[\[\]{}()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const names: string[] = [];
  if (tokens.length >= 2 && isAgeToken(tokens[0]) && isKoreanNameToken(tokens[1])) names.push(tokens[1]);
  if (tokens.length >= 1 && isKoreanNameToken(tokens[0])) names.push(tokens[0]);
  for (const token of tokens) {
    if (isKoreanNameToken(token)) names.push(token);
  }
  return new Set(Array.from(new Set(names.map(normalizeName).filter(Boolean))));
}

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
    inProgressParties,
  ] = await Promise.all([
    prisma.userAccount.count({ where: { status: "APPROVED" } }),
    prisma.userAccount.count({ where: { discordId: { not: null } } }),
    prisma.discordVoiceEvent.findMany({
      where: { occurredAt: { gte: recentSince } },
      orderBy: { occurredAt: "desc" },
      take: 300,
      include: {
        userAccount: {
          select: {
            id: true,
            userId: true,
            discordServerNickname: true,
            discordGlobalName: true,
            discordUsername: true,
            player: { select: { name: true, nickname: true, tag: true } },
          },
        },
      },
    }),
    prisma.discordVoiceEvent.findMany({ where: { occurredAt: { gte: recentSince }, userAccountId: null }, orderBy: { occurredAt: "desc" }, take: 80 }),
    prisma.discordBotHeartbeat.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.recruitPartyDiscordMonitor.findMany({
      where: { status: { in: ["ACTIVE", "PARTIAL_ACTIVE", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA", "FINISH_CANDIDATE", "DISCORD_LINK_INCOMPLETE", "RECRUIT_NOT_FULL", "WAITING"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { party: { select: { id: true, recruitNo: true, title: true, type: true, status: true, maxMembers: true } } },
    }),
    prisma.discordAccountLinkLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { userAccount: { select: { userId: true, player: { select: { name: true, nickname: true, tag: true } } } } },
    }),
    prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
      include: {
        members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
        discordMonitor: true,
      },
    }),
  ]);

  const lastByDiscord = new Map<string, (typeof recentEvents)[number]>();
  for (const event of recentEvents) {
    if (!lastByDiscord.has(event.discordId)) lastByDiscord.set(event.discordId, event);
  }
  const currentVoiceUsers = [...lastByDiscord.values()].filter((event) => event.eventType !== "LEAVE");
  const currentDiscordIds = new Set(currentVoiceUsers.map((event) => event.discordId));
  const currentEventByDiscordId = new Map(currentVoiceUsers.map((event) => [event.discordId, event]));

  const allMemberNames = Array.from(new Set(inProgressParties.flatMap((party) => party.members
    .filter((member) => isNonEmptyName(member.name) && !member.isSubstitute)
    .map((member) => member.name.trim()))));

  const players = allMemberNames.length > 0 ? await prisma.player.findMany({
    where: {
      isActive: true,
      OR: allMemberNames.flatMap((name) => ([
        { name: { equals: name, mode: "insensitive" as const } },
        { nickname: { equals: name, mode: "insensitive" as const } },
      ])),
    },
    include: { userAccount: true },
  }) : [];

  const playerByKey = new Map<string, (typeof players)[number]>();
  for (const player of players) {
    for (const key of [normalizeName(player.name), normalizeName(player.nickname)]) {
      if (key && !playerByKey.has(key)) playerByKey.set(key, player);
    }
  }

  const recruitVerifications = inProgressParties.map((party) => {
    const activeMembers = party.members.filter((member) => isNonEmptyName(member.name) && !member.isSubstitute);
    const nameCount = new Map<string, number>();
    for (const member of activeMembers) {
      const key = normalizeName(member.name);
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    const scopedVoiceUsers = party.discordMonitor?.voiceChannelId
      ? currentVoiceUsers.filter((event) => event.channelId === party.discordMonitor?.voiceChannelId)
      : currentVoiceUsers;
    const scopedVoiceMembers = scopedVoiceUsers.map((event) => ({
      id: event.discordId,
      displayName: getVoiceUserDisplay(event),
      channelName: event.channelName,
      extractedNames: extractPossibleNamesFromDiscordName(getVoiceUserDisplay(event)),
    }));
    const scopedDiscordIds = new Set(scopedVoiceMembers.map((event) => event.id));
    const usedDiscordIds = new Set<string>();

    const participantChecks = activeMembers.map((member) => {
      const key = normalizeName(member.name);
      const player = playerByKey.get(key);
      const discordId = player?.userAccount?.discordId || null;
      const currentEvent = discordId ? currentEventByDiscordId.get(discordId) : null;
      const directlyPresent = Boolean(discordId && scopedDiscordIds.has(discordId));
      if (directlyPresent && discordId) usedDiscordIds.add(discordId);
      return {
        name: member.name.trim(),
        playerLabel: player ? `${player.name || "-"} / ${player.nickname}#${player.tag}` : null,
        discordId,
        linked: Boolean(discordId),
        present: directlyPresent,
        matchedByName: false,
        matchType: directlyPresent ? "DISCORD_ID" : "NOT_MATCHED",
        matchedDisplayName: directlyPresent ? getVoiceUserDisplay(currentEvent!) : null,
        channelName: currentEvent?.channelName || null,
      };
    });

    for (const check of participantChecks) {
      if (check.present) continue;
      const key = normalizeName(check.name);
      if ((nameCount.get(key) || 0) !== 1) {
        check.matchType = "NAME_AMBIGUOUS";
        continue;
      }
      const candidates = scopedVoiceMembers.filter((voiceUser) => !usedDiscordIds.has(voiceUser.id) && voiceUser.extractedNames.has(key));
      if (candidates.length === 1) {
        const matched = candidates[0];
        usedDiscordIds.add(matched.id);
        check.present = true;
        check.matchedByName = true;
        check.matchType = "NAME_TOKEN";
        check.matchedDisplayName = matched.displayName;
        check.channelName = matched.channelName;
      } else if (candidates.length > 1) {
        check.matchType = "NAME_AMBIGUOUS";
      }
    }

    const recruitFilled = activeMembers.length >= party.maxMembers;
    const presentParticipants = participantChecks.filter((item) => item.present).map((item) => item.matchedByName ? `${item.name} → ${item.matchedDisplayName}` : item.playerLabel || item.name);
    const missingParticipants = participantChecks.filter((item) => !item.present).map((item) => item.playerLabel || item.name);
    const unlinkedParticipants = participantChecks.filter((item) => !item.linked).map((item) => item.name);
    const presentCount = participantChecks.filter((item) => item.present).length;
    const matchedByNameCount = participantChecks.filter((item) => item.matchedByName).length;
    const ambiguousCount = participantChecks.filter((item) => item.matchType === "NAME_AMBIGUOUS").length;

    let status = party.discordMonitor?.status || "WAITING";
    if (party.discordMonitor?.status === "FINISH_CANDIDATE") status = "FINISH_CANDIDATE";
    else if (presentCount > 0) {
      if (recruitFilled && presentCount >= activeMembers.length && activeMembers.length > 0) status = "ASSEMBLED";
      else status = "PARTIAL_ACTIVE";
    }
    else status = party.discordMonitor?.status || "WAITING";

    return {
      partyId: party.id,
      recruitNo: party.recruitNo,
      title: party.title,
      type: String(party.type),
      status,
      partyStatus: String(party.status),
      maxMembers: party.maxMembers,
      activeMemberCount: activeMembers.length,
      linkedCount: participantChecks.filter((item) => item.linked).length,
      presentCount,
      matchedByNameCount,
      ambiguousCount,
      missingCount: missingParticipants.length,
      unlinkedCount: unlinkedParticipants.length,
      voiceChannelId: party.discordMonitor?.voiceChannelId || null,
      monitorStatus: party.discordMonitor?.status || null,
      lastScannedAt: party.discordMonitor?.lastScannedAt?.toISOString() || null,
      finishCandidateStartedAt: party.discordMonitor?.finishCandidateStartedAt?.toISOString() || null,
      autoFinishedAt: party.discordMonitor?.autoFinishedAt?.toISOString() || null,
      autoFinishReason: party.discordMonitor?.autoFinishReason || null,
      presentParticipants,
      missingParticipants,
      unlinkedParticipants,
      participants: participantChecks,
    };
  });

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
      recruitReadyCount: recruitVerifications.filter((item) => ["PARTIAL_ACTIVE", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA"].includes(item.status)).length,
      recruitNeedsCheckCount: recruitVerifications.filter((item) => ["WAITING", "FINISH_CANDIDATE"].includes(item.status) || item.ambiguousCount > 0).length,
    },
    settings,
    heartbeats,
    currentVoiceUsers,
    recentUnlinkedEvents,
    activeMonitors,
    recruitVerifications,
    linkLogs,
    serverTime: now.toISOString(),
  });
}
