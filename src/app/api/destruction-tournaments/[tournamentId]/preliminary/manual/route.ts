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

type GroupAssignmentInput = {
  teamId?: unknown;
  preliminaryGroup?: unknown;
};

type ManualMatchInput = {
  round?: unknown;
  preliminaryGroup?: unknown;
  teamAId?: unknown;
  teamBId?: unknown;
  bestOf?: unknown;
};

function normalizeGroup(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;

  return normalized.slice(0, 20);
}

function normalizePositiveInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeBestOf(value: unknown) {
  const parsed = Number(value ?? 3);
  if (parsed === 1 || parsed === 3 || parsed === 5) return parsed;
  return null;
}

export async function PUT(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body = await req.json();
    const saveMatches = Boolean(body.saveMatches);
    const groupAssignments = Array.isArray(body.groupAssignments)
      ? (body.groupAssignments as GroupAssignmentInput[])
      : [];
    const matches = Array.isArray(body.matches)
      ? (body.matches as ManualMatchInput[])
      : [];

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

    if (tournament.teams.length < 2) {
      return NextResponse.json(
        { message: "예선 편성을 위해 최소 2팀이 필요합니다." },
        { status: 400 },
      );
    }

    const teamIds = new Set(tournament.teams.map((team) => team.id));

    const normalizedAssignments = groupAssignments
      .map((assignment) => ({
        teamId: normalizePositiveInt(assignment.teamId),
        preliminaryGroup: normalizeGroup(assignment.preliminaryGroup),
      }))
      .filter((assignment): assignment is { teamId: number; preliminaryGroup: string | null } =>
        Boolean(assignment.teamId && teamIds.has(assignment.teamId)),
      );

    const assignmentByTeamId = new Map(
      normalizedAssignments.map((assignment) => [assignment.teamId, assignment.preliminaryGroup]),
    );

    const existingPreliminaryMatches = tournament.matches.filter((match) => match.stage === "PRELIMINARY");
    const hasPreliminaryResult = existingPreliminaryMatches.some((match) => Boolean(match.winnerTeamId));

    if (saveMatches) {
      if (hasPreliminaryResult) {
        return NextResponse.json(
          { message: "이미 결과가 입력된 예선 경기가 있어 경기 편성을 다시 저장할 수 없습니다. 조 저장만 가능합니다." },
          { status: 400 },
        );
      }

      const hasInvalidTeamSize = tournament.teams.some((team) => team.members.length !== 5);
      if (hasInvalidTeamSize) {
        return NextResponse.json(
          { message: "각 팀은 5명으로 구성되어야 예선 경기를 저장할 수 있습니다." },
          { status: 400 },
        );
      }

      const hasPositionDuplicate = tournament.teams.some((team) => {
        const positions = team.members.map((member) => member.position);
        return new Set(positions).size !== positions.length;
      });

      if (hasPositionDuplicate) {
        return NextResponse.json(
          { message: "중복 포지션이 있는 팀은 예선 경기를 저장할 수 없습니다." },
          { status: 400 },
        );
      }

      if (matches.length === 0) {
        return NextResponse.json(
          { message: "저장할 예선 경기를 1개 이상 추가해주세요." },
          { status: 400 },
        );
      }
    }

    const normalizedMatches = matches.map((match, index) => {
      const round = normalizePositiveInt(match.round) ?? index + 1;
      const teamAId = normalizePositiveInt(match.teamAId);
      const teamBId = normalizePositiveInt(match.teamBId);
      const bestOf = normalizeBestOf(match.bestOf);
      const preliminaryGroup = normalizeGroup(match.preliminaryGroup);

      return {
        tournamentId: id,
        stage: "PRELIMINARY" as const,
        round,
        preliminaryGroup,
        teamAId,
        teamBId,
        bestOf,
      };
    });

    if (saveMatches) {
      const invalidMatch = normalizedMatches.find(
        (match) =>
          !match.teamAId ||
          !match.teamBId ||
          !match.bestOf ||
          !teamIds.has(match.teamAId) ||
          !teamIds.has(match.teamBId) ||
          match.teamAId === match.teamBId,
      );

      if (invalidMatch) {
        return NextResponse.json(
          { message: "예선 경기 편성에 잘못된 팀 또는 BO 값이 있습니다." },
          { status: 400 },
        );
      }

      const roundSet = new Set(normalizedMatches.map((match) => match.round));
      if (roundSet.size !== normalizedMatches.length) {
        return NextResponse.json(
          { message: "예선 경기 번호가 중복되었습니다." },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const team of tournament.teams) {
        await tx.destructionTeam.update({
          where: { id: team.id },
          data: {
            preliminaryGroup: assignmentByTeamId.has(team.id)
              ? assignmentByTeamId.get(team.id) ?? null
              : team.preliminaryGroup ?? null,
          },
        });
      }

      if (saveMatches) {
        await tx.destructionMatch.deleteMany({
          where: { tournamentId: id, stage: "PRELIMINARY" },
        });

        await tx.destructionMatch.createMany({
          data: normalizedMatches.map((match) => ({
            tournamentId: match.tournamentId,
            stage: match.stage,
            round: match.round,
            preliminaryGroup: match.preliminaryGroup,
            teamAId: match.teamAId as number,
            teamBId: match.teamBId as number,
            bestOf: match.bestOf as number,
            isConfirmed: false,
          })),
        });

        await tx.destructionTournament.update({
          where: { id },
          data: { status: "PRELIMINARY" },
        });
      }

      await tx.adminLog.create({
        data: {
          action: saveMatches
            ? "DESTRUCTION_PRELIMINARY_MANUAL_DRAFT_SAVE"
            : "DESTRUCTION_PRELIMINARY_GROUP_SAVE",
          message: saveMatches
            ? `멸망전 수동 예선 확정 전 편성 저장: ${tournament.title} / ${normalizedMatches.length}경기`
            : `멸망전 예선 조 편성 저장: ${tournament.title}`,
        },
      });

      return tx.destructionTournament.findUnique({
        where: { id },
        include: {
          teams: { orderBy: [{ preliminaryGroup: "asc" }, { id: "asc" }] },
          matches: {
            where: { stage: "PRELIMINARY" },
            include: { teamA: true, teamB: true },
            orderBy: [{ preliminaryGroup: "asc" }, { round: "asc" }],
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[DESTRUCTION_PRELIMINARY_MANUAL_PUT_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 수동 예선 편성 저장 실패" },
      { status: 500 },
    );
  }
}
