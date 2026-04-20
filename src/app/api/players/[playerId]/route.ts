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

async function getRiotOverview(nickname: string, tag: string) {
  const encodedNickname = encodeURIComponent(nickname);
  const encodedTag = encodeURIComponent(tag);

  try {
    // 1) Riot Account 조회: 반드시 asia
    const account = await fetchRiotJson<RiotAccountResponse>(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedNickname}/${encodedTag}`
    );

    // 2) Summoner 조회: KR 서버
    const summoner = await fetchRiotJson<RiotSummonerResponse>(
      `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`
    );

    // 3) 랭크 조회: KR 서버
    const leagueEntries = await fetchRiotJson<RiotLeagueEntryResponse[]>(
      `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`
    );

    const soloRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ?? null;

    const flexRank =
      leagueEntries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ?? null;

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
            winRate:
              soloRank.wins + soloRank.losses > 0
                ? Math.round((soloRank.wins / (soloRank.wins + soloRank.losses)) * 100)
                : 0,
          }
        : null,
      flexRank: flexRank
        ? {
            tier: flexRank.tier,
            rank: flexRank.rank,
            leaguePoints: flexRank.leaguePoints,
            wins: flexRank.wins,
            losses: flexRank.losses,
            winRate:
              flexRank.wins + flexRank.losses > 0
                ? Math.round((flexRank.wins / (flexRank.wins + flexRank.losses)) * 100)
                : 0,
          }
        : null,
    };
  } catch (error) {
    console.error("[RIOT_OVERVIEW_ERROR]", error);

    return {
      success: false,
      message: "Riot 정보 조회에 실패했습니다.",
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
        ? await getRiotOverview(player.nickname, player.tag)
        : {
            success: false,
            message: "닉네임 또는 태그가 없어 Riot 정보를 조회할 수 없습니다.",
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