import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

class RiotApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(`Riot API 요청 실패: ${status} ${statusText} - ${detail}`);
    this.name = "RiotApiError";
    this.status = status;
    this.detail = detail;
  }
}

type RiotAccountResponse = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

type RiotSummonerResponse = {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
};

type RiotLeagueEntryResponse = {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  summonerId: string;
  puuid: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
};

type RiotMatchResponse = {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameMode: string;
    queueId: number;
    participants: Array<{
      puuid: string;
      championName: string;
      championId: number;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      totalDamageDealtToChampions: number;
      totalDamageTaken: number;
    }>;
  };
};

type ChampionAggregate = {
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
  kda: string;
  avgDamageDealtToChampions: number;
  avgDamageTaken: number;
};

const RIOT_ACCOUNT_REGION = "asia";
const RIOT_PLATFORM_REGION = "kr";
const MATCH_COUNT = 20;

function getRiotApiKey() {
  const apiKey = process.env.RIOT_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RIOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  
  return apiKey;
}

async function riotFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": getRiotApiKey(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    throw new RiotApiError(
      response.status,
      response.statusText,
      errorText || "응답 본문 없음"
    );
  }

  return response.json() as Promise<T>;
}

function getChampionImageUrl(championName: string) {
  return `https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/${championName}.png`;
}

