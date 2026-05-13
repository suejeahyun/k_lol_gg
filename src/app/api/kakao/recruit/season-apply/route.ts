export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { addDays, getKstDateKey, getKstStartOfDate } from "@/lib/date/kst";
import { findOrCreateAutoPlayer, matchPlayersByNames } from "@/lib/operation-ai/player-matcher";
import {
  parseParticipationText,
  type ApplyPositionValue,
  type NormalizedTier,
  type ParsedParticipationRow,
} from "@/lib/operation-ai/participation-parser";

const KAKAO_SOURCE = "KAKAO_OPENCHAT";
const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPosition = (typeof POSITIONS)[number];

type RecruitBody = {
  secret?: string;
  room?: string;
  sender?: string;
  message?: string;
  applyDate?: string;
  createMissingPlayers?: boolean;
  syncRemoved?: boolean;
};

type AppliedResult = {
  slotNo: number;
  playerId: number;
  name: string;
  currentTier: NormalizedTier | null;
  peakTier: NormalizedTier | null;
  mainPosition: ApplyPositionValue;
  subPositions: ApplyPositionValue[];
  createdPlayer: boolean;
  warnings: string[];
};

type SkippedResult = {
  slotNo: number;
  name: string;
  reason: string;
  warnings: string[];
};

type CancelledResult = {
  playerId: number;
  name: string;
  mainPosition: string | null;
};

function isApplyPosition(value: unknown): value is ApplyPosition {
  return typeof value === "string" && POSITIONS.includes(value as ApplyPosition);
}

function getSecret() {
  return String(process.env.KAKAO_RECRUIT_SECRET || "").trim();
}

function timingSafeTextEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  try {
    return createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");
  } catch {
    return false;
  }
}

function hashMessage(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseApplyDate(message: string, explicitDate: string | undefined) {
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return getKstStartOfDate(explicitDate);
  }

  const currentYear = Number(getKstDateKey().slice(0, 4));
  const dateMatch = message.match(/(?:^|[^0-9])(\d{1,2})\s*[./월]\s*(\d{1,2})(?:\s*일)?(?:[^0-9]|$)/);

  if (dateMatch) {
    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dateKey = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return getKstStartOfDate(dateKey);
    }
  }

  return getKstStartOfDate(getKstDateKey());
}

function sanitizeRows(rows: ParsedParticipationRow[]) {
  const result: ParsedParticipationRow[] = [];
  const usedOrders = new Set<number>();
  const usedNames = new Set<string>();

  for (const row of rows) {
    const nameKey = row.name.replace(/\s+/g, "").toLowerCase();

    if (usedOrders.has(row.order)) {
      result.push({ ...row, warnings: [...row.warnings, `${row.order}번이 중복되어 보류 대상입니다.`] });
      continue;
    }

    if (usedNames.has(nameKey)) {
      result.push({ ...row, warnings: [...row.warnings, `이름 '${row.name}'이 중복되어 보류 대상입니다.`] });
      continue;
    }

    usedOrders.add(row.order);
    usedNames.add(nameKey);
    result.push(row);
  }

  return result;
}

function positionCountsFromApplied(applied: AppliedResult[]) {
  const counts: Record<Exclude<ApplyPositionValue, "ALL">, number> = {
    TOP: 0,
    JGL: 0,
    MID: 0,
    ADC: 0,
    SUP: 0,
  };

  for (const item of applied) {
    if (item.mainPosition !== "ALL") counts[item.mainPosition] += 1;
  }

  return counts;
}

