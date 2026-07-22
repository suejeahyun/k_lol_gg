export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { EventMatchMode, EventTournamentStage } from "@prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type TeamSeed = {
  id: number;
  name: string;
  seed: number | null;
  score: number;
  members: { id: number }[];
};

type MatchCreateInput = {
  eventId: number;
  stage: EventTournamentStage;
  round: number;
  teamAId: number;
  teamBId: number;
};

type SeedMode = "SCORE" | "RANDOM";

const STAGE_BY_SIZE: Record<number, EventTournamentStage> = {
  2: "FINAL",
  4: "SEMI_FINAL",
  8: "QUARTER_FINAL",
  16: "ROUND_OF_16",
  32: "ROUND_OF_32",
};

function getNextPowerOfTwo(value: number) {
  let size = 2;
  while (size < value) size *= 2;
  return Math.min(size, 32);
}

function getSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  return getSeedOrder(size / 2).flatMap((seed) => [seed, size + 1 - seed]);
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function resolveSeedMode(input: unknown, eventMode: EventMatchMode): SeedMode {
  if (input === "SCORE" || input === "RANDOM") return input;
  return eventMode === "POSITION" ? "SCORE" : "RANDOM";
}

function createInitialMatches(
  eventId: number,
  stage: EventTournamentStage,
  seededTeams: TeamSeed[],
) {
  const bracketSize = getNextPowerOfTwo(seededTeams.length);
  const seedOrder = getSeedOrder(bracketSize);
  const teamsBySeed = new Map<number, TeamSeed>();

  seededTeams.forEach((team, index) => {
    teamsBySeed.set(index + 1, team);
  });

  const slots = seedOrder.map((seed) => teamsBySeed.get(seed) ?? null);
  const matchData: MatchCreateInput[] = [];

  for (let i = 0; i < slots.length; i += 2) {
    const teamA = slots[i];
    const teamB = slots[i + 1];

    if (teamA && teamB) {
      matchData.push({
        eventId,
        stage,
        round: matchData.length + 1,
        teamAId: teamA.id,
        teamBId: teamB.id,
      });
    }
  }

  return matchData;
}

export async function POST(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const id = Number(eventId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "이벤트 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      include: {
        teams: {
          include: {
            members: {
              select: { id: true },
            },
          },
          orderBy: [{ seed: "asc" }, { id: "asc" }],
        },
        matches: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (event.teams.length < 2) {
      return NextResponse.json(
        { message: "대진 생성을 위해 최소 2팀이 필요합니다." },
        { status: 400 },
      );
    }

    if (event.teams.length > 32) {
      return NextResponse.json(
        { message: "이벤트 토너먼트는 최대 32팀까지 지원합니다." },
        { status: 400 },
      );
    }

    if (event.matches.length > 0) {
      return NextResponse.json(
        { message: "이미 생성된 대진이 있습니다." },
        { status: 400 },
      );
    }

    const invalidTeam = event.teams.find((team) => team.members.length !== 5);

    if (invalidTeam) {
      return NextResponse.json(
        { message: "대진 생성 전 모든 팀은 정확히 5명이어야 합니다." },
        { status: 400 },
      );
    }

    const seedMode = resolveSeedMode(body.seedMode, event.mode);
    const sortedTeams =
      seedMode === "SCORE"
        ? [...event.teams].sort((a, b) => b.score - a.score || a.id - b.id)
        : shuffle(event.teams);

    const seededTeams = sortedTeams.map((team, index) => ({
      ...team,
      seed: index + 1,
    }));

    const bracketSize = getNextPowerOfTwo(seededTeams.length);
    const stage = STAGE_BY_SIZE[bracketSize];
    const matchData = createInitialMatches(id, stage, seededTeams);

    if (matchData.length === 0) {
      return NextResponse.json(
        { message: "생성 가능한 대진이 없습니다." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const team of seededTeams) {
        await tx.eventTeam.update({
          where: { id: team.id },
          data: { seed: team.seed },
        });
      }

      await tx.eventTournamentMatch.createMany({
        data: matchData,
      });

      await tx.eventMatch.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_BRACKET_CREATE",
          message: `이벤트 내전 대진 생성: ${event.title} / ${seedMode === "SCORE" ? "점수 시드" : "랜덤 시드"}`,
        },
      });

      return tx.eventTournamentMatch.findMany({
        where: { eventId: id },
        include: {
          teamA: true,
          teamB: true,
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[EVENT_BRACKET_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 대진 생성 실패" },
      { status: 500 },
    );
  }
}

