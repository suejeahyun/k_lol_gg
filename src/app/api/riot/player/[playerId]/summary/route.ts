import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  getChampionNameKo,
  getKoreanChampionNameMap,
} from "@/lib/riot/champion";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

type SoloMatchForSummary = {
  id: number;
  matchId: string;
  championId: number;
  championName: string;
  position: string | null;
  role: string | null;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  gameDuration: number;
  gameCreation: Date;
  summonerSpell1: number | null;
  summonerSpell2: number | null;
  primaryRuneId: number | null;
  subRuneId: number | null;
  item0: number | null;
  item1: number | null;
  item2: number | null;
  item3: number | null;
  item4: number | null;
  item5: number | null;
  item6: number | null;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
};

const RECENT_MATCH_LIMIT = 20;
const MOST_CHAMPION_LIMIT = 10;

function calculateWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) {
    return 0;
  }

  return Number(((wins / totalGames) * 100).toFixed(1));
}

function calculateKda(kills: number, deaths: number, assists: number) {
  if (deaths <= 0) {
    return Number((kills + assists).toFixed(2));
  }

  return Number(((kills + assists) / deaths).toFixed(2));
}

function getAverageKda(matches: SoloMatchForSummary[]) {
  const total = matches.reduce(
    (acc, match) => {
      acc.kills += match.kills;
      acc.deaths += match.deaths;
      acc.assists += match.assists;
      return acc;
    },
    {
      kills: 0,
      deaths: 0,
      assists: 0,
    }
  );

  return calculateKda(total.kills, total.deaths, total.assists);
}

function getMainPosition(matches: SoloMatchForSummary[]) {
  if (matches.length === 0) {
    return null;
  }

  const positionMap = new Map<string, number>();

  for (const match of matches) {
    const position = match.position || "UNKNOWN";
    positionMap.set(position, (positionMap.get(position) ?? 0) + 1);
  }

  const sortedPositions = Array.from(positionMap.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return {
    position: sortedPositions[0]?.[0] ?? null,
    games: sortedPositions[0]?.[1] ?? 0,
  };
}

function getMostChampions(
  matches: SoloMatchForSummary[],
  championNameMap: Map<string, string>
) {
  const championMap = new Map<
    number,
    {
      championId: number;
      championName: string;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();

  for (const match of matches) {
    const current = championMap.get(match.championId) ?? {
      championId: match.championId,
      championName: match.championName,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };

    current.games += 1;
    current.wins += match.win ? 1 : 0;
    current.kills += match.kills;
    current.deaths += match.deaths;
    current.assists += match.assists;

    championMap.set(match.championId, current);
  }

  return Array.from(championMap.values())
    .map((champion) => ({
      championId: champion.championId,
      championName: champion.championName,
      championNameKo: getChampionNameKo(
        championNameMap,
        champion.championName,
        champion.championId
      ),
      games: champion.games,
      wins: champion.wins,
      losses: champion.games - champion.wins,
      winRate: calculateWinRate(champion.wins, champion.games),
      kda: calculateKda(champion.kills, champion.deaths, champion.assists),
      averageKills: Number((champion.kills / champion.games).toFixed(1)),
      averageDeaths: Number((champion.deaths / champion.games).toFixed(1)),
      averageAssists: Number((champion.assists / champion.games).toFixed(1)),
    }))
    .sort((a, b) => {
      if (b.games !== a.games) {
        return b.games - a.games;
      }

      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      return b.kda - a.kda;
    })
    .slice(0, MOST_CHAMPION_LIMIT);
}

function formatRecentMatch(
  match: SoloMatchForSummary,
  championNameMap: Map<string, string>
) {
  return {
    id: match.id,
    matchId: match.matchId,
    championId: match.championId,
    championName: match.championName,
    championNameKo: getChampionNameKo(
      championNameMap,
      match.championName,
      match.championId
    ),
    position: match.position,
    role: match.role,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    kda: calculateKda(match.kills, match.deaths, match.assists),
    win: match.win,
    gameDuration: match.gameDuration,
    gameCreation: match.gameCreation.toISOString(),
    summonerSpells: [match.summonerSpell1, match.summonerSpell2],
    runes: {
      primaryRuneId: match.primaryRuneId,
      subRuneId: match.subRuneId,
    },
    items: [
      match.item0,
      match.item1,
      match.item2,
      match.item3,
      match.item4,
      match.item5,
      match.item6,
    ],
    totalDamageDealtToChampions: match.totalDamageDealtToChampions,
    totalDamageTaken: match.totalDamageTaken,
    visionScore: match.visionScore,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const parsedPlayerId = Number(playerId);

    if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 플레이어 ID입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: {
        id: parsedPlayerId,
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        currentTier: true,
        peakTier: true,
        riotAccount: true,
        soloRankSnapshot: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const recentMatches = await prisma.playerSoloMatch.findMany({
      where: {
        playerId: parsedPlayerId,
      },
      orderBy: {
        gameCreation: "desc",
      },
      take: RECENT_MATCH_LIMIT,
    });

    const allSoloMatches = await prisma.playerSoloMatch.findMany({
      where: {
        playerId: parsedPlayerId,
      },
      orderBy: {
        gameCreation: "desc",
      },
    });

    const recentTotalGames = recentMatches.length;
    const recentWins = recentMatches.filter((match) => match.win).length;
    const recentLosses = recentTotalGames - recentWins;
    const championNameMap = await getKoreanChampionNameMap();

    const response = {
      player: {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        riotId: `${player.nickname}#${player.tag}`,
        currentTier: player.currentTier,
        peakTier: player.peakTier,
      },
      riotAccount: player.riotAccount
        ? {
            gameName: player.riotAccount.gameName,
            tagLine: player.riotAccount.tagLine,
            puuid: player.riotAccount.puuid,
            profileIconId: player.riotAccount.profileIconId,
            summonerLevel: player.riotAccount.summonerLevel,
            lastSyncedAt: player.riotAccount.lastSyncedAt?.toISOString() ?? null,
          }
        : null,
      soloRank: player.soloRankSnapshot
        ? {
            queueType: player.soloRankSnapshot.queueType,
            tier: player.soloRankSnapshot.tier,
            rank: player.soloRankSnapshot.rank,
            leaguePoints: player.soloRankSnapshot.leaguePoints,
            wins: player.soloRankSnapshot.wins,
            losses: player.soloRankSnapshot.losses,
            winRate: player.soloRankSnapshot.winRate,
            updatedAt: player.soloRankSnapshot.updatedAt.toISOString(),
          }
        : null,
      recentSummary: {
        totalGames: recentTotalGames,
        wins: recentWins,
        losses: recentLosses,
        winRate: calculateWinRate(recentWins, recentTotalGames),
        averageKda: getAverageKda(recentMatches),
        mainPosition: getMainPosition(recentMatches),
      },
      mostChampions: getMostChampions(allSoloMatches, championNameMap),
      recentMatches: recentMatches.map((match) =>
        formatRecentMatch(match, championNameMap)
      ),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[RIOT_PLAYER_SOLO_SUMMARY_GET_ERROR]", error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          message: "솔랭 분석 데이터를 불러오는 중 오류가 발생했습니다.",
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "솔랭 분석 데이터를 불러오는 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}