function buildReply(params: {
  seasonName: string;
  applyDateKey: string;
  applied: AppliedResult[];
  skipped: SkippedResult[];
  cancelled: CancelledResult[];
}) {
  const { seasonName, applyDateKey, applied, skipped, cancelled } = params;
  const n = "\n";
  const counts = positionCountsFromApplied(applied);
  const shortage = (Object.keys(counts) as Array<keyof typeof counts>).filter((position) => counts[position] === 0);
  const lines: string[] = [];

  lines.push("[K-LOL.GG 구인구직방 참가 자동 등록]");
  lines.push(`시즌: ${seasonName}`);
  lines.push(`신청일: ${applyDateKey}`);
  lines.push(`등록/수정: ${applied.length}명`);
  lines.push(`취소: ${cancelled.length}명`);
  lines.push(`보류: ${skipped.length}명`);
  lines.push("");
  lines.push("포지션 현황");
  lines.push(`TOP ${counts.TOP}명`);
  lines.push(`JGL ${counts.JGL}명`);
  lines.push(`MID ${counts.MID}명`);
  lines.push(`ADC ${counts.ADC}명`);
  lines.push(`SUP ${counts.SUP}명`);
  lines.push(`부족 포지션: ${shortage.length > 0 ? shortage.join(", ") : "없음"}`);

  if (applied.length > 0) {
    lines.push("");
    lines.push("등록 목록");
    for (const item of applied.slice(0, 10)) {
      const subText = item.subPositions.length > 0 ? ` / ${item.subPositions.join(",")}` : "";
      const createdText = item.createdPlayer ? " / AUTO생성" : "";
      lines.push(`${item.slotNo}. ${item.name} / ${item.currentTier ?? "?"} / ${item.peakTier ?? "?"} / ${item.mainPosition}${subText}${createdText}`);
    }
  }

  if (cancelled.length > 0) {
    lines.push("");
    lines.push("목록에서 빠져 취소된 인원");
    for (const item of cancelled.slice(0, 10)) {
      lines.push(`- ${item.name}${item.mainPosition ? ` / ${item.mainPosition}` : ""}`);
    }
  }

  if (skipped.length > 0) {
    lines.push("");
    lines.push("확인 필요");
    for (const item of skipped.slice(0, 6)) {
      lines.push(`- ${item.slotNo}. ${item.name}: ${item.reason}`);
    }
    if (skipped.length > 6) lines.push(`- 외 ${skipped.length - 6}건`);
  }

  return lines.join(n);
}

