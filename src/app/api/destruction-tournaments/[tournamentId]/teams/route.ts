export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { DestructionAuctionStatus, Position } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { readJsonObject } from "@/lib/http/json-body";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type TeamInput = {
  name: string;
  captainId: number;
  captainPosition: Position;
  initialAuctionPoints?: number;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];
const MAX_DESTRUCTION_TEAMS = 99;
const MAX_TEAM_NAME_LENGTH = 50;
const MAX_INITIAL_AUCTION_POINTS = 1_000_000;

function isValidPosition(position: unknown): position is Position {
  return typeof position === "string" && POSITIONS.includes(position as Position);
}

function toRealPosition(position: unknown): Position | null {
  return isValidPosition(position) ? position : null;
}

export async function POST(req: NextRequest, { params }: RouteProps) {
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

    const body = await readJsonObject<Record<string, unknown>>(req);
    if (!body) {
      return NextResponse.json({ message: "올바른 JSON 요청 본문이 필요합니다." }, { status: 400 });
    }
    const teams: TeamInput[] = Array.isArray(body.teams) ? body.teams : [];

    if (teams.length < 2) {
      return NextResponse.json(
        { message: "팀은 최소 2개 이상이어야 합니다." },
        { status: 400 },
      );
    }

    if (teams.length > MAX_DESTRUCTION_TEAMS) {
      return NextResponse.json(
        { message: `팀은 최대 ${MAX_DESTRUCTION_TEAMS}개까지 등록할 수 있습니다.` },
        { status: 400 },
      );
    }

    const normalizedTeamNames = teams.map((team, index) =>
      team.name?.trim() || `${String.fromCharCode(65 + index)}팀`,
    );
    if (normalizedTeamNames.some((name) => name.length > MAX_TEAM_NAME_LENGTH)) {
      return NextResponse.json(
        { message: `팀 이름은 ${MAX_TEAM_NAME_LENGTH}자 이하로 입력해주세요.` },
        { status: 400 },
      );
    }
    if (new Set(normalizedTeamNames).size !== normalizedTeamNames.length) {
      return NextResponse.json(
        { message: "중복된 팀 이름이 있습니다." },
        { status: 400 },
      );
    }

    const captainIds = teams.map((team) => Number(team.captainId));

    if (captainIds.some((captainId) => !Number.isInteger(captainId) || captainId <= 0)) {
      return NextResponse.json(
        { message: "팀장 정보가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const hasInvalidPosition = teams.some(
      (team) => !isValidPosition(team.captainPosition),
    );

    if (hasInvalidPosition) {
      return NextResponse.json(
        { message: "모든 팀장의 포지션을 선택해주세요." },
        { status: 400 },
      );
    }

    const hasInvalidPoints = teams.some((team) => {
      const points = Number(team.initialAuctionPoints ?? 0);
      return !Number.isInteger(points) || points < 0 || points > MAX_INITIAL_AUCTION_POINTS;
    });

    if (hasInvalidPoints) {
      return NextResponse.json(
        { message: `팀장 지급 포인트는 0~${MAX_INITIAL_AUCTION_POINTS.toLocaleString("ko-KR")} 범위의 정수여야 합니다.` },
        { status: 400 },
      );
    }

    const duplicatedCaptainIds = captainIds.filter(
      (captainId, index, arr) => arr.indexOf(captainId) !== index,
    );

    if (duplicatedCaptainIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 팀장이 있습니다." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        teams: true,
        matches: true,
        participationApplies: {
          where: {
            status: {
              in: ["APPLIED", "CONFIRMED"],
            },
          },
          include: {
            player: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.matches.length > 0) {
      return NextResponse.json(
        { message: "경기가 생성된 멸망전은 팀을 수정할 수 없습니다." },
        { status: 400 },
      );
    }

    const applies = tournament.participationApplies;

    if (applies.length === 0) {
      return NextResponse.json(
        { message: "참가 신청자가 없습니다. 유저 페이지에서 참가 신청을 먼저 받아주세요." },
        { status: 400 },
      );
    }

    if (applies.length % 5 !== 0) {
      return NextResponse.json(
        { message: `참가자 수가 5의 배수가 아닙니다. 현재 ${applies.length}명입니다.` },
        { status: 400 },
      );
    }

    const requiredCaptainCount = applies.length / 5;

    if (teams.length !== requiredCaptainCount) {
      return NextResponse.json(
        { message: `팀장은 정확히 ${requiredCaptainCount}명이어야 합니다.` },
        { status: 400 },
      );
    }

    const applyByPlayerId = new Map(applies.map((apply) => [apply.playerId, apply]));

    const missingCaptain = captainIds.find((captainId) => !applyByPlayerId.has(captainId));
    if (missingCaptain) {
      return NextResponse.json(
        { message: "참가 신청자 중에서만 팀장을 지정할 수 있습니다." },
        { status: 400 },
      );
    }

    const invalidApplyPosition = applies.find((apply) => !toRealPosition(apply.mainPosition));
    if (invalidApplyPosition) {
      return NextResponse.json(
        { message: "모든 참가자는 TOP/JGL/MID/ADC/SUP 중 하나의 주 포지션이 필요합니다." },
        { status: 400 },
      );
    }

    const createdTeams = await prisma.$transaction(async (tx) => {
      await tx.destructionParticipant.deleteMany({
        where: {
          tournamentId: id,
        },
      });

      await tx.destructionTeam.deleteMany({
        where: {
          tournamentId: id,
        },
      });

      const teamByCaptainId = new Map<number, { id: number; name: string }>();
      const result = [];

      for (let i = 0; i < teams.length; i += 1) {
        const team = teams[i];
        const captainId = Number(team.captainId);
        const points = Number(team.initialAuctionPoints ?? 0);

        const createdTeam = await tx.destructionTeam.create({
          data: {
            tournamentId: id,
            name: normalizedTeamNames[i],
            captainId,
            initialAuctionPoints: points,
            remainingAuctionPoints: points,
          },
        });

        teamByCaptainId.set(captainId, {
          id: createdTeam.id,
          name: createdTeam.name,
        });
        result.push(createdTeam);
      }

      const participantRows = applies.flatMap((apply) => {
        const captainTeam = teamByCaptainId.get(apply.playerId);
        const position = toRealPosition(apply.mainPosition);

        if (!position) return [];

        return [
          {
            tournamentId: id,
            teamId: captainTeam?.id ?? null,
            playerId: apply.playerId,
            position,
            balanceScore: apply.player.balanceOverrideScore ?? 0,
            isCaptain: Boolean(captainTeam),
            auctionStatus: captainTeam ? DestructionAuctionStatus.ASSIGNED : DestructionAuctionStatus.PENDING,
            purchasePoint: captainTeam ? 0 : null,
            drawOrder: null,
            soldAt: captainTeam ? new Date() : null,
          },
        ];
      });

      if (participantRows.length > 0) {
        await tx.destructionParticipant.createMany({
          data: participantRows,
        });
      }

      await tx.destructionParticipationApply.updateMany({
        where: {
          tournamentId: id,
          playerId: {
            in: applies.map((apply) => apply.playerId),
          },
        },
        data: {
          status: "CONFIRMED",
        },
      });

      await tx.destructionTournament.update({
        where: {
          id,
        },
        data: {
          status: "AUCTION",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_CAPTAINS_SELECT",
          message: `멸망전 팀장 지정 및 경매 시작: ${tournament.title}, 팀 ${teams.length}개, 참가자 ${applies.length}명`,
        },
      });

      return result;
    }, {
      maxWait: 10000,
      timeout: 20000,
    });

    return NextResponse.json(createdTeams);
  } catch (error) {
    logServerError("[DESTRUCTION_TEAMS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 팀장 지정 및 팀 생성 실패" },
      { status: 500 },
    );
  }
}


