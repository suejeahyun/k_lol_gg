import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { getKstStartOfDate } from "@/lib/date/kst";
import { writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";
import {
  parseRecruitMessage,
  type ParsedRecruitMessage,
  type ParsedRecruitParticipant,
} from "@/lib/kakao/recruit-message-parser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_VERSION = "season-apply-format-v3";

type ApplyResult = {
  participant: ParsedRecruitParticipant;
  status: "REGISTERED" | "UPDATED" | "PENDING" | "RESERVE";
  reason?: string;
  player?: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

function simplifyPendingReason(reason?: string): string {
  const reasonText = String(reason || "").trim();

  if (reasonText.indexOf("2명 이상") >= 0 || reasonText.indexOf("동명이인") >= 0) {
    return "같은 이름/닉네임 후보가 2명 이상 있음";
  }

  if (reasonText.indexOf("매칭되지") >= 0 || reasonText.indexOf("찾을 수") >= 0) {
    return "등록된 플레이어를 찾을 수 없음";
  }

  if (reasonText.indexOf("예비") >= 0) {
    return "예비 참가자 확인 필요";
  }

  if (reasonText === "") {
    return "관리자 확인 필요";
  }

  return reasonText
    .replace(/\s*관리자 확인 필요\.?/g, "")
    .replace(/입니다\.?/g, "")
    .trim();
}

function buildPendingSummary(results: ApplyResult[]): string {
  const pendingResults = results.filter((item) => item.status === "PENDING");

  if (pendingResults.length === 0) {
    return "";
  }

  return pendingResults
    .map((result, index) => {
      const name = normalizeName(result.participant.name) || `${result.participant.slotNumber || index + 1}번 항목`;
      const reason = simplifyPendingReason(result.reason);

      if (pendingResults.length === 1) {
        return `대상: ${name}\n사유: ${reason}`;
      }

      return `${index + 1}. ${name} - ${reason}`;
    })
    .join("\n");
}

function buildReply(params: {
  parsed: ParsedRecruitMessage;
  seasonName: string;
  results: ApplyResult[];
}) {
  const registered = params.results.filter((item) => item.status === "REGISTERED").length;
  const updated = params.results.filter((item) => item.status === "UPDATED").length;
  const pending = params.results.filter((item) => item.status === "PENDING").length;
  const reserve = params.results.filter((item) => item.status === "RESERVE").length;

  if (pending > 0) {
    const pendingSummary = buildPendingSummary(params.results);

    return pendingSummary
      ? `[K-LOL.GG 구인구직방 참가 자동 등록 보류]\n\n${pendingSummary}`
      : "[K-LOL.GG 구인구직방 참가 자동 등록 보류]";
  }

  if (reserve > 0 && registered + updated === 0) {
    return "[K-LOL.GG 구인구직방 참가 예비 등록 완료]";
  }

  if (registered > 0 && updated > 0) {
    return "[K-LOL.GG 구인구직방 참가 자동 등록/수정 완료]";
  }

  if (updated > 0) {
    return "[K-LOL.GG 구인구직방 참가 자동 수정 완료]";
  }

  if (registered > 0 || reserve > 0) {
    return "[K-LOL.GG 구인구직방 참가 자동 등록 완료]";
  }

  return "[K-LOL.GG 구인구직방 참가 자동 등록 실패]";
}

function normalizeName(value: string) {
  return value.trim().replace(/^\d+\s*[.)]\s*/, "").replace(/\s+/g, " ");
}

function parseRiotId(value: string) {
  const match = value.trim().match(/^(.+?)#(.+)$/);
  if (!match) return null;

  return {
    nickname: match[1].trim(),
    tag: match[2].replace(/^#/, "").trim(),
  };
}

function getMessageHash(message: string) {
  return createHash("sha256").update(message).digest("hex");
}

async function findMatchingPlayer(participant: ParsedRecruitParticipant) {
  const name = normalizeName(participant.name);
  const riotId = parseRiotId(name);

  if (riotId?.nickname && riotId.tag) {
    const player = await prisma.player.findUnique({
      where: {
        nickname_tag: {
          nickname: riotId.nickname,
          tag: riotId.tag,
        },
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
    });

    return player ? { status: "matched" as const, players: [player] } : { status: "none" as const, players: [] };
  }

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { name },
        { nickname: name },
      ],
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
    },
    take: 3,
  });

  if (players.length === 1) return { status: "matched" as const, players };
  if (players.length > 1) return { status: "duplicate" as const, players };
  return { status: "none" as const, players };
}

