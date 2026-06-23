export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { EventTournamentStage, Prisma } from "@prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    eventId: string;
    matchId: string;
  }>;
};

type StageInfo = {
  stage: EventTournamentStage;
  size: number;
};

type TeamSeed = {
  id: number;
  seed: number | null;
};

const STAGES: StageInfo[] = [
  { stage: "ROUND_OF_32", size: 32 },
  { stage: "ROUND_OF_16", size: 16 },
  { stage: "QUARTER_FINAL", size: 8 },
  { stage: "SEMI_FINAL", size: 4 },
  { stage: "FINAL", size: 2 },
];

function getNextPowerOfTwo(value: number) {
  let size = 2;
  while (size < value) size *= 2;
  return Math.min(size, 32);
}

function getSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  return getSeedOrder(size / 2).flatMap((seed) => [seed, size + 1 - seed]);
}

function getStageBySize(size: number) {
  const found = STAGES.find((item) => item.size === size);
  return found?.stage ?? "FINAL";
}

function getNextStage(stage: EventTournamentStage) {
  const index = STAGES.findIndex((item) => item.stage === stage);
  if (index < 0 || index === STAGES.length - 1) return null;
  return STAGES[index + 1].stage;
}

function getInitialStage(teamCount: number) {
  return getStageBySize(getNextPowerOfTwo(teamCount));
}

function buildInitialRoundSources(
  teams: TeamSeed[],
  currentStageMatches: { round: number; winnerTeamId: number | null }[],
) {
  const bracketSize = getNextPowerOfTwo(teams.length);
  const seedOrder = getSeedOrder(bracketSize);
  const teamsBySeed = new Map<number, TeamSeed>();
  const winnerByRound = new Map<number, number>();
  let matchRound = 1;

  teams.forEach((team, index) => {
    teamsBySeed.set(team.seed ?? index + 1, team);
  });

  currentStageMatches.forEach((match) => {
    if (match.winnerTeamId) {
      winnerByRound.set(match.round, match.winnerTeamId);
    }
  });

  const sources: number[] = [];

  for (let i = 0; i < seedOrder.length; i += 2) {
    const teamA = teamsBySeed.get(seedOrder[i]) ?? null;
    const teamB = teamsBySeed.get(seedOrder[i + 1]) ?? null;

    if (teamA && teamB) {
      const winnerTeamId = winnerByRound.get(matchRound);
      if (winnerTeamId) sources.push(winnerTeamId);
      matchRound += 1;
    } else if (teamA || teamB) {
      sources.push((teamA ?? teamB)!.id);
    }
  }

  return sources;
}

async function createNextRoundIfReady(
  tx: Prisma.TransactionClient,
  eventId: number,
  currentStage: EventTournamentStage,
) {
  const event = await tx.eventMatch.findUnique({
    where: { id: eventId },
    include: {
      teams: {
        orderBy: [{ seed: "asc" }, { id: "asc" }],
        select: { id: true, seed: true },
      },
      matches: {
        orderBy: [{ stage: "asc" }, { round: "asc" }],
        select: {
          id: true,
          stage: true,
          round: true,
          teamAId: true,
          teamBId: true,
          winnerTeamId: true,
        },
      },
    },
  });

  if (!event) return;

  const nextStage = getNextStage(currentStage);
  if (!nextStage) return;

  const nextStageExists = event.matches.some((match) => match.stage === nextStage);
  if (nextStageExists) return;

  const currentStageMatches = event.matches
    .filter((match) => match.stage === currentStage)
    .sort((a, b) => a.round - b.round);

  if (currentStageMatches.length === 0) return;

  const hasUnfinished = currentStageMatches.some((match) => !match.winnerTeamId);
  if (hasUnfinished) return;

  const initialStage = getInitialStage(event.teams.length);
  const sources =
    currentStage === initialStage
      ? buildInitialRoundSources(event.teams, currentStageMatches)
      : currentStageMatches.map((match) => match.winnerTeamId!).filter(Boolean);

  if (sources.length < 2) return;

  const nextMatches = [];

  for (let i = 0; i < sources.length; i += 2) {
    const teamAId = sources[i];
    const teamBId = sources[i + 1];

    if (!teamAId || !teamBId) continue;

    nextMatches.push({
      eventId,
      stage: nextStage,
      round: nextMatches.length + 1,
      teamAId,
      teamBId,
    });
  }

  if (nextMatches.length > 0) {
    await tx.eventTournamentMatch.createMany({ data: nextMatches });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId, matchId } = await params;

    const parsedEventId = Number(eventId);
    const parsedMatchId = Number(matchId);

    if (Number.isNaN(parsedEventId) || Number.isNaN(parsedMatchId)) {
      return NextResponse.json(
        { message: "이벤트 또는 경기 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body = await req.json();

    const winnerTeamId = body.winnerTeamId ? Number(body.winnerTeamId) : null;
    const mvpPlayerId = body.mvpPlayerId ? Number(body.mvpPlayerId) : null;

    if (!winnerTeamId) {
      return NextResponse.json(
        { message: "승리 팀을 선택해주세요." },
        { status: 400 },
      );
    }

    const match = await prisma.eventTournamentMatch.findFirst({
      where: {
        id: parsedMatchId,
        eventId: parsedEventId,
      },
      include: {
        event: true,
        teamA: true,
        teamB: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { message: "이벤트 경기를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const validWinner =
      winnerTeamId === match.teamAId || winnerTeamId === match.teamBId;

    if (!validWinner) {
      return NextResponse.json(
        { message: "해당 경기의 팀만 승리 팀으로 지정할 수 있습니다." },
        { status: 400 },
      );
    }

    if (mvpPlayerId) {
      const validMvp = await prisma.eventParticipant.findFirst({
        where: {
          eventId: parsedEventId,
          playerId: mvpPlayerId,
          teamId: winnerTeamId,
        },
      });

      if (!validMvp) {
        return NextResponse.json(
          { message: "승리 팀 참가자만 MVP로 지정할 수 있습니다." },
          { status: 400 },
        );
      }
    }

    const updatedMatch = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventTournamentMatch.update({
        where: { id: parsedMatchId },
        data: { winnerTeamId, mvpPlayerId },
        include: { teamA: true, teamB: true },
      });

      if (updated.stage === "FINAL") {
        await tx.eventMatch.update({
          where: { id: parsedEventId },
          data: {
            winnerTeamId,
            mvpPlayerId,
          },
        });
      } else {
        await createNextRoundIfReady(tx, parsedEventId, updated.stage);
      }

      await tx.adminLog.create({
        data: {
          action: "EVENT_MATCH_RESULT_UPDATE",
          message: `이벤트 경기 결과 등록: ${match.event.title} / ${match.teamA.name} vs ${match.teamB.name}`,
        },
      });

      return updated;
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    logServerError("[EVENT_MATCH_RESULT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 경기 결과 등록 실패" },
      { status: 500 },
    );
  }
}

