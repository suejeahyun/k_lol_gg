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
  summonerLevel: number;
};

type RiotLeagueEntryResponse = {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

type RiotMatchIdsResponse = string[];

type RiotMatchResponse = {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    participants: Array<{
      puuid: string;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      totalDamageDealtToChampions?: number;
      totalDamageTaken?: number;
    }>;
  };
};

type ChampionSummaryItem = {
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

function getRiotApiKey() {
  return process.env.RIOT_API_KEY?.trim() ?? "";
}

function getLolRegion() {
  return process.env.RIOT_LOL_REGION?.trim() || "kr";
}

function getAccountRegion() {
  return process.env.RIOT_ACCOUNT_REGION?.trim() || "asia";
}

function calcWinRate(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

async function fetchRiotJson<T>(url: string): Promise<T> {
  const apiKey = getRiotApiKey();

  if (!apiKey) {
    throw new Error("[RIOT_API_KEY_MISSING]");
  }

  const response = await fetch(url, {
    headers: {
      "X-Riot-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[RIOT_API_ERROR] ${response.status} ${response.statusText} ${text}`);
  }

  return response.json() as Promise<T>;
}

function isSoloRankQueue(queueId: number) {
  return queueId === 420;
}

function extractChampionKeyFromImageUrl(imageUrl: string) {
  const fileName = imageUrl.split("/").pop() ?? "";
  return fileName.replace(".png", "");
}

async function getChampionNameMap() {
  const champions = await prisma.champion.findMany({
    select: {
      name: true,
      imageUrl: true,
    },
  });

  const championMap = new Map<
    string,
    {
      koName: string;
      imageUrl: string;
    }
  >();

  for (const champion of champions) {
    const key = extractChampionKeyFromImageUrl(champion.imageUrl);
    if (!key) continue;

    championMap.set(key, {
      koName: champion.name,
      imageUrl: champion.imageUrl,
    });
  }

  return championMap;
}

async function getAllMatchIdsByPuuid(
  puuid: string,
  accountRegion: string
): Promise<string[]> {
  const encodedPuuid = encodeURIComponent(puuid);
  const pageSize = 100;
  let start = 0;
  const allMatchIds: string[] = [];

  while (true) {
    const batch = await fetchRiotJson<RiotMatchIdsResponse>(
      `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodedPuuid}/ids?start=${start}&count=${pageSize}`
    );

    if (batch.length === 0) {
      break;
    }

    allMatchIds.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return allMatchIds;
}

function buildChampionSummary(
  puuid: string,
  matches: RiotMatchResponse[],
  championMap: Map<string, { koName: string; imageUrl: string }>
): ChampionSummaryItem[] {
  const summaryMap = new Map<
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
    const me = match.info.participants.find((participant) => participant.puuid === puuid);

    if (!me) continue;

    const mappedChampion = championMap.get(me.championName);
    const current = summaryMap.get(me.championName) ?? {
      championKey: me.championName,
      championName: mappedChampion?.koName ?? me.championName,
      championImageUrl: mappedChampion?.imageUrl ?? null,
      games: 0,
      wins: 0,
      losses: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      totalDamageDealtToChampions: 0,
      totalDamageTaken: 0,
    };

    current.games += 1;
    current.wins += me.win ? 1 : 0;
    current.losses += me.win ? 0 : 1;
    current.totalKills += me.kills;
    current.totalDeaths += me.deaths;
    current.totalAssists += me.assists;
    current.totalDamageDealtToChampions += me.totalDamageDealtToChampions ?? 0;
    current.totalDamageTaken += me.totalDamageTaken ?? 0;

    summaryMap.set(me.championName, current);
  }

  return Array.from(summaryMap.values())
    .map((item) => {
      const avgKills = Number((item.totalKills / item.games).toFixed(2));
      const avgDeaths = Number((item.totalDeaths / item.games).toFixed(2));
      const avgAssists = Number((item.totalAssists / item.games).toFixed(2));
      const kda =
        item.totalDeaths === 0
          ? "Perfect"
          : ((item.totalKills + item.totalAssists) / item.totalDeaths).toFixed(2);

      return {
        championKey: item.championKey,
        championName: item.championName,
        championImageUrl: item.championImageUrl,
        games: item.games,
        wins: item.wins,
        losses: item.losses,
        winRate: calcWinRate(item.wins, item.losses),
        totalKills: item.totalKills,
        totalDeaths: item.totalDeaths,
        totalAssists: item.totalAssists,
        avgKills,
        avgDeaths,
        avgAssists,
        kda,
        avgDamageDealtToChampions: Math.round(
          item.totalDamageDealtToChampions / item.games
        ),
        avgDamageTaken: Math.round(item.totalDamageTaken / item.games),
      };
    })
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;

      const aKda = a.kda === "Perfect" ? Number.POSITIVE_INFINITY : Number(a.kda);
      const bKda = b.kda === "Perfect" ? Number.POSITIVE_INFINITY : Number(b.kda);

      return bKda - aKda;
    });
}

async function getRiotOverviewAndChampionSummary(nickname: string, tag: string) {
  const encodedNickname = encodeURIComponent(nickname.trim());
  const encodedTag = encodeURIComponent(tag.trim());
  const lolRegion = getLolRegion();
  const accountRegion = getAccountRegion();

  try {
    const championMap = await getChampionNameMap();

    const account = await fetchRiotJson<RiotAccountResponse>(
      `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedNickname}/${encodedTag}`
    );

    const encodedPuuid = encodeURIComponent(account.puuid);

    const [summoner, leagueEntries] = await Promise.all([
      fetchRiotJson<RiotSummonerResponse>(
        `https://${lolRegion}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodedPuuid}`
      ),
      fetchRiotJson<RiotLeagueEntryResponse[]>(
        `https://${lolRegion}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodedPuuid}`
      ),
    ]);

    const soloRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? null;

    const flexRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;

    const allMatchIds = await getAllMatchIdsByPuuid(account.puuid, accountRegion);

    const matchResults = await Promise.allSettled(
      allMatchIds.map((matchId) =>
        fetchRiotJson<RiotMatchResponse>(
          `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`
        )
      )
    );

    const fullMatches = matchResults
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<RiotMatchResponse> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);

      const soloRankMatches = fullMatches.filter((match) =>
        isSoloRankQueue(match.info.queueId)
      );

      const championSummary = buildChampionSummary(
        account.puuid,
        soloRankMatches,
        championMap
      );

    return {
      success: true,
      account: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
      },
      summoner: {
        id: summoner.id,
        level: summoner.summonerLevel,
      },
      soloRank: soloRank
        ? {
            tier: soloRank.tier,
            rank: soloRank.rank,
            leaguePoints: soloRank.leaguePoints,
            wins: soloRank.wins,
            losses: soloRank.losses,
            winRate: calcWinRate(soloRank.wins, soloRank.losses),
          }
        : null,
      flexRank: flexRank
        ? {
            tier: flexRank.tier,
            rank: flexRank.rank,
            leaguePoints: flexRank.leaguePoints,
            wins: flexRank.wins,
            losses: flexRank.losses,
            winRate: calcWinRate(flexRank.wins, flexRank.losses),
          }
        : null,
      championSummary,
      totalAnalyzedMatches: soloRankMatches.length,
    };
  } catch (error) {
    console.error("[RIOT_OVERVIEW_ERROR]", error);

    return {
      success: false,
      message:
        "Riot 챔피언 집계 정보를 불러오지 못했습니다. Riot API 키가 없거나, 닉네임/태그가 실제 Riot ID와 다를 수 있습니다.",
      championSummary: [],
      totalAnalyzedMatches: 0,
    };
  }
}

export async function GET(_: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 플레이어 ID입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        participants: {
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
          orderBy: {
            id: "desc",
          },
        },
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const riotOverview =
      player.nickname && player.tag
        ? await getRiotOverviewAndChampionSummary(player.nickname, player.tag)
        : {
            success: false,
            message:
              "닉네임 또는 태그가 없어 Riot 정보를 조회할 수 없습니다.",
            championSummary: [],
            totalAnalyzedMatches: 0,
          };

    return NextResponse.json({
      ...player,
      riotOverview,
    });
  } catch (error) {
    console.error("[PLAYER_GET_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 플레이어 ID입니다." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as UpdatePlayerBody;

    const name = body.name?.trim();
    const nickname = body.nickname?.trim();
    const tag = body.tag?.trim();
    const peakTier = normalizeTier(body.peakTier);
    const currentTier = normalizeTier(body.currentTier);

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(peakTier)) {
      return NextResponse.json(
        { message: "최대 티어 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(currentTier)) {
      return NextResponse.json(
        { message: "현재 티어 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        tag,
        peakTier,
        currentTier,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PLAYER_UPDATE_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 플레이어 ID입니다." },
        { status: 400 }
      );
    }

    await prisma.player.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PLAYER_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}