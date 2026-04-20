import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

type UpdatePlayerBody = {
  name?: string;
  nickname?: string;
  tag?: string;
  peakTier?: string | null;
  currentTier?: string | null;
};

function normalizeTier(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidTierValue(value?: string | null) {
  const tier = normalizeTier(value);

  if (!tier) return true;

  const basicRegex = /^(아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아) [1-4]$/;
  const masterRegex = /^마스터 (10층|[1-9]층)$/;
  const highRegex = /^(그랜드마스터|챌린저) \d+$/;

  return basicRegex.test(tier) || masterRegex.test(tier) || highRegex.test(tier);
}

function toRiotOverview(
  snapshot: {
    puuid: string | null;
    summonerId: string | null;
    gameName: string | null;
    tagLine: string | null;
    summonerLevel: number | null;
    soloTier: string | null;
    soloRank: string | null;
    soloLp: number | null;
    soloWins: number | null;
    soloLosses: number | null;
    soloWinRate: number | null;
    flexTier: string | null;
    flexRank: string | null;
    flexLp: number | null;
    flexWins: number | null;
    flexLosses: number | null;
    flexWinRate: number | null;
    totalAnalyzedMatches: number;
    lastRefreshedAt: Date | null;
    champions: Array<{
      championKey: string;
      championName: string;
      championImageUrl: string | null;
      games: number;
      wins: number;
      losses: number;
      winRate: number;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      avgKills: number;
      avgDeaths: number;
      avgAssists: number;
      kda: string | null;
      avgDamageDealtToChampions: number;
      avgDamageTaken: number;
    }>;
  } | null) {
  if (!snapshot) {
    return {
      success: false,
      message: "저장된 Riot 집계 데이터가 없습니다.",
      lastRefreshedAt: null,
      championSummary: [],
      totalAnalyzedMatches: 0,
    };
  }

  return {
    success: true,
    message: undefined,
    account:
      snapshot.puuid && snapshot.gameName && snapshot.tagLine
        ? {
            puuid: snapshot.puuid,
            gameName: snapshot.gameName,
            tagLine: snapshot.tagLine,
          }
        : null,
    summoner:
      snapshot.summonerId || snapshot.summonerLevel !== null
        ? {
            id: snapshot.summonerId ?? undefined,
            level: snapshot.summonerLevel ?? 0,
          }
        : null,
    soloRank: snapshot.soloTier && snapshot.soloRank
      ? {
          tier: snapshot.soloTier,
          rank: snapshot.soloRank,
          leaguePoints: snapshot.soloLp ?? 0,
          wins: snapshot.soloWins ?? 0,
          losses: snapshot.soloLosses ?? 0,
          winRate: snapshot.soloWinRate ?? 0,
        }
      : null,
    flexRank: snapshot.flexTier && snapshot.flexRank
      ? {
          tier: snapshot.flexTier,
          rank: snapshot.flexRank,
          leaguePoints: snapshot.flexLp ?? 0,
          wins: snapshot.flexWins ?? 0,
          losses: snapshot.flexLosses ?? 0,
          winRate: snapshot.flexWinRate ?? 0,
        }
      : null,
    championSummary: snapshot.champions.map((champion) => ({
      championKey: champion.championKey,
      championName: champion.championName,
      championImageUrl: champion.championImageUrl,
      games: champion.games,
      wins: champion.wins,
      losses: champion.losses,
      winRate: champion.winRate,
      totalKills: champion.totalKills,
      totalDeaths: champion.totalDeaths,
      totalAssists: champion.totalAssists,
      avgKills: champion.avgKills,
      avgDeaths: champion.avgDeaths,
      avgAssists: champion.avgAssists,
      kda: champion.kda ?? "0.00",
      avgDamageDealtToChampions: champion.avgDamageDealtToChampions,
      avgDamageTaken: champion.avgDamageTaken,
    })),
    totalAnalyzedMatches: snapshot.totalAnalyzedMatches,
    lastRefreshedAt: snapshot.lastRefreshedAt?.toISOString() ?? null,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { error: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: {
            game: {
              series: {
                matchDate: "desc",
              },
            },
          },
          include: {
            champion: true,
            game: {
              include: {
                series: {
                  include: {
                    season: true,
                  },
                },
              },
            },
          },
        },
        riotSnapshot: {
          include: {
            champions: {
              orderBy: [
                { games: "desc" },
                { winRate: "desc" },
                { championName: "asc" },
              ],
            },
          },
        },
      },
    });

    if (!player) {
      return NextResponse.json(
        { error: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const riotOverview = toRiotOverview(player.riotSnapshot);

    return NextResponse.json({
      ...player,
      riotOverview,
    });
  } catch (error) {
    console.error("[PLAYER_DETAIL_GET_ERROR]", error);

    return NextResponse.json(
      { error: "플레이어 상세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { error: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdatePlayerBody;

    const name = body.name?.trim();
    const nickname = body.nickname?.trim();
    const tag = body.tag?.trim();
    const peakTier = normalizeTier(body.peakTier);
    const currentTier = normalizeTier(body.currentTier);

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { error: "이름, 닉네임, 태그는 필수입니다." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(peakTier) || !isValidTierValue(currentTier)) {
      return NextResponse.json(
        {
          error:
            "티어 형식이 올바르지 않습니다. 예: 브론즈 2, 에메랄드 1, 마스터 3층, 그랜드마스터 500",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.player.findFirst({
      where: {
        nickname,
        tag,
        NOT: {
          id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "동일한 닉네임#태그를 가진 플레이어가 이미 존재합니다." },
        { status: 409 }
      );
    }

    const updatedPlayer = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        tag,
        peakTier,
        currentTier,
      },
      include: {
        riotSnapshot: {
          include: {
            champions: {
              orderBy: [
                { games: "desc" },
                { winRate: "desc" },
                { championName: "asc" },
              ],
            },
          },
        },
      },
    });

    return NextResponse.json({
      ...updatedPlayer,
      riotOverview: toRiotOverview(updatedPlayer.riotSnapshot),
    });
  } catch (error) {
    console.error("[PLAYER_DETAIL_PATCH_ERROR]", error);

    return NextResponse.json(
      { error: "플레이어 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}