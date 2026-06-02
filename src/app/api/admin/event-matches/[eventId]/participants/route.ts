export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
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
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidPosition(position: unknown): position is Position {
  return typeof position === "string" && POSITIONS.includes(position as Position);
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
          select: {
            id: true,
          },
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

    if (event.teams.length > 0) {
      return NextResponse.json(
        { message: "이미 팀이 생성된 이벤트는 참가자를 추가할 수 없습니다." },
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

    const participant = await prisma.$transaction(async (tx) => {
      const created = await tx.eventParticipant.create({
        data: {
          eventId: parsedEventId,
          playerId,
          position:
            event.mode === "ARAM"
              ? null
              : isValidPosition(body.position)
                ? body.position
                : null,
          balanceScore: calculateBalanceScore({
            currentTier: player.currentTier,
            peakTier: player.peakTier,
          }),
        },
        include: {
          player: true,
          team: true,
        },
      });

      await tx.eventMatch.update({
        where: { id: parsedEventId },
        data: {
          status: "RECRUITING",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_PARTICIPANT_MANUAL_ADD",
          message: `이벤트 참가자 직접 추가: 이벤트 #${parsedEventId}, ${player.name} (${player.nickname}#${player.tag})`,
        },
      });

      return created;
    });

    return NextResponse.json({
      message: "참가자를 추가했습니다.",
      participant,
    });
  } catch (error) {
    console.error("[ADMIN_EVENT_PARTICIPANT_MANUAL_ADD_ERROR]", error);

    return NextResponse.json(
      { message: "참가자 직접 추가 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
