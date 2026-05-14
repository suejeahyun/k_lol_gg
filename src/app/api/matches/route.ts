export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateMatchCreateInput } from "@/validations/match";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { recalculateSeasonStats } from "@/lib/stats/recalculate";
import { parseKstDateTime } from "@/lib/date/kst";
import { updateInternalMmrAfterMatch } from "@/lib/balance/internal-mmr";
import { getStoredGameMvpFields } from "@/lib/match/mvp";
import { getPaginationMeta, getSafePagination } from "@/lib/http/pagination";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type CreateParticipantInput = {
  playerId: number;
  championId: number;
  team: Team;
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
};

type CreateGameInput = {
  gameNumber: number;
  winnerTeam?: Team;
  participants: CreateParticipantInput[];
};

type CreateMatchInput = {
  seasonId: number;
  title: string;
  matchDate: string;
  games: CreateGameInput[];
};

export async function GET(req: NextRequest) {
  try {
    const hasPaginationQuery =
      req.nextUrl.searchParams.has("page") ||
      req.nextUrl.searchParams.has("pageSize") ||
      req.nextUrl.searchParams.has("meta");
    const pagination = getSafePagination({
      page: req.nextUrl.searchParams.get("page"),
      pageSize: req.nextUrl.searchParams.get("pageSize"),
      defaultPageSize: 50,
      maxPageSize: 100,
    });

    const [matches, totalCount] = await Promise.all([
      prisma.matchSeries.findMany({
        include: {
          season: true,
          games: true,
        },
        orderBy: {
          matchDate: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.matchSeries.count(),
    ]);

    const meta = getPaginationMeta(totalCount, pagination);

    if (!hasPaginationQuery) {
      return NextResponse.json(matches, {
        headers: {
          "Cache-Control": "no-store",
          "X-Total-Count": String(totalCount),
          "X-Page": String(meta.page),
          "X-Page-Size": String(meta.pageSize),
          "X-Total-Pages": String(meta.totalPages),
        },
      });
    }

    return NextResponse.json(
      { data: matches, meta },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[MATCH_LIST_GET_ERROR]", error);

    return NextResponse.json(
      { message: "내전 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = (await req.json()) as CreateMatchInput;

    const validation = validateMatchCreateInput(body);
    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message },
        { status: 400 }
      );
    }

    const parsedMatchDate = parseKstDateTime(body.matchDate);
    if (!parsedMatchDate) {
      return NextResponse.json(
        { message: "내전 일시 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const season = await prisma.season.findUnique({
      where: { id: body.seasonId },
      select: { id: true, name: true },
    });

    if (!season) {
      return NextResponse.json(
        { message: "존재하지 않는 시즌입니다." },
        { status: 400 }
      );
    }

    const duplicateMatch = await prisma.matchSeries.findFirst({
      where: {
        seasonId: body.seasonId,
        title: body.title.trim(),
        matchDate: parsedMatchDate,
      },
      select: { id: true, title: true },
    });

    if (duplicateMatch) {
      return NextResponse.json(
        {
          message:
            "같은 시즌, 제목, 일시로 등록된 내전이 이미 있습니다. 중복 등록 여부를 확인해주세요.",
          duplicateMatchId: duplicateMatch.id,
        },
        { status: 409 },
      );
    }

    const playerIds = [
      ...new Set(
        body.games.flatMap((game) =>
          game.participants.map((participant) => participant.playerId)
        )
      ),
    ];

    const championIds = [
      ...new Set(
        body.games.flatMap((game) =>
          game.participants.map((participant) => participant.championId)
        )
      ),
    ];

    const [players, champions] = await Promise.all([
      prisma.player.findMany({
        where: {
          id: {
            in: playerIds,
          },
        },
        select: {
          id: true,
        },
      }),
      prisma.champion.findMany({
        where: {
          id: {
            in: championIds,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (players.length !== playerIds.length) {
      return NextResponse.json(
        { message: "존재하지 않는 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    if (champions.length !== championIds.length) {
      return NextResponse.json(
        { message: "존재하지 않는 챔피언이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const match = await tx.matchSeries.create({
        data: {
          title: body.title.trim(),
          matchDate: parsedMatchDate,
          seasonId: body.seasonId,
          games: {
            create: body.games.map((game) => {
              const mvpFields = getStoredGameMvpFields(game.participants, game.winnerTeam as Team);

              return {
              gameNumber: game.gameNumber,
              durationMin: 0,
              winnerTeam: game.winnerTeam as Team,
              ...mvpFields,
              participants: {
                create: game.participants.map((participant) => ({
                  playerId: participant.playerId,
                  championId: participant.championId,
                  team: participant.team,
                  position: participant.position,
                  kills: participant.kills,
                  deaths: participant.deaths,
                  assists: participant.assists,
                })),
              },
            };
            }),
          },
        },
        include: {
          season: true,
          games: {
            include: {
              participants: true,
            },
          },
        },
      });

      await tx.adminLog.create({
        data: {
          action: "MATCH_CREATE",
          message: `내전 등록: ${match.title} / 시즌: ${match.season.name} / 세트: ${match.games.length}개`,
        },
      });

      await recalculateSeasonStats(body.seasonId, tx);
      await updateInternalMmrAfterMatch(tx, match);

      return match;
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("[MATCH_CREATE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "내전 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
