export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { parseKstDateTime } from "@/lib/date/kst";
import { recalculateSeasonStats } from "@/lib/stats/recalculate";
import { updateInternalMmrAfterMatch } from "@/lib/balance/internal-mmr";
import { getStoredGameMvpFields } from "@/lib/match/mvp";
import { getRequestAuditFields } from "@/lib/admin-log";
import { validateMatchCreateInput } from "@/validations/match";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type ConfirmParticipantInput = {
  enabled?: boolean;
  selectedPlayerId: number | null;
  selectedChampionId: number | null;
  team: Team | null;
  position: Position | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
};

type ConfirmGameInput = {
  gameNumber: number;
  winnerTeam: Team | null;
  participants: ConfirmParticipantInput[];
};

type ConfirmInput = {
  requestId?: number;
  seasonId: number;
  title: string;
  matchDate: string;
  games: ConfirmGameInput[];
};

function isTeam(value: unknown): value is Team {
  return value === "BLUE" || value === "RED";
}

function isPosition(value: unknown): value is Position {
  return value === "TOP" || value === "JGL" || value === "MID" || value === "ADC" || value === "SUP";
}

function toRequiredPositiveInt(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function toStat(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ConfirmInput;
    const title = String(body.title ?? "").trim();
    const parsedMatchDate = parseKstDateTime(body.matchDate);

    if (!title) {
      return NextResponse.json({ message: "내전명을 입력해주세요." }, { status: 400 });
    }

    if (!parsedMatchDate) {
      return NextResponse.json({ message: "내전 일시 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const seasonId = toRequiredPositiveInt(body.seasonId);
    if (!seasonId) {
      return NextResponse.json({ message: "시즌을 선택해주세요." }, { status: 400 });
    }

    const games = Array.isArray(body.games) ? body.games : [];
    if (games.length === 0) {
      return NextResponse.json({ message: "등록할 세트가 없습니다." }, { status: 400 });
    }

    const normalizedGames = games.map((game, gameIndex) => {
      const gameNumber = toRequiredPositiveInt(game.gameNumber) ?? gameIndex + 1;
      const winnerTeam = isTeam(game.winnerTeam) ? game.winnerTeam : null;
      const participants = (Array.isArray(game.participants) ? game.participants : [])
        .filter((participant) => participant.enabled !== false)
        .map((participant) => ({
          playerId: toRequiredPositiveInt(participant.selectedPlayerId),
          championId: toRequiredPositiveInt(participant.selectedChampionId),
          team: isTeam(participant.team) ? participant.team : null,
          position: isPosition(participant.position) ? participant.position : null,
          kills: toStat(participant.kills),
          deaths: toStat(participant.deaths),
          assists: toStat(participant.assists),
        }));

      return { gameNumber, winnerTeam, participants };
    });

    const validationPayload = {
      seasonId,
      title,
      matchDate: body.matchDate,
      games: normalizedGames.map((game) => ({
        gameNumber: game.gameNumber,
        winnerTeam: game.winnerTeam ?? undefined,
        participants: game.participants.map((participant) => ({
          playerId: participant.playerId ?? 0,
          championId: participant.championId ?? 0,
          team: participant.team ?? ("" as Team),
          position: participant.position ?? ("" as Position),
          kills: participant.kills ?? -1,
          deaths: participant.deaths ?? -1,
          assists: participant.assists ?? -1,
        })),
      })),
    };

    const validation = validateMatchCreateInput(validationPayload);
    if (!validation.ok) {
      return NextResponse.json({ message: validation.message }, { status: 400 });
    }

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, name: true },
    });

    if (!season) {
      return NextResponse.json({ message: "존재하지 않는 시즌입니다." }, { status: 400 });
    }

    const duplicateMatch = await prisma.matchSeries.findFirst({
      where: {
        seasonId,
        title,
        matchDate: parsedMatchDate,
      },
      select: { id: true },
    });

    if (duplicateMatch) {
      return NextResponse.json(
        { message: "같은 시즌, 제목, 일시로 등록된 내전이 이미 있습니다.", duplicateMatchId: duplicateMatch.id },
        { status: 409 },
      );
    }

    const playerIds = Array.from(
      new Set(normalizedGames.flatMap((game) => game.participants.map((participant) => participant.playerId as number))),
    );
    const championIds = Array.from(
      new Set(normalizedGames.flatMap((game) => game.participants.map((participant) => participant.championId as number))),
    );

    const [players, champions] = await Promise.all([
      prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true } }),
      prisma.champion.findMany({ where: { id: { in: championIds } }, select: { id: true } }),
    ]);

    if (players.length !== playerIds.length) {
      return NextResponse.json({ message: "존재하지 않는 플레이어가 포함되어 있습니다." }, { status: 400 });
    }

    if (champions.length !== championIds.length) {
      return NextResponse.json({ message: "존재하지 않는 챔피언이 포함되어 있습니다." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const match = await tx.matchSeries.create({
        data: {
          title,
          matchDate: parsedMatchDate,
          seasonId,
          games: {
            create: normalizedGames.map((game) => {
              const participants = game.participants.map((participant) => ({
                playerId: participant.playerId as number,
                championId: participant.championId as number,
                team: participant.team as Team,
                position: participant.position as Position,
                kills: participant.kills as number,
                deaths: participant.deaths as number,
                assists: participant.assists as number,
              }));
              const mvpFields = getStoredGameMvpFields(participants, game.winnerTeam as Team);

              return {
                gameNumber: game.gameNumber,
                durationMin: 0,
                winnerTeam: game.winnerTeam as Team,
                ...mvpFields,
                participants: { create: participants },
              };
            }),
          },
        },
        include: {
          season: true,
          games: { include: { participants: true } },
        },
      });

      await tx.adminLog.create({
        data: {
          action: "MATCH_CREATE_BY_OPERATION_AI",
          message: `운영 AI 내전 결과 이미지 등록: ${match.title} / 시즌: ${match.season.name} / 세트: ${match.games.length}개`,
          actorId: admin.user.id,
          actorType: admin.user.role,
          actorUserId: admin.user.userId,
          targetType: "MatchSeries",
          targetId: match.id,
          afterJson: {
            matchId: match.id,
            title: match.title,
            seasonId,
            requestId: body.requestId ?? null,
            gameCount: match.games.length,
          },
          ...getRequestAuditFields(req),
        },
      });

      if (body.requestId) {
        await tx.operationAiRequest.updateMany({
          where: { id: body.requestId },
          data: {
            status: "CONFIRMED",
            resultJson: {
              createdMatchId: match.id,
              title: match.title,
              seasonId,
              gameCount: match.games.length,
            },
          },
        });
      }

      await recalculateSeasonStats(seasonId, tx);
      await updateInternalMmrAfterMatch(tx, match);

      return match;
    });

    return NextResponse.json({
      matchId: created.id,
      title: created.title,
      gameCount: created.games.length,
    });
  } catch (error) {
    console.error("[OPERATION_AI_MATCH_RESULT_CONFIRM_ERROR]", error);

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "내전 결과 등록 실패" },
      { status: 500 },
    );
  }
}
