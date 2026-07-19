export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Position, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
    participantId: string;
  }>;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isPosition(value: unknown): value is Position {
  return typeof value === "string" && POSITIONS.includes(value as Position);
}

export async function POST(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId, participantId } = await params;
    const parsedTournamentId = Number(tournamentId);
    const parsedParticipantId = Number(participantId);

    if (!Number.isInteger(parsedTournamentId) || !Number.isInteger(parsedParticipantId)) {
      return NextResponse.json(
        { message: "멸망전 또는 참가자 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const incomingPlayerId = Number(body.incomingPlayerId);
    const incomingPosition = body.incomingPosition;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!Number.isInteger(incomingPlayerId) || incomingPlayerId <= 0) {
      return NextResponse.json(
        { message: "교체 투입할 플레이어를 선택해주세요." },
        { status: 400 },
      );
    }

    if (!isPosition(incomingPosition)) {
      return NextResponse.json(
        { message: "교체 선수의 포지션을 선택해주세요." },
        { status: 400 },
      );
    }

    if (reason.length < 2 || reason.length > 500) {
      return NextResponse.json(
        { message: "교체 사유를 2자 이상 500자 이하로 입력해주세요." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id: parsedTournamentId },
      select: { id: true, title: true, status: true },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.status === "COMPLETED" || tournament.status === "CANCELLED") {
      return NextResponse.json(
        { message: "종료되거나 취소된 멸망전의 참가자는 교체할 수 없습니다." },
        { status: 400 },
      );
    }

    const [participant, incomingPlayer, duplicateParticipant] = await Promise.all([
      prisma.destructionParticipant.findFirst({
        where: {
          id: parsedParticipantId,
          tournamentId: parsedTournamentId,
        },
        include: {
          player: true,
          team: true,
        },
      }),
      prisma.player.findFirst({
        where: {
          id: incomingPlayerId,
          isActive: true,
        },
      }),
      prisma.destructionParticipant.findUnique({
        where: {
          tournamentId_playerId: {
            tournamentId: parsedTournamentId,
            playerId: incomingPlayerId,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!participant) {
      return NextResponse.json(
        { message: "교체할 참가자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (!participant.teamId || !participant.team) {
      return NextResponse.json(
        { message: "팀에 배정된 참가자만 교체할 수 있습니다." },
        { status: 400 },
      );
    }

    if (!incomingPlayer) {
      return NextResponse.json(
        { message: "활성 상태인 신규 플레이어를 찾을 수 없습니다." },
        { status: 400 },
      );
    }

    if (duplicateParticipant) {
      return NextResponse.json(
        { message: "신규 플레이어가 이미 이 멸망전에 참가하고 있습니다." },
        { status: 409 },
      );
    }

    const replacement = await prisma.$transaction(async (tx) => {
      const history = await tx.destructionParticipantReplacement.create({
        data: {
          tournamentId: parsedTournamentId,
          teamId: participant.teamId!,
          participantId: participant.id,
          outgoingPlayerId: participant.playerId,
          incomingPlayerId,
          outgoingPosition: participant.position,
          incomingPosition,
          reason,
        },
      });

      const updatedParticipant = await tx.destructionParticipant.updateMany({
        where: {
          id: participant.id,
          tournamentId: parsedTournamentId,
          playerId: participant.playerId,
        },
        data: {
          playerId: incomingPlayerId,
          position: incomingPosition,
        },
      });

      if (updatedParticipant.count !== 1) {
        throw new Error("PARTICIPANT_REPLACEMENT_CONFLICT");
      }

      if (participant.isCaptain) {
        await tx.destructionTeam.update({
          where: { id: participant.teamId! },
          data: { captainId: incomingPlayerId },
        });
      }

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_PARTICIPANT_REPLACE",
          message: `멸망전 참가자 교체: ${tournament.title} / ${participant.team!.name} / ${participant.player.nickname}#${participant.player.tag} → ${incomingPlayer.nickname}#${incomingPlayer.tag} / 사유: ${reason}`,
        },
      });

      return history;
    });

    return NextResponse.json({
      replacementId: replacement.id,
      message: `${participant.player.nickname}#${participant.player.tag} 선수를 ${incomingPlayer.nickname}#${incomingPlayer.tag} 선수로 교체했습니다.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PARTICIPANT_REPLACEMENT_CONFLICT") {
      return NextResponse.json(
        { message: "다른 관리자가 먼저 참가자를 교체했습니다. 새로고침 후 다시 시도해주세요." },
        { status: 409 },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "신규 플레이어가 이미 이 멸망전에 참가하고 있습니다." },
        { status: 409 },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return NextResponse.json(
        { message: "참가자 교체 기능의 DB 마이그레이션이 아직 적용되지 않았습니다." },
        { status: 503 },
      );
    }

    logServerError("DESTRUCTION_PARTICIPANT_REPLACE_ERROR", error);

    return NextResponse.json(
      { message: "참가자 교체 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
