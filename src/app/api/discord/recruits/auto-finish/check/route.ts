export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";
import { DEFAULT_AUTO_FINISH_HOLD_MINUTES, getAutoFinishReason, shouldEnterFinishCandidate } from "@/lib/discord/finish-policy";
import { formatRecruitPartyBlock, getActiveMemberCount } from "@/lib/kakao/party-recruit";

type Body = {
  secret?: string;
  channelId?: string;
  currentDiscordIds?: string[];
  holdMinutes?: number;
  dryRun?: boolean;
};

function normalizeName(value: string) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Body;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const channelId = String(body.channelId || "").trim();
  const currentDiscordIds = new Set((body.currentDiscordIds || []).map((id) => String(id).trim()).filter(Boolean));
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
    take: 50,
  });

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];

  for (const party of parties) {
    const activeMembers = party.members.filter((member) => member.name.trim() !== "" && !member.isSubstitute);
    if (activeMembers.length === 0) continue;

    const memberNames = activeMembers.map((member) => member.name.trim());
    const normalizedMemberNames = new Set(memberNames.map(normalizeName));

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

    const expectedDiscordIds = players
      .filter((player) => normalizedMemberNames.has(normalizeName(player.name)) || normalizedMemberNames.has(normalizeName(player.nickname)))
      .map((player) => player.userAccount?.discordId)
      .filter((id): id is string => Boolean(id));

    if (expectedDiscordIds.length === 0) {
      results.push({ recruitNo: party.recruitNo, title: party.title, skipped: true, reason: "DISCORD_ID_NOT_LINKED" });
      continue;
    }

    const presentExpectedCount = expectedDiscordIds.filter((id) => currentDiscordIds.has(id)).length;
    const nonParticipantCount = [...currentDiscordIds].filter((id) => !expectedDiscordIds.includes(id)).length;
    const shouldCandidate = shouldEnterFinishCandidate({
      expectedCount: expectedDiscordIds.length,
      presentExpectedCount,
    });

    const currentMonitor = party.discordMonitor;
    const candidateStartedAt = shouldCandidate
      ? currentMonitor?.finishCandidateStartedAt ?? now
      : null;
    const elapsedMs = candidateStartedAt ? now.getTime() - candidateStartedAt.getTime() : 0;
    const canAutoFinish = shouldCandidate && elapsedMs >= holdMinutes * 60 * 1000;

    const reason = getAutoFinishReason({
      recruitNo: party.recruitNo,
      title: party.title,
      expectedCount: expectedDiscordIds.length,
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
          status: canAutoFinish ? "AUTO_FINISHED" : shouldCandidate ? "FINISH_CANDIDATE" : "ACTIVE",
          lastExpectedCount: expectedDiscordIds.length,
          lastPresentExpectedCount: presentExpectedCount,
          lastNonParticipantCount: nonParticipantCount,
          finishCandidateStartedAt: candidateStartedAt,
          lastScannedAt: now,
          autoFinishedAt: canAutoFinish ? now : null,
          autoFinishReason: canAutoFinish ? reason : null,
        },
        update: {
          voiceChannelId: channelId,
          status: canAutoFinish ? "AUTO_FINISHED" : shouldCandidate ? "FINISH_CANDIDATE" : "ACTIVE",
          lastExpectedCount: expectedDiscordIds.length,
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
          message: `디스코드 활동 종료 감지 자동 마감: #${fresh.recruitNo} ${fresh.title}`,
          targetType: "RecruitParty",
          targetId: fresh.id,
          afterJson: { reason, channelId, expectedCount: expectedDiscordIds.length, presentExpectedCount, nonParticipantCount },
          db: tx,
        });
      });
    }

    results.push({
      recruitNo: party.recruitNo,
      title: party.title,
      expectedCount: expectedDiscordIds.length,
      presentExpectedCount,
      nonParticipantCount,
      status: canAutoFinish ? "AUTO_FINISHED" : shouldCandidate ? "FINISH_CANDIDATE" : "ACTIVE",
      autoFinished: canAutoFinish,
      candidateStartedAt: candidateStartedAt?.toISOString() ?? null,
    });
  }

  const finished = results.filter((item) => item.autoFinished).map((item) => `#${item.recruitNo} ${item.title}`);

  return NextResponse.json({
    ok: true,
    channelId,
    dryRun,
    finished,
    kakaoReply:
      finished.length > 0
        ? `[K-LOL.GG 구인 자동 마감]\n${finished.join("\n")}\n디스코드 활동 종료로 자동 마감 처리되었습니다.`
        : "",
    results,
  });
}
