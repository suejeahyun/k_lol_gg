export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { DestructionPreliminaryFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { parseDestructionLaneLimits } from "@/lib/destruction/recruitment-auto-reserve";
import { readJsonObject } from "@/lib/http/json-body";

type CreateTournamentBody = Record<string, unknown>;

const MAX_ADMIN_DESTRUCTION_TOURNAMENTS = 50;

const PRELIMINARY_FORMATS: DestructionPreliminaryFormat[] = [
  "FULL_ROUND_ROBIN_BO3",
  "FULL_ROUND_ROBIN_BO1",
  "GROUP_ROUND_ROBIN_BO3",
  "GROUP_ROUND_ROBIN_BO1",
  "SWISS_ROUND_BO3",
  "SWISS_ROUND_BO1",
  "RANDOM_ROUNDS_BO3",
  "RANDOM_ROUNDS_BO1",
];

function isValidPreliminaryFormat(value: unknown): value is DestructionPreliminaryFormat {
  return typeof value === "string" && PRELIMINARY_FORMATS.includes(value as DestructionPreliminaryFormat);
}

function getBestOf(format: DestructionPreliminaryFormat) {
  return format.endsWith("BO3") ? 3 : 1;
}

function usesRoundCount(format: DestructionPreliminaryFormat) {
  return format.startsWith("SWISS_ROUND") || format.startsWith("RANDOM_ROUNDS");
}

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const tournaments = await prisma.destructionTournament.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_ADMIN_DESTRUCTION_TOURNAMENTS,
      include: {
        galleryImage: true,
        teams: {
          include: {
            captain: true,
            members: { include: { player: true } },
          },
        },
        participants: { include: { player: true, team: true } },
        matches: { include: { teamA: true, teamB: true } },
      },
    });

    return NextResponse.json(tournaments);
  } catch (error) {
    logServerError("[DESTRUCTION_TOURNAMENTS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 목록 조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await readJsonObject<CreateTournamentBody>(req);
    if (!body) {
      return NextResponse.json(
        { message: "올바른 JSON 요청 본문이 필요합니다." },
        { status: 400 },
      );
    }
    const title = String(body.title ?? "").trim();
    const preliminaryFormat = isValidPreliminaryFormat(body.preliminaryFormat)
      ? body.preliminaryFormat
      : "FULL_ROUND_ROBIN_BO3";
    const needsRoundCount = usesRoundCount(preliminaryFormat);
    const requestedRoundCount = Number(body.preliminaryRoundCount ?? 3);
    const preliminaryRoundCount = needsRoundCount ? requestedRoundCount : 1;
    const laneLimits = parseDestructionLaneLimits(body);

    if (!title) {
      return NextResponse.json(
        { message: "멸망전명을 입력해주세요." },
        { status: 400 },
      );
    }

    if (needsRoundCount && (!Number.isInteger(preliminaryRoundCount) || preliminaryRoundCount < 1 || preliminaryRoundCount > 10)) {
      return NextResponse.json(
        { message: "라운드 수는 1~10 사이로 입력해주세요." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.create({
      data: {
        title,
        description: null,
        status: "RECRUITING",
        startDate: null,
        endDate: null,
        preliminaryFormat,
        preliminaryBestOf: getBestOf(preliminaryFormat),
        preliminaryRoundCount,
        advanceTeamCount: 4,
        ...laneLimits,
      },
      include: {
        galleryImage: true,
        teams: true,
        participants: true,
        matches: true,
      },
    });

    await prisma.adminLog.create({
      data: {
        action: "DESTRUCTION_TOURNAMENT_CREATE",
        message: `멸망전 생성: ${tournament.title} / ${preliminaryFormat}`,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    logServerError("[DESTRUCTION_TOURNAMENTS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 생성 실패" },
      { status: 500 },
    );
  }
}
