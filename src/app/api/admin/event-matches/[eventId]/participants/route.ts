import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma, Position } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { calculateBalanceScore } from "@/lib/balance/tierScore";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

type CreateParticipantBody = {
  playerId?: number;
  position?: Position | null;
  teamId?: number | null;
  teamName?: "BLUE" | "RED" | null;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];
const MANUAL_TEAM_NAMES = ["BLUE", "RED"] as const;

function isValidPosition(position: unknown): position is Position {
  return typeof position === "string" && POSITIONS.includes(position as Position);
}

function isManualTeamName(teamName: unknown): teamName is "BLUE" | "RED" {
  return (
    typeof teamName === "string" &&
    MANUAL_TEAM_NAMES.includes(teamName as "BLUE" | "RED")
  );
}

async function recalculateEventTeamScore(tx: Prisma.TransactionClient, teamId: number) {
  const members = await tx.eventParticipant.findMany({
    where: { teamId },
    select: { balanceScore: true },
  });

  const score = members.reduce((sum, member) => sum + member.balanceScore, 0);

  await tx.eventTeam.update({
    where: { id: teamId },
    data: { score: Math.round(score * 100) / 100 },
  });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const parsedEventId = Number(eventId);

    if (!Number.isInteger(parsedEventId) || parsedEventId <= 0) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
        { status: 400 },
      );
    }

    const body = (await req.json()) as CreateParticipantBody;
    const playerId = Number(body.playerId);
    const requestedTeamId = Number(body.teamId);
    const requestedTeamName = body.teamName;

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json(
        { message: "플레이어를 선택해주세요." },
        { status: 400 },
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id: parsedEventId },
      include: {
        teams: {
          include: {
            members: {
              select: { id: true },
            },
          },
          orderBy: { seed: "asc" },
        },
        matches: {
          select: {
            id: true,
            winnerTeamId: true,
            mvpPlayerId: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (event.matches.length > 0) {
      return NextResponse.json(
        { message: "이미 대진표가 생성된 이벤트는 참가자를 추가할 수 없습니다." },
        { status: 400 },
      );
    }

    const hasSubmittedMatchResult = event.matches.some(
      (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
    );

    if (hasSubmittedMatchResult) {
      return NextResponse.json(
        { message: "이미 결과가 저장된 이벤트는 참가자를 추가할 수 없습니다." },
        { status: 400 },
      );
    }

    if (event.mode === "POSITION" && !isValidPosition(body.position)) {
      return NextResponse.json(
        { message: "포지션 모드에서는 라인을 선택해야 합니다." },
        { status: 400 },
      );
    }

    if (requestedTeamName && !isManualTeamName(requestedTeamName)) {
      return NextResponse.json(
        { message: "수동 배정 팀은 BLUE 또는 RED만 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    const player = await prisma.player.findFirst({
      where: {
        id: playerId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        currentTier: true,
        peakTier: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "등록된 활성 플레이어를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const existing = await prisma.eventParticipant.findUnique({
      where: {
        eventId_playerId: {
          eventId: parsedEventId,
          playerId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "이미 등록된 참가자입니다." },
        { status: 409 },
      );
    }

    const participantScore = calculateBalanceScore({
      currentTier: player.currentTier,
      peakTier: player.peakTier,
    });

    const participant = await prisma.$transaction(async (tx) => {
      let targetTeamId: number | null = null;

      if (Number.isInteger(requestedTeamId) && requestedTeamId > 0) {
        const team = await tx.eventTeam.findFirst({
          where: {
            id: requestedTeamId,
            eventId: parsedEventId,
          },
          include: {
            members: {
              select: { id: true },
            },
          },
        });

        if (!team) {
          throw new Error("INVALID_TEAM");
        }

        if (team.members.length >= 5) {
          throw new Error("TEAM_FULL");
        }

        targetTeamId = team.id;
      } else if (isManualTeamName(requestedTeamName)) {
        const existingTeam = await tx.eventTeam.findUnique({
          where: {
            eventId_name: {
              eventId: parsedEventId,
              name: requestedTeamName,
            },
          },
          include: {
            members: {
              select: { id: true },
            },
          },
        });

        if (existingTeam) {
          if (existingTeam.members.length >= 5) {
            throw new Error("TEAM_FULL");
          }

          targetTeamId = existingTeam.id;
        } else {
          const maxSeed = await tx.eventTeam.aggregate({
            where: { eventId: parsedEventId },
            _max: { seed: true },
          });

          const createdTeam = await tx.eventTeam.create({
            data: {
              eventId: parsedEventId,
              name: requestedTeamName,
              seed: (maxSeed._max.seed ?? 0) + 1,
              score: 0,
            },
          });

          targetTeamId = createdTeam.id;
        }
      }

      const created = await tx.eventParticipant.create({
        data: {
          eventId: parsedEventId,
          playerId,
          teamId: targetTeamId,
          position:
            event.mode === "ARAM"
              ? null
              : isValidPosition(body.position)
                ? body.position
                : null,
          balanceScore: participantScore,
        },
        include: {
          player: true,
          team: true,
        },
      });

      if (targetTeamId) {
        await recalculateEventTeamScore(tx, targetTeamId);
      }

      await tx.eventMatch.update({
        where: { id: parsedEventId },
        data: {
          status: "RECRUITING",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_PARTICIPANT_MANUAL_ADD",
          message: `이벤트 참가자 직접 추가: 이벤트 #${parsedEventId}, ${player.name} (${player.nickname}#${player.tag}), 라인 ${body.position ?? "-"}, 팀 ${created.team?.name ?? "미배정"}`,
        },
      });

      return created;
    });

    return NextResponse.json({
      message: "참가자를 추가했습니다.",
      participant,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_TEAM") {
        return NextResponse.json(
          { message: "이벤트에 속하지 않은 팀입니다." },
          { status: 400 },
        );
      }

      if (error.message === "TEAM_FULL") {
        return NextResponse.json(
          { message: "선택한 팀은 이미 5명입니다." },
          { status: 400 },
        );
      }
    }

    logServerError("[ADMIN_EVENT_PARTICIPANT_MANUAL_ADD_ERROR]", error);

    return NextResponse.json(
      { message: "참가자 직접 추가 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
