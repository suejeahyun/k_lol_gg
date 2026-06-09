export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";
import { DEFAULT_AUTO_FINISH_HOLD_MINUTES, getAutoFinishReason } from "@/lib/discord/finish-policy";
import { formatRecruitPartyBlock, getActiveMemberCount } from "@/lib/kakao/party-recruit";

type CurrentVoiceMember = {
  id?: string;
  discordId?: string;
  displayName?: string | null;
  memberDisplayName?: string | null;
  nickname?: string | null;
  memberNickname?: string | null;
  username?: string | null;
  globalName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
};

type Body = {
  secret?: string;
  channelId?: string;
  channelName?: string | null;
  categoryId?: string | null;
  channelMissing?: boolean;
  source?: string;
  currentDiscordIds?: string[];
  currentMembers?: CurrentVoiceMember[];
  holdMinutes?: number;
  dryRun?: boolean;
};

type ParticipantVerification = {
  name: string;
  linked: boolean;
  present: boolean;
  discordId: string | null;
  matchedDiscordId: string | null;
  matchedDisplayName: string | null;
  matchType: "DISCORD_ID" | "NAME_TOKEN" | "NAME_AMBIGUOUS" | "NOT_MATCHED";
  confidence: "EXACT" | "HIGH" | "CHECK_REQUIRED" | "NONE";
  playerId: number | null;
  playerLabel: string | null;
};

type PreparedVoiceMember = {
  id: string;
  displayName: string;
  extractedNames: Set<string>;
};

function normalizeName(value: string | null | undefined) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s#·ㆍ_\-\.\/\\|()[\]{}]+/g, "")
    .toLowerCase();
}

