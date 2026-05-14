import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { getKstStartOfDate } from "@/lib/date/kst";
import { writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";
import {
  parseRecruitMessage,
  type ParsedRecruitMessage,
  type ParsedRecruitParticipant,
  type RecruitPosition,
  type RecruitTier,
} from "@/lib/kakao/recruit-message-parser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_VERSION = "season-apply-format-v3";

const POSITION_ORDER: RecruitPosition[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const TIER_SHORT_LABEL: Record<RecruitTier, string> = {
  IRON: "I",
  BRONZE: "B",
  SILVER: "S",
  GOLD: "G",
  PLATINUM: "P",
  EMERALD: "E",
  DIAMOND: "D",
  MASTER: "M",
  GRANDMASTER: "GM",
  CHALLENGER: "C",
  UNRANKED: "U",
};

type ApplyResult = {
  participant: ParsedRecruitParticipant;
  status: "REGISTERED" | "UPDATED" | "PENDING";
  reason?: string;
  player?: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

function formatTierShort(tier: RecruitTier): string {
  return TIER_SHORT_LABEL[tier] || tier;
}

function formatApplyDateTime(applyDate: string, applyTime: string | null): string {
  if (!applyTime) return applyDate;

  const [hourText, minuteText] = applyTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return applyDate;
  }

  if (Number.isFinite(minute) && minute > 0) {
    return `${applyDate} ${hour}시 ${minute}분`;
  }

  return `${applyDate} ${hour}시`;
}

function buildPositionCounts(
  participants: ParsedRecruitParticipant[],
): Record<RecruitPosition, number> {
  const positionCounts: Record<RecruitPosition, number> = {
    TOP: 0,
    JGL: 0,
    MID: 0,
    ADC: 0,
    SUP: 0,
  };

  for (const participant of participants) {
    positionCounts[participant.mainPosition] += 1;
  }

  return positionCounts;
}

function buildRegisterList(results: ApplyResult[]): string {
  if (results.length === 0) return "없음";

  return results
    .map((result, index) => {
      const participant = result.participant;
      const tierText = `${formatTierShort(participant.currentTier)}-${formatTierShort(
        participant.peakTier,
      )}`;
      const positionText = participant.subPosition
        ? `${participant.mainPosition}-${participant.subPosition}`
        : participant.mainPosition;
      const playerText = result.player
        ? `${result.player.nickname}#${result.player.tag}`
        : result.reason || "플레이어 매칭 필요";
      const statusLabel =
        result.status === "REGISTERED"
          ? "등록"
          : result.status === "UPDATED"
            ? "수정"
            : "보류";

      return `${index + 1}. [${statusLabel}] ${participant.name} / ${tierText} / ${positionText} / ${playerText}`;
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
  const appliedParticipants = params.results
    .filter((item) => item.status !== "PENDING")
    .map((item) => item.participant);
  const positionCounts = buildPositionCounts(appliedParticipants);

  const positionSummary = POSITION_ORDER.map(
    (position) => `${position} ${positionCounts[position]}`,
  ).join(" · ");

  const missingPositions = POSITION_ORDER.filter(
    (position) => positionCounts[position] === 0,
  );

  const warningText =
    params.parsed.warnings.length > 0
      ? "\n\n주의\n" + params.parsed.warnings.map((item) => `- ${item}`).join("\n")
      : "";

  const pendingText = pending > 0
    ? "\n\n보류 사유\n" +
      params.results
        .filter((item) => item.status === "PENDING")
        .map((item) => `- ${item.participant.name}: ${item.reason || "확인 필요"}`)
        .join("\n")
    : "";

  if (pending === 0 && registered + updated > 0) {
    return (
      "[K-LOL.GG 구인구직방 참가 자동 등록 완료]\n" +
      "내전 시작 10분전에 디스코드 내전 대기방으로 와주세요."
    );
  }

  return (
    "[K-LOL.GG 구인구직방 참가 자동 등록]\n" +
    `시즌: ${params.seasonName}\n` +
    `신청일: ${formatApplyDateTime(params.parsed.applyDate, params.parsed.applyTime)}\n` +
    `등록: ${registered}명\n` +
    `수정: ${updated}명\n` +
    "취소: 0명\n" +
    `보류: ${pending}명\n\n` +
    "포지션 현황\n" +
    `${positionSummary}\n\n` +
    "부족 포지션\n" +
    `${missingPositions.length > 0 ? missingPositions.join(", ") : "없음"}\n\n` +
    "처리 목록\n" +
    buildRegisterList(params.results) +
    pendingText +
    warningText
  );
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
    for (const participant of params.parsed.participants) {
      const matched = await findMatchingPlayer(participant);

      if (matched.status !== "matched") {
        results.push({
          participant,
          status: "PENDING",
          reason:
            matched.status === "duplicate"
              ? "동명이인 또는 동일 닉네임 후보가 2명 이상입니다. 관리자 확인 필요"
              : "기존 플레이어와 매칭되지 않았습니다. 관리자 확인 필요",
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
      message: `카카오 참가 자동 등록: 시즌 #${season.id} ${season.name}, 등록/수정 ${results.filter((item) => item.status !== "PENDING").length}명, 보류 ${results.filter((item) => item.status === "PENDING").length}명`,
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

  return NextResponse.json(
    {
      ok: false,
      formatVersion: FORMAT_VERSION,
      reply: "[참가 신청 등록 실패]\n인증값이 올바르지 않습니다.",
    },
    { status: 401 },
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

      return NextResponse.json({
        ok: true,
        formatVersion: FORMAT_VERSION,
        command: "TODAY_SEASON_APPLY_RESET",
        season: reset.season,
        applyDate: reset.todayText,
        deletedCount: reset.deletedCount,
        reply:
          "[K-LOL.GG 구인구직방 참가 초기화]\n" +
          `시즌: ${reset.season.name}\n` +
          `신청일: ${reset.todayText}\n` +
          `삭제: ${reset.deletedCount}명\n\n` +
          "오늘 내전 참가 신청 기록을 초기화했습니다.",
      });
    }

    const parsed = parseRecruitMessage(message);

    if (parsed.participants.length < 1) {
      return NextResponse.json({
        ok: false,
        formatVersion: FORMAT_VERSION,
        reply:
          "[K-LOL.GG 참가 자동 등록]\n\n" +
          "등록 가능한 참가자를 찾지 못했습니다.\n\n" +
          "양식 예시\n" +
          "1.정민/m/m/ad sup",
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

    return NextResponse.json({
      ok: true,
      formatVersion: FORMAT_VERSION,
      season: applied.season,
      applyDate: parsed.applyDate,
      applyTime: parsed.applyTime,
      registered,
      updated,
      cancelled: 0,
      pending,
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

    return NextResponse.json(
      {
        ok: false,
        formatVersion: FORMAT_VERSION,
        reply: `[참가 신청 등록 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      { status: 500 },
    );
  }
}