async function applyParticipants(params: {
  parsed: ParsedRecruitMessage;
  message: string;
  roomName: string | null;
  sender: string | null;
}) {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error("활성 시즌이 없습니다.");
  }

  const applyDate = getKstStartOfDate(params.parsed.applyDate);
  const sourceMessageHash = getMessageHash(params.message);
  const results: ApplyResult[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.seasonParticipationPendingApply.deleteMany({
      where: {
        seasonId: season.id,
        applyDate,
        source: "KAKAO_RECRUIT",
      },
    });

    for (const participant of params.parsed.participants) {
      const matched = await findMatchingPlayer(participant);
      const pendingReason =
        matched.status === "duplicate"
          ? "동명이인 또는 동일 닉네임 후보가 2명 이상입니다. 관리자 확인 필요"
          : "기존 플레이어와 매칭되지 않았습니다. 관리자 확인 필요";

      if (participant.isReserve || matched.status !== "matched") {
        const player = matched.status === "matched" ? matched.players[0] : undefined;
        const reason = participant.isReserve
          ? player
            ? "예비 참가자"
            : `예비 참가자 / ${pendingReason}`
          : pendingReason;

        await tx.seasonParticipationPendingApply.upsert({
          where: {
            seasonId_applyDate_name_isReserve: {
              seasonId: season.id,
              applyDate,
              name: participant.name,
              isReserve: participant.isReserve,
            },
          },
          create: {
            seasonId: season.id,
            applyDate,
            name: participant.name,
            currentTier: participant.currentTier,
            peakTier: participant.peakTier,
            mainPosition: participant.mainPosition,
            subPositions: participant.subPosition ? [participant.subPosition] : [],
            isReserve: participant.isReserve,
            sourceSlotNo: participant.isReserve ? null : participant.slotNumber,
            reserveSlotNo: participant.reserveSlotNumber,
            reason,
            source: "KAKAO_RECRUIT",
            sourceRoom: params.roomName,
            sourceSender: params.sender,
            sourceMessageHash,
            applyTimeText: params.parsed.applyTime,
          },
          update: {
            currentTier: participant.currentTier,
            peakTier: participant.peakTier,
            mainPosition: participant.mainPosition,
            subPositions: participant.subPosition ? [participant.subPosition] : [],
            sourceSlotNo: participant.isReserve ? null : participant.slotNumber,
            reserveSlotNo: participant.reserveSlotNumber,
            reason,
            source: "KAKAO_RECRUIT",
            sourceRoom: params.roomName,
            sourceSender: params.sender,
            sourceMessageHash,
            applyTimeText: params.parsed.applyTime,
          },
        });

        results.push({
          participant,
          status: participant.isReserve ? "RESERVE" : "PENDING",
          reason,
          player,
        });
        continue;
      }

      const player = matched.players[0];
      const existing = await tx.seasonParticipationApply.findUnique({
        where: {
          seasonId_playerId_applyDate: {
            seasonId: season.id,
            playerId: player.id,
            applyDate,
          },
        },
        select: { id: true, status: true },
      });

      await tx.seasonParticipationApply.upsert({
        where: {
          seasonId_playerId_applyDate: {
            seasonId: season.id,
            playerId: player.id,
            applyDate,
          },
        },
        create: {
          seasonId: season.id,
          playerId: player.id,
          applyDate,
          mainPosition: participant.mainPosition,
          subPositions: participant.subPosition ? [participant.subPosition] : [],
          status: "APPLIED",
          source: "KAKAO_RECRUIT",
          sourceRoom: params.roomName,
          sourceSender: params.sender,
          sourceMessageHash,
          sourceSlotNo: participant.slotNumber,
          applyTimeText: params.parsed.applyTime,
        },
        update: {
          mainPosition: participant.mainPosition,
          subPositions: participant.subPosition ? [participant.subPosition] : [],
          status: "APPLIED",
          source: "KAKAO_RECRUIT",
          sourceRoom: params.roomName,
          sourceSender: params.sender,
          sourceMessageHash,
          sourceSlotNo: participant.slotNumber,
          applyTimeText: params.parsed.applyTime,
        },
      });

      results.push({
        participant,
        status: existing ? "UPDATED" : "REGISTERED",
        player,
      });
    }

    await writeAdminLog({
      action: "KAKAO_RECRUIT_SEASON_APPLY",
      message: `카카오 참가 자동 등록: 시즌 #${season.id} ${season.name}, 등록/수정 ${results.filter((item) => item.status === "REGISTERED" || item.status === "UPDATED").length}명, 보류 ${results.filter((item) => item.status === "PENDING").length}명, 예비 ${results.filter((item) => item.status === "RESERVE").length}명`,
      targetType: "Season",
      targetId: season.id,
      afterJson: {
        applyDate: applyDate.toISOString(),
        sourceMessageHash,
        results: results.map((item) => ({
          slotNumber: item.participant.slotNumber,
          name: item.participant.name,
          status: item.status,
          reason: item.reason ?? null,
          playerId: item.player?.id ?? null,
          isReserve: item.participant.isReserve,
          reserveSlotNumber: item.participant.reserveSlotNumber,
        })),
      },
      db: tx,
    });
  });

  return { season, applyDate, results };
}

function rejectIfInvalidSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || secretText === secret) {
    return null;
  }

  return kakaoJsonReply(
    {
      formatVersion: FORMAT_VERSION,
      reply: "[K-LOL.GG 참가 신청 등록 실패]",
    },
    401,
  );
}

function normalizeCommand(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function getTodayKstDateText() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("오늘 날짜를 계산하지 못했습니다.");
  }

  return `${year}-${month}-${day}`;
}

async function resetTodaySeasonApply(params: {
  message: string;
  roomName: string | null;
  sender: string | null;
}) {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error("활성 시즌이 없습니다.");
  }

  const todayText = getTodayKstDateText();
  const applyDate = getKstStartOfDate(todayText);

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.seasonParticipationApply.deleteMany({
      where: {
        seasonId: season.id,
        applyDate,
      },
    });

    await writeAdminLog({
      action: "KAKAO_RECRUIT_SEASON_APPLY_RESET",
      message: `카카오 구인구직방 오늘 내전 참가 초기화: 시즌 #${season.id} ${season.name}, 신청일 ${todayText}, 삭제 ${deleted.count}명`,
      targetType: "Season",
      targetId: season.id,
      afterJson: {
        command: params.message,
        applyDate: applyDate.toISOString(),
        applyDateKst: todayText,
        roomName: params.roomName,
        sender: params.sender,
        deletedCount: deleted.count,
      },
      db: tx,
    });

    return deleted;
  });

  return {
    season,
    todayText,
    applyDate,
    deletedCount: result.count,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const secretRejected = rejectIfInvalidSecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = String(body.message || body.text || body.utterance || "");
    const roomName =
      typeof body.roomName === "string"
        ? body.roomName
        : typeof body.room === "string"
          ? body.room
          : null;
    const sender = typeof body.sender === "string" ? body.sender : null;

    if (normalizeCommand(message) === "오늘내전초기화") {
      const reset = await resetTodaySeasonApply({
        message,
        roomName,
        sender,
      });

      return kakaoJsonReply({
        formatVersion: FORMAT_VERSION,
        command: "TODAY_SEASON_APPLY_RESET",
        season: reset.season,
        applyDate: reset.todayText,
        deletedCount: reset.deletedCount,
        reply: "[K-LOL.GG 구인구직방 참가 초기화]",
      });
    }

    const parsed = parseRecruitMessage(message);

    if (parsed.participants.length < 1) {
      return kakaoJsonReply({
        formatVersion: FORMAT_VERSION,
        reply: "[K-LOL.GG 구인구직방 참가 자동 등록 실패]",
        parsed,
      });
    }

    const applied = await applyParticipants({
      parsed,
      message,
      roomName,
      sender,
    });

    const registered = applied.results.filter((item) => item.status === "REGISTERED").length;
    const updated = applied.results.filter((item) => item.status === "UPDATED").length;
    const pending = applied.results.filter((item) => item.status === "PENDING").length;
    const reserve = applied.results.filter((item) => item.status === "RESERVE").length;

    return kakaoJsonReply({
      formatVersion: FORMAT_VERSION,
      season: applied.season,
      applyDate: parsed.applyDate,
      applyTime: parsed.applyTime,
      registered,
      updated,
      cancelled: 0,
      pending,
      reserve,
      participants: parsed.participants,
      results: applied.results,
      reply: buildReply({
        parsed,
        seasonName: applied.season.name,
        results: applied.results,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return kakaoJsonReply(
      {
        formatVersion: FORMAT_VERSION,
        reply: "[K-LOL.GG 참가 신청 등록 실패]",
        error: message,
      },
      500,
    );
  }
}