async function findBestPlayerId(row: ParsedParticipationRow) {
  const candidatesByName = await matchPlayersByNames([row.name]);
  const candidates = candidatesByName[row.name] ?? [];
  const exactCandidate = candidates.find((candidate) => candidate.score >= 96) ?? null;

  return exactCandidate?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = getSecret();

    if (!configuredSecret) {
      return NextResponse.json(
        { ok: false, reply: "KAKAO_RECRUIT_SECRET 환경변수가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as RecruitBody;
    const requestSecret = String(body.secret || req.headers.get("x-kakao-recruit-secret") || "").trim();

    if (!requestSecret || !timingSafeTextEquals(requestSecret, configuredSecret)) {
      return NextResponse.json({ ok: false, reply: "참가 자동 등록 권한이 없습니다." }, { status: 401 });
    }

    const message = String(body.message || "").trim();
    const room = String(body.room || "").trim() || null;
    const sender = String(body.sender || "").trim() || null;
    const createMissingPlayers = body.createMissingPlayers !== false;
    const syncRemoved = body.syncRemoved !== false;

    if (!message) {
      return NextResponse.json({ ok: false, reply: "분석할 참가 신청 글이 없습니다." }, { status: 400 });
    }

    const season = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!season) {
      return NextResponse.json({ ok: false, reply: "활성 시즌이 없습니다." }, { status: 404 });
    }

    const applyDate = parseApplyDate(message, body.applyDate);
    const applyDateKey = getKstDateKey(applyDate);
    const applyDateEnd = addDays(applyDate, 1);
    applyDateEnd.setMilliseconds(applyDateEnd.getMilliseconds() - 1);
    const messageHash = hashMessage(message);
    const rows = sanitizeRows(parseParticipationText(message));

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, reply: "참가 신청 목록을 인식하지 못했습니다." }, { status: 400 });
    }

    const applied: AppliedResult[] = [];
    const skipped: SkippedResult[] = [];
    const appliedPlayerIds = new Set<number>();

    for (const row of rows) {
      const name = row.name.trim();
      const rowWarnings = [...row.warnings];

      if (!name) {
        skipped.push({ slotNo: row.order, name: "-", reason: "이름 없음", warnings: rowWarnings });
        continue;
      }

      if (!isApplyPosition(row.mainPosition) || row.mainPosition === "ALL") {
        skipped.push({ slotNo: row.order, name, reason: "주라인 확인 필요", warnings: rowWarnings });
        continue;
      }

      const subPositions = row.subPositions.filter(isApplyPosition).filter((position) => position !== "ALL");
      let playerId = await findBestPlayerId(row);
      let createdPlayer = false;

      if (!playerId) {
        if (!createMissingPlayers) {
          skipped.push({ slotNo: row.order, name, reason: "DB 플레이어 매칭 필요", warnings: rowWarnings });
          continue;
        }

        playerId = await findOrCreateAutoPlayer({
          name,
          currentTier: row.currentTier,
          peakTier: row.peakTier,
        });
        createdPlayer = true;
      }

      await prisma.seasonParticipationApply.upsert({
        where: {
          seasonId_playerId_applyDate: {
            seasonId: season.id,
            playerId,
            applyDate,
          },
        },
        create: {
          seasonId: season.id,
          playerId,
          applyDate,
          mainPosition: row.mainPosition,
          subPositions,
          status: "APPLIED",
          source: KAKAO_SOURCE,
          sourceRoom: room,
          sourceSender: sender,
          sourceMessageHash: messageHash,
          sourceSlotNo: row.order,
        },
        update: {
          mainPosition: row.mainPosition,
          subPositions,
          status: "APPLIED",
          source: KAKAO_SOURCE,
          sourceRoom: room,
          sourceSender: sender,
          sourceMessageHash: messageHash,
          sourceSlotNo: row.order,
        },
      });

      appliedPlayerIds.add(playerId);
      applied.push({
        slotNo: row.order,
        playerId,
        name,
        currentTier: row.currentTier,
        peakTier: row.peakTier,
        mainPosition: row.mainPosition,
        subPositions,
        createdPlayer,
        warnings: rowWarnings,
      });
    }

    const cancelled: CancelledResult[] = [];

    if (syncRemoved) {
      const previousAutoApplies = await prisma.seasonParticipationApply.findMany({
        where: {
          seasonId: season.id,
          applyDate: {
            gte: applyDate,
            lte: applyDateEnd,
          },
          source: KAKAO_SOURCE,
          status: "APPLIED",
        },
        select: {
          id: true,
          playerId: true,
          mainPosition: true,
          player: {
            select: {
              name: true,
              nickname: true,
              tag: true,
            },
          },
        },
      });

      const idsToCancel = previousAutoApplies
        .filter((item) => !appliedPlayerIds.has(item.playerId))
        .map((item) => item.id);

      if (idsToCancel.length > 0) {
        await prisma.seasonParticipationApply.updateMany({
          where: { id: { in: idsToCancel } },
          data: {
            status: "CANCELLED",
            sourceMessageHash: messageHash,
          },
        });

        for (const item of previousAutoApplies) {
          if (!appliedPlayerIds.has(item.playerId)) {
            cancelled.push({
              playerId: item.playerId,
              name: item.player.name || item.player.nickname,
              mainPosition: item.mainPosition,
            });
          }
        }
      }
    }

    await prisma.operationAiRequest
      .create({
        data: {
          taskType: "KAKAO_RECRUIT_SEASON_APPLY",
          status: skipped.length > 0 ? "PENDING" : "CONFIRMED",
          prompt: "카카오 구인구직방 시즌 내전 참가 신청 자동 등록",
          rawText: message,
          parsedJson: {
            room,
            sender,
            rows,
            applied,
            skipped,
            cancelled,
            applyDate: applyDate.toISOString(),
          } as Prisma.InputJsonValue,
          resultJson: {
            season,
            applyDate: applyDate.toISOString(),
            messageHash,
          } as Prisma.InputJsonValue,
          createdByUserId: "KAKAO_BOT",
        },
      })
      .catch(() => null);

    await writeAdminLog({
      action: "KAKAO_RECRUIT_SEASON_APPLY",
      message: `카카오 구인구직방 참가 자동 등록: ${applied.length}명 등록/수정, ${cancelled.length}명 취소, ${skipped.length}명 보류`,
      actorType: "KAKAO_BOT",
      actorUserId: sender || room || "KAKAO_BOT",
      targetType: "SeasonParticipationApply",
      afterJson: {
        season,
        applyDate: applyDate.toISOString(),
        appliedCount: applied.length,
        cancelledCount: cancelled.length,
        skippedCount: skipped.length,
      } as Prisma.InputJsonValue,
    });

    const reply = buildReply({
      seasonName: season.name,
      applyDateKey,
      applied,
      skipped,
      cancelled,
    });

    return NextResponse.json({
      ok: true,
      reply,
      season,
      applyDate: applyDate.toISOString(),
      appliedCount: applied.length,
      cancelledCount: cancelled.length,
      skippedCount: skipped.length,
      applied,
      skipped,
      cancelled,
    });
  } catch (error: unknown) {
    console.error("[KAKAO_RECRUIT_SEASON_APPLY_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        reply: "카카오 참가 신청 자동 등록 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
