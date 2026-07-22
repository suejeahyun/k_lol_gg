export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const isConfirmed = Boolean(body.isConfirmed);

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      include: {
        teams: {
          include: { members: true },
          orderBy: [{ id: "asc" }],
        },
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const preliminaryMatches = tournament.matches.filter((match) => match.stage === "PRELIMINARY");

    if (preliminaryMatches.length === 0) {
      return NextResponse.json(
        { message: "확정할 예선 경기가 없습니다. 먼저 예선 편성을 저장해주세요." },
        { status: 400 },
      );
    }

    const hasPreliminaryResult = preliminaryMatches.some((match) => Boolean(match.winnerTeamId));

    if (!isConfirmed && hasPreliminaryResult) {
      return NextResponse.json(
        { message: "이미 결과가 입력된 예선 경기가 있어 확정 취소를 할 수 없습니다." },
        { status: 400 },
      );
    }

    if (isConfirmed) {
      const hasInvalidTeamSize = tournament.teams.some((team) => team.members.length !== 5);
      if (hasInvalidTeamSize) {
        return NextResponse.json(
          { message: "각 팀은 5명으로 구성되어야 예선을 확정할 수 있습니다." },
          { status: 400 },
        );
      }

      const hasPositionDuplicate = tournament.teams.some((team) => {
        const positions = team.members.map((member) => member.position);
        return new Set(positions).size !== positions.length;
      });

      if (hasPositionDuplicate) {
        return NextResponse.json(
          { message: "중복 포지션이 있는 팀은 예선을 확정할 수 없습니다." },
          { status: 400 },
        );
      }

      const validTeamIds = new Set(tournament.teams.map((team) => team.id));
      const invalidMatch = preliminaryMatches.find((match) => {
        return (
          !validTeamIds.has(match.teamAId) ||
          !validTeamIds.has(match.teamBId) ||
          match.teamAId === match.teamBId ||
          match.bestOf <= 0
        );
      });

      if (invalidMatch) {
        return NextResponse.json(
          { message: "예선 경기 편성에 잘못된 팀 또는 BO 값이 있습니다." },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.destructionMatch.updateMany({
        where: { tournamentId: id, stage: "PRELIMINARY" },
        data: { isConfirmed },
      });

      if (isConfirmed) {
        await tx.destructionTournament.update({
          where: { id },
          data: { status: "PRELIMINARY" },
        });
      }

      await tx.adminLog.create({
        data: {
          action: isConfirmed
            ? "DESTRUCTION_PRELIMINARY_CONFIRM"
            : "DESTRUCTION_PRELIMINARY_UNCONFIRM",
          message: isConfirmed
            ? `멸망전 예선 편성 확정: ${tournament.title}`
            : `멸망전 예선 편성 확정 취소: ${tournament.title}`,
        },
      });

      return tx.destructionMatch.findMany({
        where: { tournamentId: id, stage: "PRELIMINARY" },
        include: { teamA: true, teamB: true },
        orderBy: [{ preliminaryGroup: "asc" }, { round: "asc" }],
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[DESTRUCTION_PRELIMINARY_CONFIRM_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 예선 편성 확정 상태 변경 실패" },
      { status: 500 },
    );
  }
}
