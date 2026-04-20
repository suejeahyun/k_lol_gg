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
      riotIdGameName?: string;
      riotIdTagline?: string;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      teamPosition?: string;
      individualPosition?: string;
      totalMinionsKilled?: number;
      neutralMinionsKilled?: number;
      goldEarned?: number;
      totalDamageDealtToChampions?: number;
      totalDamageTaken?: number;
    }>;
  };
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

function formatQueueName(queueId: number) {
  const queueMap: Record<number, string> = {
    400: "일반",
    420: "솔로랭크",
    430: "일반",
    440: "자유랭크",
    450: "칼바람",
    490: "일반",
    700: "격전",
    720: "칼바람",
    830: "봇전",
    840: "봇전",
    850: "봇전",
    900: "URF",
    1700: "아레나",
  };

  return queueMap[queueId] ?? `큐 ${queueId}`;
}

function formatPosition(position?: string) {
  if (!position) return "UNKNOWN";

  const map: Record<string, string> = {
    TOP: "TOP",
    JUNGLE: "JGL",
    MIDDLE: "MID",
    BOTTOM: "ADC",
    UTILITY: "SUP",
    NONE: "NONE",
    INVALID: "UNKNOWN",
  };

  return map[position] ?? position;
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

async function getRiotOverviewAndRecentMatches(nickname: string, tag: string) {
  const encodedNickname = encodeURIComponent(nickname.trim());
  const encodedTag = encodeURIComponent(tag.trim());
  const lolRegion = getLolRegion();
  const accountRegion = getAccountRegion();

  try {
    const account = await fetchRiotJson<RiotAccountResponse>(
      `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedNickname}/${encodedTag}`
    );

    const encodedPuuid = encodeURIComponent(account.puuid);

    const [summoner, leagueEntries, matchIds] = await Promise.all([
      fetchRiotJson<RiotSummonerResponse>(
        `https://${lolRegion}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodedPuuid}`
      ),
      fetchRiotJson<RiotLeagueEntryResponse[]>(
        `https://${lolRegion}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodedPuuid}`
      ),
      fetchRiotJson<RiotMatchIdsResponse>(
        `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodedPuuid}/ids?start=0&count=20`
      ),
    ]);

    const soloRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? null;

    const flexRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;

    let recentMatches: Array<{
      matchId: string;
      gameCreation: number;
      gameDuration: number;
      queueId: number;
      queueLabel: string;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      kda: string;
      win: boolean;
      position: string;
      cs: number;
      goldEarned: number;
      totalDamageDealtToChampions: number;
      totalDamageTaken: number;
    }> = [];

    if (matchIds.length > 0) {
      const matchResults = await Promise.allSettled(
        matchIds.map((matchId) =>
          fetchRiotJson<RiotMatchResponse>(
            `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`
          )
        )
      );

      recentMatches = matchResults
        .filter(
          (
            result
          ): result is PromiseFulfilledResult<RiotMatchResponse> =>
            result.status === "fulfilled"
        )
        .map((result) => result.value)
        .map((match) => {
          const me = match.info.participants.find(
            (participant) => participant.puuid === account.puuid
          );

          if (!me) {
            return null;
          }

          const cs =
            (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0);

          const kdaValue =
            me.deaths === 0
              ? "Perfect"
              : ((me.kills + me.assists) / me.deaths).toFixed(2);

          const position = formatPosition(
            me.teamPosition || me.individualPosition
          );

          return {
            matchId: match.metadata.matchId,
            gameCreation: match.info.gameCreation,
            gameDuration: match.info.gameDuration,
            queueId: match.info.queueId,
            queueLabel: formatQueueName(match.info.queueId),
            championName: me.championName,
            kills: me.kills,
            deaths: me.deaths,
            assists: me.assists,
            kda: kdaValue,
            win: me.win,
            position,
            cs,
            goldEarned: me.goldEarned ?? 0,
            totalDamageDealtToChampions:
              me.totalDamageDealtToChampions ?? 0,
            totalDamageTaken: me.totalDamageTaken ?? 0,
          };
        })
        .filter(
          (
            match
          ): match is {
            matchId: string;
            gameCreation: number;
            gameDuration: number;
            queueId: number;
            queueLabel: string;
            championName: string;
            kills: number;
            deaths: number;
            assists: number;
            kda: string;
            win: boolean;
            position: string;
            cs: number;
            goldEarned: number;
            totalDamageDealtToChampions: number;
            totalDamageTaken: number;
          } => match !== null
        );
    }

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
        profileIconId: summoner.profileIconId,
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
      recentMatches,
    };
  } catch (error) {
    console.error("[RIOT_OVERVIEW_ERROR]", error);

    return {
      success: false,
      message:
        "Riot 전적 정보를 불러오지 못했습니다. Riot API 키가 없거나, 닉네임/태그가 실제 Riot ID와 다를 수 있습니다.",
      recentMatches: [],
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
        ? await getRiotOverviewAndRecentMatches(player.nickname, player.tag)
        : {
            success: false,
            message:
              "닉네임 또는 태그가 없어 Riot 정보를 조회할 수 없습니다.",
            recentMatches: [],
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