function isNonEmptyName(value: string | null | undefined) {
  return String(value || "").trim() !== "";
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function compactDisplayName(member: CurrentVoiceMember) {
  return String(
    member.displayName
    || member.memberDisplayName
    || member.nickname
    || member.memberNickname
    || member.globalName
    || member.username
    || member.id
    || member.discordId
    || "Discord 유저"
  ).trim();
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

function extractPossibleNamesFromDiscordName(displayName: string) {
  const tokens = String(displayName || "")
    .replace(/[\[\]{}()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const names: string[] = [];
  if (tokens.length >= 2 && isAgeToken(tokens[0]) && isKoreanNameToken(tokens[1])) {
    names.push(tokens[1]);
  }
  if (tokens.length >= 1 && isKoreanNameToken(tokens[0])) {
    names.push(tokens[0]);
  }

  for (const token of tokens) {
    if (isKoreanNameToken(token)) names.push(token);
  }

  return new Set(unique(names.map(normalizeName).filter(Boolean)));
}

function prepareVoiceMembers(body: Body, currentDiscordIds: Set<string>) {
  const fromMembers = Array.isArray(body.currentMembers) ? body.currentMembers : [];
  const prepared: PreparedVoiceMember[] = [];

  for (const member of fromMembers) {
    const id = String(member.id || member.discordId || "").trim();
    if (!id) continue;
    currentDiscordIds.add(id);
    const displayName = compactDisplayName(member);
    prepared.push({ id, displayName, extractedNames: extractPossibleNamesFromDiscordName(displayName) });
  }

  for (const id of currentDiscordIds) {
    if (!prepared.some((member) => member.id === id)) {
      prepared.push({ id, displayName: `Discord ${id.slice(-4)}`, extractedNames: new Set() });
    }
  }

  return prepared;
}

async function hasRecentExpectedActivityInChannel(params: {
  channelId: string;
  expectedDiscordIds: string[];
  since: Date;
}) {
  const { channelId, expectedDiscordIds, since } = params;
  if (expectedDiscordIds.length === 0) return false;

  const count = await prisma.discordVoiceEvent.count({
    where: {
      discordId: { in: expectedDiscordIds },
      occurredAt: { gte: since },
      OR: [
        { channelId },
        { previousChannelId: channelId },
      ],
    },
  });

  return count > 0;
}

function getVerificationStatus(params: {
  recruitFilled: boolean;
  expectedCount: number;
  presentExpectedCount: number;
  nonParticipantCount: number;
  canAutoFinish: boolean;
  shouldCandidate: boolean;
}) {
  const { recruitFilled, expectedCount, presentExpectedCount, nonParticipantCount, canAutoFinish, shouldCandidate } = params;
  if (canAutoFinish) return "AUTO_FINISHED";
  if (shouldCandidate) return "FINISH_CANDIDATE";

  // 실운영 기준: 구인 정원이 다 차지 않아도, 구인 참가자 중 1명 이상이
  // 디스코드 음성방에서 확인되면 실제 진행 가능 상태로 봅니다.
  if (presentExpectedCount > 0) {
    if (recruitFilled && expectedCount > 0 && presentExpectedCount >= expectedCount && nonParticipantCount === 0) return "ASSEMBLED";
    if (recruitFilled && expectedCount > 0 && presentExpectedCount >= expectedCount && nonParticipantCount > 0) return "ASSEMBLED_WITH_EXTRA";
    if (nonParticipantCount > 0) return "PARTIAL_ACTIVE_WITH_EXTRA";
    return "PARTIAL_ACTIVE";
  }

  return "WAITING";
}

function isPreviouslyActiveRecruitStatus(status: string | null | undefined) {
  return [
    "PARTIAL_ACTIVE",
    "PARTIAL_ACTIVE_WITH_EXTRA",
    "GATHERING",
    "ASSEMBLED",
    "ASSEMBLED_WITH_EXTRA",
    "FINISH_CANDIDATE",
    "AUTO_FINISHED",
  ].includes(String(status || ""));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Body;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const channelId = String(body.channelId || "").trim();
  const channelName = typeof body.channelName === "string" ? body.channelName.trim() : null;
  const source = String(body.source || "INTERVAL").trim();
  const currentDiscordIds = new Set((body.currentDiscordIds || []).map((id) => String(id).trim()).filter(Boolean));
  const currentVoiceMembers = prepareVoiceMembers(body, currentDiscordIds);
  const currentMemberById = new Map(currentVoiceMembers.map((member) => [member.id, member]));
  const holdMinutes = Number.isFinite(Number(body.holdMinutes)) ? Number(body.holdMinutes) : DEFAULT_AUTO_FINISH_HOLD_MINUTES;
  const dryRun = Boolean(body.dryRun);

  if (!channelId) {
    return NextResponse.json({ message: "channelId가 필요합니다." }, { status: 400 });
  }

  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
      discordMonitor: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });

  const now = new Date();
  const recentSince = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const results: Array<Record<string, unknown>> = [];

  for (const party of parties) {
    const activeMembers = party.members.filter((member) => isNonEmptyName(member.name) && !member.isSubstitute);
    if (activeMembers.length === 0) continue;

    const recruitFilled = activeMembers.length >= party.maxMembers;
    const memberNames = activeMembers.map((member) => member.name.trim());
    const normalizedMemberNames = new Set(memberNames.map(normalizeName));
    const nameCount = new Map<string, number>();
    for (const name of memberNames) {
      const key = normalizeName(name);
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    const players = await prisma.player.findMany({
      where: {
        isActive: true,
        OR: memberNames.flatMap((name) => ([
          { name: { equals: name, mode: "insensitive" as const } },
          { nickname: { equals: name, mode: "insensitive" as const } },
        ])),
      },
      include: { userAccount: true },
    });

    const playerByMemberName = new Map<string, (typeof players)[number]>();
    for (const player of players) {
      const keys = [normalizeName(player.name), normalizeName(player.nickname)];
      for (const key of keys) {
        if (normalizedMemberNames.has(key) && !playerByMemberName.has(key)) playerByMemberName.set(key, player);
      }
    }

    const usedDiscordIds = new Set<string>();
    const participantChecks: ParticipantVerification[] = activeMembers.map((member) => {
      const key = normalizeName(member.name);
      const player = playerByMemberName.get(key);
      const discordId = player?.userAccount?.discordId || null;
      const directMember = discordId ? currentMemberById.get(discordId) : null;

      if (directMember) {
        usedDiscordIds.add(directMember.id);
        return {
          name: member.name.trim(),
          linked: Boolean(discordId),
          present: true,
          discordId,
          matchedDiscordId: directMember.id,
          matchedDisplayName: directMember.displayName,
          matchType: "DISCORD_ID",
          confidence: "EXACT",
          playerId: player?.id ?? null,
          playerLabel: player ? `${player.name || "-"} / ${player.nickname}#${player.tag}` : null,
        };
      }

      return {
        name: member.name.trim(),
        linked: Boolean(discordId),
        present: false,
        discordId,
        matchedDiscordId: null,
        matchedDisplayName: null,
        matchType: "NOT_MATCHED",
        confidence: "NONE",
        playerId: player?.id ?? null,
        playerLabel: player ? `${player.name || "-"} / ${player.nickname}#${player.tag}` : null,
      };
    });

    // Discord 계정 미연동 상태여도 카카오톡/사이트 참가자 이름과 Discord 서버 닉네임의 이름 토큰이 일치하면 참가로 인정합니다.
    for (const check of participantChecks) {
      if (check.present) continue;
      const key = normalizeName(check.name);
      if ((nameCount.get(key) || 0) !== 1) {
        check.matchType = "NAME_AMBIGUOUS";
        check.confidence = "CHECK_REQUIRED";
        continue;
      }

      const candidates = currentVoiceMembers.filter((voiceMember) => !usedDiscordIds.has(voiceMember.id) && voiceMember.extractedNames.has(key));
      if (candidates.length === 1) {
        const matched = candidates[0];
        usedDiscordIds.add(matched.id);
        check.present = true;
        check.matchedDiscordId = matched.id;
        check.matchedDisplayName = matched.displayName;
        check.matchType = "NAME_TOKEN";
        check.confidence = "HIGH";
      } else if (candidates.length > 1) {
        check.matchType = "NAME_AMBIGUOUS";
        check.confidence = "CHECK_REQUIRED";
      }
    }

    const matchedDiscordIds = unique(participantChecks.map((item) => item.matchedDiscordId).filter((id): id is string => Boolean(id)));
    const linkedDiscordIds = unique(participantChecks.map((item) => item.discordId).filter((id): id is string => Boolean(id)));
    const requiredCount = activeMembers.length;
    const linkedCount = linkedDiscordIds.length;
    const presentExpectedCount = participantChecks.filter((item) => item.present).length;
    const rawNonParticipantDiscordIds = [...currentDiscordIds].filter((id) => !matchedDiscordIds.includes(id));
    const nonParticipantDiscordIds = rawNonParticipantDiscordIds;
    let nonParticipantCount = nonParticipantDiscordIds.length;
    let nonParticipantDisplayNames = nonParticipantDiscordIds.map((id) => currentMemberById.get(id)?.displayName || `Discord ${id.slice(-4)}`);
    const matchedByNameCount = participantChecks.filter((item) => item.matchType === "NAME_TOKEN").length;
    const ambiguousCount = participantChecks.filter((item) => item.matchType === "NAME_AMBIGUOUS").length;

    const currentMonitor = party.discordMonitor;
    const monitorChannelMatched = currentMonitor?.voiceChannelId === channelId;
    const hasPresentInThisChannel = presentExpectedCount > 0;
    const previouslyActiveForThisParty = Boolean(
      requiredCount > 0
      && (isPreviouslyActiveRecruitStatus(currentMonitor?.status) || (currentMonitor?.lastPresentExpectedCount ?? 0) > 0)
    );
    const hasRecentActivity = monitorChannelMatched || hasPresentInThisChannel
      ? true
      : await hasRecentExpectedActivityInChannel({ channelId, expectedDiscordIds: linkedDiscordIds, since: recentSince });

    // 핵심 보정:
    // 해당 채널에 구인 참가자 매칭이 0명이고, 과거에 이 구인이 이 채널에서 진행된 흔적도 없으면
    // 외부/관전 인원만 있는 방으로 판단하고 모니터 연결/자동 ㅉ 판단에서 제외합니다.
    // 예: 2인 구인인데 다른 방에 3명이 놀고 있는 경우, 구인 참가자가 없으면 이 방을 구인방으로 잡지 않습니다.
    const shouldTrackThisChannel = hasPresentInThisChannel || monitorChannelMatched || hasRecentActivity;
    if (!shouldTrackThisChannel) {
      results.push({
        recruitNo: party.recruitNo,
        title: party.title,
        skipped: true,
        reason: "NO_PARTICIPANT_MATCH_IN_CHANNEL",
        channelId,
        requiredCount,
        linkedCount,
        presentExpectedCount,
        nonParticipantCount,
      });
      continue;
    }

    const ignoreExternalOnlyChannel = monitorChannelMatched && !hasPresentInThisChannel && !previouslyActiveForThisParty;

    if (ignoreExternalOnlyChannel) {
      nonParticipantCount = 0;
      nonParticipantDisplayNames = [];
    }

    const hasEverActiveMatch = Boolean(
      monitorChannelMatched
      && previouslyActiveForThisParty
    );

    // 자동 ㅉ 기준 변경:
    // - 정원 전원 모임이 아니라, 구인 참가자 중 1명 이상 디스코드 확인된 적이 있으면 진행 흔적으로 인정
    // - 이후 해당 구인 참가자 매칭 인원이 0명이 되면 종료 후보
    const shouldCandidate = hasEverActiveMatch && presentExpectedCount === 0;

    const candidateStartedAt = shouldCandidate
      ? currentMonitor?.voiceChannelId === channelId
        ? currentMonitor?.finishCandidateStartedAt ?? now
        : now
      : null;
    const elapsedMs = candidateStartedAt ? now.getTime() - candidateStartedAt.getTime() : 0;
    const holdReached = shouldCandidate && elapsedMs >= holdMinutes * 60 * 1000;
    const canAutoFinish = holdReached;

    const status = getVerificationStatus({
      recruitFilled,
      expectedCount: requiredCount,
      presentExpectedCount,
      nonParticipantCount,
      canAutoFinish,
      shouldCandidate,
    });

    const missingParticipants = participantChecks.filter((item) => !item.present).map((item) => item.playerLabel || item.name);
    const unlinkedParticipants = participantChecks.filter((item) => !item.linked).map((item) => item.name);
    const presentParticipants = participantChecks.filter((item) => item.present).map((item) => item.playerLabel || item.name);
    const matchDetails = participantChecks.map((item) => ({
      name: item.name,
      playerLabel: item.playerLabel,
      linked: item.linked,
      present: item.present,
      discordId: item.discordId,
      matchedDiscordId: item.matchedDiscordId,
      matchedDisplayName: item.matchedDisplayName,
      matchType: item.matchType,
      confidence: item.confidence,
    }));

    const reason = canAutoFinish
      ? `#${party.recruitNo} ${party.title} · 구인 참가자 ${requiredCount}명 중 일부 이상 디스코드 진행 확인 후 매칭 인원 전원 퇴장 · ${holdMinutes}분 보류 경과 · 자동 ㅉ`
      : getAutoFinishReason({
          recruitNo: party.recruitNo,
          title: party.title,
          expectedCount: requiredCount,
          presentExpectedCount,
          nonParticipantCount,
          holdMinutes,
        });

    if (!dryRun) {
      await prisma.recruitPartyDiscordMonitor.upsert({
        where: { partyId: party.id },
        create: {
          partyId: party.id,
          voiceChannelId: channelId,
          status,
          lastExpectedCount: requiredCount,
          lastPresentExpectedCount: presentExpectedCount,
          lastNonParticipantCount: nonParticipantCount,
          finishCandidateStartedAt: candidateStartedAt,
          lastScannedAt: now,
          autoFinishedAt: canAutoFinish ? now : null,
          autoFinishReason: canAutoFinish ? reason : null,
        },
        update: {
          voiceChannelId: channelId,
          status,
          lastExpectedCount: requiredCount,
          lastPresentExpectedCount: presentExpectedCount,
          lastNonParticipantCount: nonParticipantCount,
          finishCandidateStartedAt: candidateStartedAt,
          lastScannedAt: now,
          autoFinishedAt: canAutoFinish ? now : currentMonitor?.autoFinishedAt ?? null,
          autoFinishReason: canAutoFinish ? reason : currentMonitor?.autoFinishReason ?? null,
        },
      });
    }

    if (canAutoFinish && !dryRun) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.recruitParty.findUnique({
          where: { id: party.id },
          include: { members: true },
        });
        if (!fresh || fresh.status !== "IN_PROGRESS") return;

        await tx.recruitPartyLog.create({
          data: {
            recruitNo: fresh.recruitNo,
            recruitDate: fresh.recruitDate,
            resetSeq: fresh.resetSeq,
            type: String(fresh.type),
            title: fresh.title,
            action: "DISCORD_AUTO_FINISHED",
            memberCount: getActiveMemberCount(fresh.members),
            maxMembers: fresh.maxMembers,
            summary: formatRecruitPartyBlock(fresh),
            roomName: fresh.roomName,
            sender: "DISCORD_AUTO_FINISH",
          },
        });

        await tx.recruitParty.update({
          where: { id: fresh.id },
          data: { status: "FINISHED" },
        });

        await writeAdminLog({
          action: "DISCORD_RECRUIT_AUTO_FINISH",
          message: `디스코드 구인 모임 종료 감지 자동 마감: #${fresh.recruitNo} ${fresh.title}`,
          targetType: "RecruitParty",
          targetId: fresh.id,
          afterJson: {
            reason,
            source,
            channelId,
            channelName,
            requiredCount,
            linkedCount,
            presentExpectedCount,
            nonParticipantCount,
            nonParticipantDisplayNames,
            matchedByNameCount,
            ambiguousCount,
            missingParticipants,
            unlinkedParticipants,
            presentParticipants,
            matchDetails,
          } as Prisma.InputJsonValue,
          db: tx,
        });
      });
    }

    results.push({
      recruitNo: party.recruitNo,
      partyId: party.id,
      title: party.title,
      maxMembers: party.maxMembers,
      activeMemberCount: activeMembers.length,
      requiredCount,
      linkedCount,
      expectedCount: requiredCount,
      presentExpectedCount,
      nonParticipantCount,
      status,
      autoFinished: canAutoFinish,
      candidateStartedAt: candidateStartedAt?.toISOString() ?? null,
      voiceChannelId: channelId,
      voiceChannelName: channelName,
      source,
      recruitFilled,
      hasEverActiveMatch,
      matchedByNameCount,
      ambiguousCount,
      missingParticipants,
      unlinkedParticipants,
      presentParticipants,
      nonParticipantDiscordIds,
      nonParticipantDisplayNames,
      matchDetails,
      scenario: presentExpectedCount > 0 && nonParticipantCount > 0 ? "PARTICIPANTS_WITH_SPECTATORS" : presentExpectedCount > 0 ? "PARTIAL_ACTIVITY_CONFIRMED" : shouldCandidate ? "LEFT_AFTER_ACTIVITY" : "WAITING_FOR_ACTIVITY",
    });
  }

  const finished = results.filter((item) => item.autoFinished).map((item) => `#${item.recruitNo} ${item.title}`);

  return NextResponse.json({
    ok: true,
    channelId,
    channelName,
    source,
    dryRun,
    finished,
    kakaoReply:
      finished.length > 0
        ? `[K-LOL.GG 구인 자동 마감]\n${finished.join("\n")}\n디스코드에서 모임 완료 후 전원 퇴장하여 자동 마감 처리되었습니다.`
        : "",
    results,
  });
}