function calculateWinRate(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

function calculateKda(
  totalKills: number,
  totalDeaths: number,
  totalAssists: number
) {
  if (totalDeaths === 0) {
    return "Perfect";
  }

  return ((totalKills + totalAssists) / totalDeaths).toFixed(2);
}

function buildChampionAggregates(
  matches: RiotMatchResponse[],
  puuid: string
): ChampionAggregate[] {
  const championMap = new Map<
    string,
    {
      championKey: string;
      championName: string;
      championImageUrl: string | null;
      games: number;
      wins: number;
      losses: number;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      totalDamageDealtToChampions: number;
      totalDamageTaken: number;
    }
  >();

  for (const match of matches) {
    const me = match.info.participants.find(
      (participant) => participant.puuid === puuid
    );

    if (!me) continue;

    const championKey = me.championName;
    const existing = championMap.get(championKey);

    if (existing) {
      existing.games += 1;
      existing.wins += me.win ? 1 : 0;
      existing.losses += me.win ? 0 : 1;
      existing.totalKills += me.kills;
      existing.totalDeaths += me.deaths;
      existing.totalAssists += me.assists;
      existing.totalDamageDealtToChampions += me.totalDamageDealtToChampions;
      existing.totalDamageTaken += me.totalDamageTaken;
      continue;
    }

    championMap.set(championKey, {
      championKey,
      championName: me.championName,
      championImageUrl: getChampionImageUrl(me.championName),
      games: 1,
      wins: me.win ? 1 : 0,
      losses: me.win ? 0 : 1,
      totalKills: me.kills,
      totalDeaths: me.deaths,
      totalAssists: me.assists,
      totalDamageDealtToChampions: me.totalDamageDealtToChampions,
      totalDamageTaken: me.totalDamageTaken,
    });
  }

  return [...championMap.values()]
    .map((item) => ({
      championKey: item.championKey,
      championName: item.championName,
      championImageUrl: item.championImageUrl,
      games: item.games,
      wins: item.wins,
      losses: item.losses,
      winRate: calculateWinRate(item.wins, item.losses),
      totalKills: item.totalKills,
      totalDeaths: item.totalDeaths,
      totalAssists: item.totalAssists,
      avgKills: Number((item.totalKills / item.games).toFixed(1)),
      avgDeaths: Number((item.totalDeaths / item.games).toFixed(1)),
      avgAssists: Number((item.totalAssists / item.games).toFixed(1)),
      kda: calculateKda(
        item.totalKills,
        item.totalDeaths,
        item.totalAssists
      ),
      avgDamageDealtToChampions: Math.round(
        item.totalDamageDealtToChampions / item.games
      ),
      avgDamageTaken: Math.round(item.totalDamageTaken / item.games),
    }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.championName.localeCompare(b.championName, "ko");
    });
}

export async function POST(_req: NextRequest, context: RouteContext) {
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
    });

    if (!player) {
      return NextResponse.json(
        { error: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!player.nickname?.trim() || !player.tag?.trim()) {
      return NextResponse.json(
        { error: "플레이어의 닉네임 또는 태그가 비어 있습니다." },
        { status: 400 }
      );
    }

    const account = await riotFetch<RiotAccountResponse>(
      `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
        player.nickname.trim()
      )}/${encodeURIComponent(player.tag.trim())}`
    );

    const summoner = await riotFetch<RiotSummonerResponse>(
      `https://${RIOT_PLATFORM_REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
        account.puuid
      )}`
    );

    const leagueEntries = await riotFetch<RiotLeagueEntryResponse[]>(
      `https://${RIOT_PLATFORM_REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodeURIComponent(
        summoner.id
      )}`
    );

    const soloRank =
      leagueEntries.find(
        (entry) => entry.queueType === "RANKED_SOLO_5x5"
      ) ?? null;

    const flexRank =
      leagueEntries.find(
        (entry) => entry.queueType === "RANKED_FLEX_SR"
      ) ?? null;

    const matchIds = await riotFetch<string[]>(
      `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(
        account.puuid
      )}/ids?start=0&count=${MATCH_COUNT}`
    );

    const matches = await Promise.all(
      matchIds.map((matchId) =>
        riotFetch<RiotMatchResponse>(
          `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(
            matchId
          )}`
        )
      )
    );

    const championAggregates = buildChampionAggregates(matches, account.puuid);

    const snapshot = await prisma.playerRiotSnapshot.upsert({
      where: { playerId: id },
      update: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        summonerId: summoner.id,
        summonerLevel: summoner.summonerLevel,
        profileIconId: summoner.profileIconId,
        soloTier: soloRank?.tier ?? null,
        soloRank: soloRank?.rank ?? null,
        soloLp: soloRank?.leaguePoints ?? null,
        soloWins: soloRank?.wins ?? null,
        soloLosses: soloRank?.losses ?? null,
        soloWinRate: soloRank
          ? calculateWinRate(soloRank.wins, soloRank.losses)
          : null,
        flexTier: flexRank?.tier ?? null,
        flexRank: flexRank?.rank ?? null,
        flexLp: flexRank?.leaguePoints ?? null,
        flexWins: flexRank?.wins ?? null,
        flexLosses: flexRank?.losses ?? null,
        flexWinRate: flexRank
          ? calculateWinRate(flexRank.wins, flexRank.losses)
          : null,
        totalAnalyzedMatches: matches.length,
        lastRefreshedAt: new Date(),
      },
      create: {
        playerId: id,
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        summonerId: summoner.id,
        summonerLevel: summoner.summonerLevel,
        profileIconId: summoner.profileIconId,
        soloTier: soloRank?.tier ?? null,
        soloRank: soloRank?.rank ?? null,
        soloLp: soloRank?.leaguePoints ?? null,
        soloWins: soloRank?.wins ?? null,
        soloLosses: soloRank?.losses ?? null,
        soloWinRate: soloRank
          ? calculateWinRate(soloRank.wins, soloRank.losses)
          : null,
        flexTier: flexRank?.tier ?? null,
        flexRank: flexRank?.rank ?? null,
        flexLp: flexRank?.leaguePoints ?? null,
        flexWins: flexRank?.wins ?? null,
        flexLosses: flexRank?.losses ?? null,
        flexWinRate: flexRank
          ? calculateWinRate(flexRank.wins, flexRank.losses)
          : null,
        totalAnalyzedMatches: matches.length,
        lastRefreshedAt: new Date(),
      },
    });

    await prisma.playerRiotChampionSnapshot.deleteMany({
      where: { snapshotId: snapshot.id },
    });

    if (championAggregates.length > 0) {
      await prisma.playerRiotChampionSnapshot.createMany({
        data: championAggregates.map((champion) => ({
          snapshotId: snapshot.id,
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
          kda: champion.kda,
          avgDamageDealtToChampions:
            champion.avgDamageDealtToChampions,
          avgDamageTaken: champion.avgDamageTaken,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      message: "Riot 데이터 갱신 완료",
      totalAnalyzedMatches: matches.length,
      championCount: championAggregates.length,
    });
  } catch (error) {
    console.error("[PLAYER_RIOT_REFRESH_POST_ERROR]", error);

    if (error instanceof RiotApiError) {
      if (error.status === 403) {
        return NextResponse.json(
          {
            error:
              "Riot API 403 Forbidden: API 키가 만료되었거나, 유효하지 않거나, 현재 환경에서 사용할 수 없는 키입니다. Riot Developer Portal에서 키 상태와 프로젝트 키 종류를 확인하세요.",
            detail: error.detail,
          },
          { status: 403 }
        );
      }

      if (error.status === 404) {
        return NextResponse.json(
          {
            error:
              "Riot 계정을 찾을 수 없습니다. 닉네임 또는 태그를 확인하세요.",
            detail: error.detail,
          },
          { status: 404 }
        );
      }

      if (error.status === 429) {
        return NextResponse.json(
          {
            error: "Riot API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
            detail: error.detail,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: "Riot API 호출 중 오류가 발생했습니다.",
          detail: error.detail,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Riot 데이터 갱신 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
