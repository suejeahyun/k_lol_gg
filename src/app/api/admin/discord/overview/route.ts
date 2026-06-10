export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getDiscordOperationSettings } from "@/lib/discord/settings";
import { getTodayKstRange, getKstDateKey } from "@/lib/date/kst";

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




type DiscordHeartbeatRow = {
  id: number;
  botId: string;
  status: string;
  botUsername: string | null;
  guildId: string | null;
  uptimeSeconds: number;
  memoryRssMb: number | null;
  watchedChannelCount: number;
  voiceMemberCount: number;
  autoFinishEnabled: boolean;
  lastAutoFinishCheckAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DiscordLinkLogRow = {
  id: number;
  userAccountId: number | null;
  action: string;
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordServerNickname: string | null;
  actorId: number | null;
  actorType: string | null;
  reason: string | null;
  createdAt: Date;
  userId: string | null;
  playerName: string | null;
  playerNickname: string | null;
  playerTag: string | null;
};

async function getDiscordHeartbeatsSafe() {
  try {
    return await prisma.$queryRawUnsafe<DiscordHeartbeatRow[]>(`
      SELECT
        "id", "botId", "status", "botUsername", "guildId",
        "uptimeSeconds", "memoryRssMb", "watchedChannelCount",
        "voiceMemberCount", "autoFinishEnabled", "lastAutoFinishCheckAt",
        "lastError", "createdAt", "updatedAt"
      FROM "DiscordBotHeartbeat"
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `);
  } catch {
    return [] as DiscordHeartbeatRow[];
  }
}

async function getDiscordAccountLinkLogsSafe() {
  try {
    const rows = await prisma.$queryRawUnsafe<DiscordLinkLogRow[]>(`
      SELECT
        l."id", l."userAccountId", l."action", l."discordId",
        l."discordUsername", l."discordGlobalName", l."discordServerNickname",
        l."actorId", l."actorType", l."reason", l."createdAt",
        u."userId" AS "userId",
        p."name" AS "playerName",
        p."nickname" AS "playerNickname",
        p."tag" AS "playerTag"
      FROM "DiscordAccountLinkLog" l
      LEFT JOIN "UserAccount" u ON u."id" = l."userAccountId"
      LEFT JOIN "Player" p ON p."userAccountId" = u."id"
      ORDER BY l."createdAt" DESC
      LIMIT 20
    `);

    return rows.map((row) => ({
      id: row.id,
      userAccountId: row.userAccountId,
      action: row.action,
      discordId: row.discordId,
      discordUsername: row.discordUsername,
      discordGlobalName: row.discordGlobalName,
      discordServerNickname: row.discordServerNickname,
      actorId: row.actorId,
      actorType: row.actorType,
      reason: row.reason,
      createdAt: row.createdAt,
      userAccount: row.userId ? {
        userId: row.userId,
        player: row.playerName || row.playerNickname || row.playerTag ? {
          name: row.playerName,
          nickname: row.playerNickname,
          tag: row.playerTag,
        } : null,
      } : null,
    }));
  } catch {
    return [] as Array<{
      id: number;
      userAccountId: number | null;
      action: string;
      discordId: string | null;
      discordUsername: string | null;
      discordGlobalName: string | null;
      discordServerNickname: string | null;
      actorId: number | null;
      actorType: string | null;
      reason: string | null;
      createdAt: Date;
      userAccount: { userId: string; player: { name: string | null; nickname: string | null; tag: string | null } | null } | null;
    }>;
  }
}

function parseApplyTimeText(value: string | null | undefined) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getMatchStartAtFromApplies(applies: Array<{ applyTimeText: string | null }>, dateKey: string) {
  const parsed = applies.map((apply) => parseApplyTimeText(apply.applyTimeText)).find(Boolean);
  const hour = parsed?.hour ?? 20;
  const minute = parsed?.minute ?? 0;
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
}

function formatKstHourMinute(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isMatchVoiceChannelName(channelName: string | null | undefined, categoryName: string | null | undefined) {
  const text = `${channelName || ""} ${categoryName || ""}`.toLowerCase();
  if (!text.trim()) return false;
  // 내전 모임 확인은 전체 음성방이 아니라 내전/대기/팀 관련 방만 인정합니다.
  // 예: 내전대기, 내전 1팀, 레드팀, 블루팀, 관전방
  // 반대로 일반 게임방/예비방/개인방에 있는 유저는 내전 참석으로 계산하지 않습니다.
  const includeKeywords = ["내전", "대기", "레드", "블루", "red", "blue", "team", "팀", "관전"];
  const excludeKeywords = ["예비", "again", "자랭", "칼바람", "증바람", "롤토체스", "tft", "일반", "듀오"];
  if (excludeKeywords.some((keyword) => text.includes(keyword)) && !text.includes("내전")) return false;
  return includeKeywords.some((keyword) => text.includes(keyword));
}

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const now = new Date();
  const { start: todayStart, end: todayEnd } = getTodayKstRange();
  let matchStartAt = new Date(`${getKstDateKey()}T20:00:00+09:00`);
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
    recentAutoFinishedMonitors,
    linkLogs,
    inProgressParties,
    activeSeason,
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
    getDiscordHeartbeatsSafe(),
    prisma.recruitPartyDiscordMonitor.findMany({
      where: { status: { in: ["ACTIVE", "PARTIAL_ACTIVE", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA", "FINISH_CANDIDATE", "DISCORD_LINK_INCOMPLETE", "RECRUIT_NOT_FULL", "WAITING"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { party: { select: { id: true, recruitNo: true, title: true, type: true, status: true, maxMembers: true } } },
    }),
    prisma.recruitPartyDiscordMonitor.findMany({
      where: {
        OR: [
          { status: "AUTO_FINISHED" },
          { autoFinishedAt: { not: null } },
        ],
      },
      orderBy: [{ autoFinishedAt: "desc" }, { updatedAt: "desc" }],
      take: 120,
      include: {
        party: {
          select: {
            id: true,
            recruitNo: true,
            title: true,
            type: true,
            status: true,
            maxMembers: true,
            recruitDate: true,
            startTimeText: true,
            members: {
              where: { isSubstitute: false },
              orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
              select: { name: true, slotNo: true },
            },
          },
        },
      },
    }),
    getDiscordAccountLinkLogsSafe(),
    prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
      include: {
        members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
        discordMonitor: true,
      },
    }),
    prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true } }),
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



  const todayApplies = activeSeason ? await prisma.seasonParticipationApply.findMany({
    where: {
      seasonId: activeSeason.id,
      applyDate: { gte: todayStart, lte: todayEnd },
      status: "APPLIED",
    },
    include: {
      player: { include: { userAccount: true } },
    },
    orderBy: { createdAt: "asc" },
  }) : [];

  matchStartAt = getMatchStartAtFromApplies(todayApplies, getKstDateKey());
  const requiredArrivalAt = new Date(matchStartAt.getTime() - 10 * 60 * 1000);
  const lateAfter = requiredArrivalAt;
  const absentAfter = new Date(matchStartAt.getTime() + 10 * 60 * 1000);

  const todayEvents = await prisma.discordVoiceEvent.findMany({
    where: { occurredAt: { gte: todayStart, lte: todayEnd } },
    orderBy: { occurredAt: "desc" },
    take: 1500,
    include: { userAccount: { select: { id: true, userId: true } } },
  });

  const todayJoinByDiscordId = new Map<string, Date>();
  for (const event of todayEvents) {
    if (event.eventType === "JOIN" || event.eventType === "MOVE") {
      if (!todayJoinByDiscordId.has(event.discordId)) todayJoinByDiscordId.set(event.discordId, event.occurredAt);
    }
  }

  const currentVoiceMembers = currentVoiceUsers.map((event) => ({
    discordId: event.discordId,
    displayName: getVoiceUserDisplay(event),
    channelId: event.channelId,
    channelName: event.channelName,
    categoryName: event.categoryName,
    extractedNames: extractPossibleNamesFromDiscordName(getVoiceUserDisplay(event)),
  }));

  const currentMatchVoiceUsers = currentVoiceUsers.filter((event) => isMatchVoiceChannelName(event.channelName, event.categoryName));
  const currentMatchEventByDiscordId = new Map(currentMatchVoiceUsers.map((event) => [event.discordId, event]));
  const currentMatchVoiceMembers = currentMatchVoiceUsers.map((event) => ({
    discordId: event.discordId,
    displayName: getVoiceUserDisplay(event),
    channelId: event.channelId,
    channelName: event.channelName,
    categoryName: event.categoryName,
    extractedNames: extractPossibleNamesFromDiscordName(getVoiceUserDisplay(event)),
  }));

  const todayNameCount = new Map<string, number>();
  for (const apply of todayApplies) {
    const key = normalizeName(apply.player.name || apply.player.nickname);
    if (key) todayNameCount.set(key, (todayNameCount.get(key) || 0) + 1);
  }

  const usedCurrentDiscordIds = new Set<string>();
  const matchAttendancePlayers = todayApplies.map((apply) => {
    const player = apply.player;
    const nameKey = normalizeName(player.name || player.nickname);
    const linkedDiscordId = player.userAccount?.discordId || null;
    const linkedEvent = linkedDiscordId ? currentMatchEventByDiscordId.get(linkedDiscordId) || null : null;
    const otherChannelEvent = !linkedEvent && linkedDiscordId ? currentVoiceUsers.find((event) => event.discordId === linkedDiscordId) || null : null;
    let present = Boolean(linkedEvent);
    let matchType = linkedEvent ? "DISCORD_ID" : "NOT_MATCHED";
    let matchedDisplayName = linkedEvent ? getVoiceUserDisplay(linkedEvent) : null;
    let channelName = linkedEvent?.channelName || null;
    let matchedDiscordId = linkedEvent?.discordId || null;

    if (linkedEvent) usedCurrentDiscordIds.add(linkedEvent.discordId);

    if (!present && nameKey && (todayNameCount.get(nameKey) || 0) === 1) {
      const candidates = currentMatchVoiceMembers.filter((member) => !usedCurrentDiscordIds.has(member.discordId) && member.extractedNames.has(nameKey));
      if (candidates.length === 1) {
        const matched = candidates[0];
        present = true;
        matchType = "NAME_TOKEN";
        matchedDisplayName = matched.displayName;
        channelName = matched.channelName || null;
        matchedDiscordId = matched.discordId;
        usedCurrentDiscordIds.add(matched.discordId);
      } else if (candidates.length > 1) {
        matchType = "NAME_AMBIGUOUS";
      }
    } else if (!present && nameKey) {
      matchType = "NAME_AMBIGUOUS";
    }

    if (!present && otherChannelEvent) {
      matchType = "OTHER_CHANNEL";
      matchedDisplayName = getVoiceUserDisplay(otherChannelEvent);
      channelName = otherChannelEvent.channelName || null;
      matchedDiscordId = null;
    }

    const joinedAt = matchedDiscordId ? todayJoinByDiscordId.get(matchedDiscordId) || null : null;
    let attendanceStatus = "WAITING";
    if (present) attendanceStatus = joinedAt && joinedAt > lateAfter ? "LATE" : "PRESENT";
    else if (now >= absentAfter) attendanceStatus = "ABSENT_WARNING";

    return {
      applyId: apply.id,
      playerId: player.id,
      name: player.name || player.nickname,
      nickname: player.nickname,
      tag: player.tag,
      linked: Boolean(linkedDiscordId),
      present,
      matchType,
      attendanceStatus,
      matchedDisplayName,
      channelName,
      joinedAt: joinedAt?.toISOString() || null,
    };
  });

  const presentMatchNames = new Set(matchAttendancePlayers.filter((item) => item.present).map((item) => normalizeName(item.name)));
  const extraVoiceUsers = currentMatchVoiceMembers.filter((member) => {
    for (const name of member.extractedNames) {
      if (presentMatchNames.has(name)) return false;
    }
    return !matchAttendancePlayers.some((item) => item.matchedDisplayName === member.displayName);
  }).map((member) => ({ discordId: member.discordId, displayName: member.displayName, channelName: member.channelName || null }));

  const matchAttendance = {
    season: activeSeason,
    date: getKstDateKey(),
    matchStartAt: matchStartAt.toISOString(),
    requiredArrivalAt: requiredArrivalAt.toISOString(),
    lateAfter: lateAfter.toISOString(),
    absentAfter: absentAfter.toISOString(),
    matchStartText: formatKstHourMinute(matchStartAt),
    requiredArrivalText: formatKstHourMinute(requiredArrivalAt),
    absentAfterText: formatKstHourMinute(absentAfter),
    totalCount: matchAttendancePlayers.length,
    presentCount: matchAttendancePlayers.filter((item) => item.present).length,
    lateCount: matchAttendancePlayers.filter((item) => item.attendanceStatus === "LATE").length,
    absentWarningCount: matchAttendancePlayers.filter((item) => item.attendanceStatus === "ABSENT_WARNING").length,
    waitingCount: matchAttendancePlayers.filter((item) => item.attendanceStatus === "WAITING").length,
    unlinkedCount: matchAttendancePlayers.filter((item) => !item.linked).length,
    players: matchAttendancePlayers,
    extraVoiceUsers,
  };

  const recruitVerifications = inProgressParties.map((party) => {
    const activeMembers = party.members.filter((member) => isNonEmptyName(member.name) && !member.isSubstitute);
    const nameCount = new Map<string, number>();
    for (const member of activeMembers) {
      const key = normalizeName(member.name);
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    const recruitFilled = activeMembers.length >= party.maxMembers;
    const previouslyActive = Boolean(
      party.discordMonitor?.lastPresentExpectedCount && party.discordMonitor.lastPresentExpectedCount > 0
    ) || ["PARTIAL_ACTIVE", "PARTIAL_ACTIVE_WITH_EXTRA", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA", "FINISH_CANDIDATE", "AUTO_FINISHED"].includes(String(party.discordMonitor?.status || ""));

    const baseVoiceMembers = currentVoiceUsers.map((event) => ({
      id: event.discordId,
      displayName: getVoiceUserDisplay(event),
      channelId: event.channelId,
      channelName: event.channelName,
      occurredAt: event.occurredAt,
      extractedNames: extractPossibleNamesFromDiscordName(getVoiceUserDisplay(event)),
      rawEvent: event,
    }));

    const groupByChannel = new Map<string, {
      channelId: string | null;
      channelName: string | null;
      members: typeof baseVoiceMembers;
    }>();

    for (const member of baseVoiceMembers) {
      const key = member.channelId || `unknown:${member.channelName || ""}`;
      const current = groupByChannel.get(key) || { channelId: member.channelId || null, channelName: member.channelName || null, members: [] as typeof baseVoiceMembers };
      current.members.push(member);
      groupByChannel.set(key, current);
    }

    const emptyGroup = { channelId: party.discordMonitor?.voiceChannelId || null, channelName: null as string | null, members: [] as typeof baseVoiceMembers };

    function evaluateGroup(group: { channelId: string | null; channelName: string | null; members: typeof baseVoiceMembers }) {
      const scopedVoiceMembers = group.members;
      const scopedDiscordIds = new Set(scopedVoiceMembers.map((event) => event.id));
      const usedDiscordIds = new Set<string>();

      const participantChecks = activeMembers.map((member) => {
        const key = normalizeName(member.name);
        const player = playerByKey.get(key);
        const discordId = player?.userAccount?.discordId || null;
        const currentEvent = discordId ? scopedVoiceMembers.find((event) => event.id === discordId) || null : null;
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
          matchedDisplayName: directlyPresent ? currentEvent?.displayName || null : null,
          channelName: currentEvent?.channelName || group.channelName || null,
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

      const presentCount = participantChecks.filter((item) => item.present).length;
      const matchedByNameCount = participantChecks.filter((item) => item.matchedByName).length;
      const ambiguousCount = participantChecks.filter((item) => item.matchType === "NAME_AMBIGUOUS").length;
      const nonParticipantVoiceUsers = scopedVoiceMembers.filter((member) => !usedDiscordIds.has(member.id));

      return {
        channelId: group.channelId,
        channelName: group.channelName,
        participantChecks,
        presentCount,
        matchedByNameCount,
        ambiguousCount,
        nonParticipantVoiceUsers,
        nonParticipantCount: nonParticipantVoiceUsers.length,
        score: presentCount * 100 + matchedByNameCount * 10 - Math.min(9, nonParticipantVoiceUsers.length),
      };
    }

    const evaluatedGroups = [...groupByChannel.values()].map(evaluateGroup);
    const monitorEval = party.discordMonitor?.voiceChannelId
      ? evaluatedGroups.find((item) => item.channelId === party.discordMonitor?.voiceChannelId) || evaluateGroup(emptyGroup)
      : null;
    const bestEval = evaluatedGroups
      .filter((item) => item.presentCount > 0)
      .sort((a, b) => b.score - a.score || b.presentCount - a.presentCount || a.nonParticipantCount - b.nonParticipantCount)[0] || null;

    let selected = bestEval || monitorEval || evaluateGroup(emptyGroup);
    const monitorHadWrongChannel = Boolean(
      party.discordMonitor?.voiceChannelId
      && bestEval
      && bestEval.channelId
      && bestEval.channelId !== party.discordMonitor.voiceChannelId
      && bestEval.presentCount > Math.max(0, monitorEval?.presentCount || 0)
    );

    // 모니터 채널이 과거 오류로 외부 인원만 물고 있으면, 참가자 매칭 없는 외부 인원은 표시/판단에서 제외합니다.
    const hideExternalOnlyChannel = selected.presentCount === 0 && !previouslyActive;
    const participantChecks = selected.participantChecks;
    const presentParticipants = participantChecks.filter((item) => item.present).map((item) => item.matchedByName ? `${item.name} → ${item.matchedDisplayName}` : item.playerLabel || item.name);
    const missingParticipants = participantChecks.filter((item) => !item.present).map((item) => item.playerLabel || item.name);
    const unlinkedParticipants = participantChecks.filter((item) => !item.linked).map((item) => item.name);
    const presentCount = selected.presentCount;
    const matchedByNameCount = selected.matchedByNameCount;
    const ambiguousCount = selected.ambiguousCount;

    // 참가자 매칭이 0명인 음성방은 구인 진행 방으로 확정하지 않습니다.
    // 외부/관전 인원만 감지된 경우에는 미확인 참가자만 보여주고, 음성방/외부 인원은 숨깁니다.
    const shouldExposeVoiceRoom = presentCount > 0 || previouslyActive;
    const nonParticipantVoiceUsers = shouldExposeVoiceRoom ? selected.nonParticipantVoiceUsers : [];
    const nonParticipantCount = nonParticipantVoiceUsers.length;
    const nonParticipantDisplayNames = nonParticipantVoiceUsers.map((member) => member.displayName);
    const guessedChannelNames = shouldExposeVoiceRoom && selected.channelName ? [selected.channelName] : [];
    const scenarioLabels: string[] = [];
    if (presentCount > 0) scenarioLabels.push("진행 흔적 확인");
    if (presentCount > 0 && activeMembers.length < party.maxMembers) scenarioLabels.push("정원 미달 진행 가능");
    if (presentCount > 0 && nonParticipantCount > 0) scenarioLabels.push(`관전/외부 ${nonParticipantCount}명`);
    if (presentCount > 0 && !party.discordMonitor?.voiceChannelId) scenarioLabels.push("음성방 자동 추정");
    if (monitorHadWrongChannel) scenarioLabels.push("음성방 자동 재추정");
    if (ambiguousCount > 0) scenarioLabels.push("동명이인 확인 필요");
    if (activeMembers.length === 0) scenarioLabels.push("참가자 이름 없음");
    if (selected.presentCount === 0 && selected.nonParticipantCount > 0 && !previouslyActive) scenarioLabels.push("참가자 미접속");

    let status = party.discordMonitor?.status || "WAITING";
    if (party.discordMonitor?.status === "FINISH_CANDIDATE" && previouslyActive) status = "FINISH_CANDIDATE";
    else if (presentCount > 0) {
      if (recruitFilled && presentCount >= activeMembers.length && activeMembers.length > 0 && nonParticipantCount === 0) status = "ASSEMBLED";
      else if (recruitFilled && presentCount >= activeMembers.length && activeMembers.length > 0 && nonParticipantCount > 0) status = "ASSEMBLED_WITH_EXTRA";
      else if (nonParticipantCount > 0) status = "PARTIAL_ACTIVE_WITH_EXTRA";
      else status = "PARTIAL_ACTIVE";
    } else status = "WAITING";

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
      nonParticipantCount,
      nonParticipantDisplayNames,
      scenarioLabels,
      guessedChannelNames,
      voiceChannelId: shouldExposeVoiceRoom ? (selected.channelId || party.discordMonitor?.voiceChannelId || null) : null,
      monitorStatus: party.discordMonitor?.status || null,
      monitorChannelId: party.discordMonitor?.voiceChannelId || null,
      channelReestimated: monitorHadWrongChannel,
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


  const autoFinishedRecruitMonitors = recentAutoFinishedMonitors.map((monitor) => {
    const voiceEvent = monitor.voiceChannelId
      ? recentEvents.find((event) => event.channelId === monitor.voiceChannelId && event.channelName)
      : null;
    const participantNames = (monitor.party?.members || [])
      .map((member) => String(member.name || "").trim())
      .filter(Boolean);

    return {
      monitorId: monitor.id,
      partyId: monitor.partyId,
      recruitNo: monitor.party?.recruitNo ?? 0,
      title: monitor.party?.title || `구인 #${monitor.partyId}`,
      type: monitor.party ? String(monitor.party.type) : "UNKNOWN",
      partyStatus: monitor.party ? String(monitor.party.status) : "UNKNOWN",
      maxMembers: monitor.party?.maxMembers ?? 0,
      recruitDate: monitor.party?.recruitDate || null,
      startTimeText: monitor.party?.startTimeText || null,
      participantNames,
      voiceChannelId: monitor.voiceChannelId || null,
      voiceChannelName: voiceEvent?.channelName || null,
      status: monitor.status,
      lastExpectedCount: monitor.lastExpectedCount,
      lastPresentExpectedCount: monitor.lastPresentExpectedCount,
      lastNonParticipantCount: monitor.lastNonParticipantCount,
      finishCandidateStartedAt: monitor.finishCandidateStartedAt?.toISOString() || null,
      autoFinishedAt: monitor.autoFinishedAt?.toISOString() || monitor.updatedAt.toISOString(),
      autoFinishReason: monitor.autoFinishReason || null,
      updatedAt: monitor.updatedAt.toISOString(),
    };
  });

  const healthyBotCount = heartbeats.filter((bot) => bot.updatedAt >= staleSince).length;
  const diagnostics: Array<{ level: "OK" | "INFO" | "WARN" | "ERROR"; code: string; title: string; message: string; action?: string }> = [];

  function pushDiag(level: "OK" | "INFO" | "WARN" | "ERROR", code: string, title: string, message: string, action?: string) {
    diagnostics.push({ level, code, title, message, action });
  }

  if (heartbeats.length === 0) {
    pushDiag("ERROR", "BOT_HEARTBEAT_MISSING", "봇 heartbeat 없음", "Discord 봇이 사이트에 생존 신호를 한 번도 보내지 않았습니다.", "봇 서버에서 pm2 status, .env의 KLOL_BASE_URL/DISCORD_BOT_API_SECRET, /api/discord/heartbeat 응답을 확인하세요.");
  } else if (healthyBotCount === 0) {
    pushDiag("ERROR", "BOT_HEARTBEAT_STALE", "봇 heartbeat 지연", `최근 ${settings.staleHeartbeatSeconds}초 안에 정상 heartbeat가 없습니다.`, "봇 서버에서 pm2 logs klol-discord-operation-server --lines 100 으로 오류를 확인하세요.");
  } else {
    pushDiag("OK", "BOT_HEARTBEAT_OK", "봇 heartbeat 정상", `정상 봇 ${healthyBotCount}개가 최근 기준 안에 신호를 보냈습니다.`);
  }

  const heartbeatErrors = heartbeats.filter((bot) => typeof bot.lastError === "string" && bot.lastError.trim() !== "");
  if (heartbeatErrors.length > 0) {
    pushDiag("WARN", "BOT_LAST_ERROR", "봇 최근 오류 있음", heartbeatErrors.slice(0, 2).map((bot) => `${bot.botUsername || bot.botId}: ${bot.lastError}`).join(" / "), "오류가 계속 유지되면 봇 로그와 사이트 API 응답 코드를 확인하세요.");
  }

  if (!settings.autoFinishEnabled) {
    pushDiag("WARN", "AUTO_FINISH_DISABLED", "자동 ㅉ 비활성화", "Discord 운영 설정에서 자동 ㅉ이 꺼져 있습니다.", "/admin/discord/settings에서 자동 ㅉ을 켜야 자동 마감이 작동합니다.");
  }

  if (!settings.watchAllVoiceChannels && settings.watchChannelIds.length === 0 && settings.watchCategoryIds.length === 0) {
    pushDiag("ERROR", "WATCH_SCOPE_EMPTY", "감시 범위 없음", "전체 음성방 감시가 꺼져 있고 감시 채널/카테고리 ID도 비어 있습니다.", "전체 음성방 감시를 ON으로 하거나 감시할 음성방/카테고리 ID를 저장하세요.");
  }

  if (!settings.adminLogChannelId) {
    pushDiag("INFO", "ADMIN_LOG_CHANNEL_EMPTY", "관리자 로그 채널 선택 미설정", "관리자 채널 알림을 쓰지 않는 설정입니다. 사이트 화면 점검은 정상 작동합니다.", "필요한 경우에만 관리자 로그 채널 ID를 입력하세요.");
  }

  if (inProgressParties.length > 0 && activeMonitors.length === 0) {
    pushDiag("WARN", "RECRUIT_MONITOR_EMPTY", "진행중 구인은 있으나 모니터 기록 없음", "진행중 구인이 있지만 RecruitPartyDiscordMonitor 기록이 없습니다.", "봇 자동 체크가 한 번 이상 실행됐는지, /api/discord/recruits/auto-finish/check 응답이 200인지 확인하세요.");
  }

  const staleMonitorCount = recruitVerifications.filter((item) => {
    if (!item.lastScannedAt) return true;
    const scanned = new Date(item.lastScannedAt).getTime();
    return Number.isFinite(scanned) && now.getTime() - scanned > Math.max(5, settings.autoFinishHoldMinutes) * 60 * 1000 * 2;
  }).length;
  if (inProgressParties.length > 0 && staleMonitorCount > 0) {
    pushDiag("WARN", "RECRUIT_MONITOR_STALE", "구인 모니터 갱신 지연", `진행중 구인 ${staleMonitorCount}건의 마지막 확인 시간이 오래됐거나 없습니다.`, "봇 서버 로그의 AUTO_FINISH_CHECK와 사이트 /api/discord/recruits/auto-finish/check 응답을 확인하세요.");
  }

  const stuckCandidateCount = recruitVerifications.filter((item) => {
    if (item.status !== "FINISH_CANDIDATE" || !item.finishCandidateStartedAt || item.autoFinishedAt) return false;
    const started = new Date(item.finishCandidateStartedAt).getTime();
    return Number.isFinite(started) && now.getTime() - started > (settings.autoFinishHoldMinutes + 2) * 60 * 1000;
  }).length;
  if (stuckCandidateCount > 0) {
    pushDiag("ERROR", "AUTO_FINISH_STUCK", "자동 ㅉ 후보 지연", `ㅉ 후보 상태가 보류 시간보다 오래 지속된 구인이 ${stuckCandidateCount}건 있습니다.`, "구인 마감 API, 카카오 구인 상태값, 자동 ㅉ dryRun 여부를 확인하세요.");
  }

  const ambiguousRecruitCount = recruitVerifications.filter((item) => item.ambiguousCount > 0).length;
  if (ambiguousRecruitCount > 0) {
    pushDiag("WARN", "NAME_MATCH_AMBIGUOUS", "이름매칭 확인 필요", `동명이인 또는 애매한 Discord 이름매칭 구인이 ${ambiguousRecruitCount}건 있습니다.`, "동명이인은 이름만으로 확정하지 않고 확인 필요로 분리합니다. 닉네임/태그 또는 ID 연동을 보조 기준으로 사용하세요.");
  }

  const recruitWithoutMembersCount = recruitVerifications.filter((item) => item.activeMemberCount === 0).length;
  if (recruitWithoutMembersCount > 0) {
    pushDiag("WARN", "RECRUIT_MEMBER_EMPTY", "구인 참가자 없음", `진행중 구인 중 참가자 이름이 없는 건이 ${recruitWithoutMembersCount}건 있습니다.`, "카카오톡 구인 동기화 또는 참가자 저장 로직을 확인하세요.");
  }

  if (matchAttendance.totalCount > 0 && matchAttendance.absentWarningCount > 0) {
    pushDiag("WARN", "MATCH_ABSENT_WARNING", "내전 미접속 경고 있음", `오늘 내전 참가자 중 아직 음성방 확인이 안 된 대상이 ${matchAttendance.absentWarningCount}명 있습니다.`, "내전 시작 전/후 음성방 확인 여부를 참고하세요.");
  }

  if (currentVoiceUsers.length === 0 && recentEvents.length === 0) {
    pushDiag("INFO", "VOICE_EVENT_EMPTY", "최근 음성 이벤트 없음", "최근 6시간 동안 Discord 음성 이벤트가 없습니다.", "테스트하려면 감시 대상 음성방에 들어갔다가 나와서 JOIN/LEAVE 로그가 쌓이는지 확인하세요.");
  }

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
      healthyBotCount,
      recruitReadyCount: recruitVerifications.filter((item) => ["PARTIAL_ACTIVE", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA"].includes(item.status)).length,
      recruitNeedsCheckCount: recruitVerifications.filter((item) => ["WAITING", "FINISH_CANDIDATE"].includes(item.status) || item.ambiguousCount > 0).length,
      matchAttendancePresentCount: matchAttendance.presentCount,
      matchAttendanceTotalCount: matchAttendance.totalCount,
      matchAttendanceLateCount: matchAttendance.lateCount,
      matchAttendanceAbsentWarningCount: matchAttendance.absentWarningCount,
    },
    settings,
    heartbeats,
    currentVoiceUsers,
    recentUnlinkedEvents,
    matchAttendance,
    activeMonitors,
    recruitVerifications,
    autoFinishedRecruitMonitors,
    linkLogs,
    diagnostics,
    serverTime: now.toISOString(),
  });
}
