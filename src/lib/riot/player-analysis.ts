import { prisma } from "@/lib/prisma/client";
import {
  getChampionNameKo,
  getKoreanChampionNameMap,
} from "@/lib/riot/champion";

const RECENT_MATCH_LIMIT = 20;
const MOST_CHAMPION_LIMIT = 10;

const TIER_LABELS: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서포터",
  UNKNOWN: "미정",
};

type SoloMatchForAnalysis = {
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
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
};

export type RiotPlayerAnalysis = NonNullable<Awaited<ReturnType<typeof getRiotPlayerAnalysis>>>;

function calculateWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return 0;
  return Number(((wins / totalGames) * 100).toFixed(1));
}

function calculateKda(kills: number, deaths: number, assists: number) {
  if (deaths <= 0) return Number((kills + assists).toFixed(2));
  return Number(((kills + assists) / deaths).toFixed(2));
}

function toAverage(total: number, count: number, digits = 1) {
  if (count <= 0) return 0;
  return Number((total / count).toFixed(digits));
}

function getPositionStats(matches: SoloMatchForAnalysis[]) {
  const positionMap = new Map<
    string,
    {
      position: string;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();

  for (const match of matches) {
    const position = match.position || "UNKNOWN";
    const current = positionMap.get(position) ?? {
      position,
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

    positionMap.set(position, current);
  }

  return Array.from(positionMap.values())
    .map((position) => ({
      position: position.position,
      label: formatRiotPosition(position.position),
      games: position.games,
      wins: position.wins,
      losses: position.games - position.wins,
      winRate: calculateWinRate(position.wins, position.games),
      kda: calculateKda(position.kills, position.deaths, position.assists),
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kda - a.kda);
}

function getChampionStats(matches: SoloMatchForAnalysis[], championNameMap: Map<string, string>) {
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
        champion.championId,
      ),
      games: champion.games,
      wins: champion.wins,
      losses: champion.games - champion.wins,
      winRate: calculateWinRate(champion.wins, champion.games),
      kda: calculateKda(champion.kills, champion.deaths, champion.assists),
      averageKills: toAverage(champion.kills, champion.games),
      averageDeaths: toAverage(champion.deaths, champion.games),
      averageAssists: toAverage(champion.assists, champion.games),
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kda - a.kda)
    .slice(0, MOST_CHAMPION_LIMIT);
}

async function getSafeChampionNameMap() {
  try {
    return await getKoreanChampionNameMap();
  } catch {
    return new Map<string, string>();
  }
}

export function formatRiotTier(tier: string | null | undefined, rank: string | null | undefined, lp: number | null | undefined) {
  if (!tier) return "Unranked";

  const tierLabel = TIER_LABELS[tier] ?? tier;
  const leaguePoints = typeof lp === "number" ? lp : 0;

  if (tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER") {
    return `${tierLabel} ${leaguePoints}LP`;
  }

  return `${tierLabel} ${rank ?? ""} ${leaguePoints}LP`.trim();
}

export function formatRiotPosition(position: string | null | undefined) {
  if (!position) return "미정";
  return POSITION_LABELS[position] ?? position;
}

export function formatKstDateTime(value: string | number | Date | null | undefined) {
  if (!value) return "기록 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function formatGameDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}분 ${remainSeconds.toString().padStart(2, "0")}초`;
}

export async function getRiotPlayerAnalysis(playerId: number) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      currentTier: true,
      peakTier: true,
      riotAccount: {
        select: {
          gameName: true,
          tagLine: true,
          profileIconId: true,
          summonerLevel: true,
          isVerified: true,
          syncStatus: true,
          lastSyncedAt: true,
          lastErrorMessage: true,
          lastErrorAt: true,
        },
      },
      soloRankSnapshot: {
        select: {
          queueType: true,
          tier: true,
          rank: true,
          leaguePoints: true,
          wins: true,
          losses: true,
          winRate: true,
          updatedAt: true,
        },
      },
      soloMatches: {
        orderBy: { gameCreation: "desc" },
        select: {
          id: true,
          matchId: true,
          championId: true,
          championName: true,
          position: true,
          role: true,
          kills: true,
          deaths: true,
          assists: true,
          win: true,
          gameDuration: true,
          gameCreation: true,
          totalDamageDealtToChampions: true,
          totalDamageTaken: true,
          visionScore: true,
        },
      },
    },
  });

  if (!player) return null;

  const championNameMap = await getSafeChampionNameMap();
  const allSoloMatches = player.soloMatches;
  const recentMatches = allSoloMatches.slice(0, RECENT_MATCH_LIMIT);
  const totalGames = recentMatches.length;
  const wins = recentMatches.filter((match) => match.win).length;
  const losses = totalGames - wins;
  const kills = recentMatches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = recentMatches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = recentMatches.reduce((sum, match) => sum + match.assists, 0);
  const totalDamage = recentMatches.reduce((sum, match) => sum + match.totalDamageDealtToChampions, 0);
  const totalTaken = recentMatches.reduce((sum, match) => sum + match.totalDamageTaken, 0);
  const totalVision = recentMatches.reduce((sum, match) => sum + match.visionScore, 0);
  const positionStats = getPositionStats(recentMatches);

  return {
    player: {
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      currentTier: player.currentTier,
      peakTier: player.peakTier,
      riotId: `${player.nickname}#${player.tag}`,
    },
    riotAccount: player.riotAccount,
    soloRank: player.soloRankSnapshot,
    recentSummary: {
      totalGames,
      wins,
      losses,
      winRate: calculateWinRate(wins, totalGames),
      averageKda: calculateKda(kills, deaths, assists),
      averageKills: toAverage(kills, totalGames),
      averageDeaths: toAverage(deaths, totalGames),
      averageAssists: toAverage(assists, totalGames),
      averageDamage: Math.round(toAverage(totalDamage, totalGames, 0)),
      averageTaken: Math.round(toAverage(totalTaken, totalGames, 0)),
      averageVision: toAverage(totalVision, totalGames),
      mainPosition: positionStats[0] ?? null,
    },
    positionStats,
    mostChampions: getChampionStats(allSoloMatches, championNameMap),
    recentChampions: getChampionStats(recentMatches, championNameMap).slice(0, 5),
    recentMatches: recentMatches.map((match) => ({
      id: match.id,
      matchId: match.matchId,
      championId: match.championId,
      championName: match.championName,
      championNameKo: getChampionNameKo(championNameMap, match.championName, match.championId),
      position: match.position,
      role: match.role,
      kills: match.kills,
      deaths: match.deaths,
      assists: match.assists,
      kda: calculateKda(match.kills, match.deaths, match.assists),
      win: match.win,
      gameDuration: match.gameDuration,
      gameCreation: match.gameCreation,
      totalDamageDealtToChampions: match.totalDamageDealtToChampions,
      totalDamageTaken: match.totalDamageTaken,
      visionScore: match.visionScore,
    })),
    allSoloMatchCount: allSoloMatches.length,
  };
}
