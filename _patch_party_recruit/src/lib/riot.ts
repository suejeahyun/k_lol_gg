type RiotAccountDto = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

type RiotSummonerDto = {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
};

type RiotLeagueEntryDto = {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  summonerId: string;
  puuid?: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

type RiotMatchListItem = string;

type RiotParticipantDto = {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  individualPosition?: string;
  teamPosition?: string;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  goldEarned?: number;
  totalDamageDealtToChampions?: number;
  queueId?: number;
};

type RiotMatchInfoDto = {
  gameCreation: number;
  gameDuration: number;
  gameMode: string;
  queueId: number;
  participants: RiotParticipantDto[];
};

type RiotMatchDto = {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: RiotMatchInfoDto;
};

export type RiotRecentMatch = {
  matchId: string;
  championName: string;
  result: "승리" | "패배";
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  gold: number;
  damage: number;
  position: string;
  queueId: number;
  playedAt: string;
  durationSec: number;
};

export type RiotPlayerOverview = {
  riotId: string;
  summonerLevel: number;
  soloRank: {
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  } | null;
  flexRank: {
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  } | null;
  recentMatches: RiotRecentMatch[];
  recentSummary: {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKda: number;
    avgCs: number;
    avgGold: number;
    avgDamage: number;
  };
  opggUrl: string;
};

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_LOL_REGION = process.env.RIOT_LOL_REGION ?? "kr";
const RIOT_ACCOUNT_REGION = process.env.RIOT_ACCOUNT_REGION ?? "asia";

function getHeaders() {
  if (!RIOT_API_KEY) {
    throw new Error("RIOT_API_KEY가 설정되지 않았습니다.");
  }

  return {
    "X-Riot-Token": RIOT_API_KEY,
  };
}

async function riotFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[RIOT_API_ERROR] ${response.status} ${response.statusText} ${text}`
    );
  }

  return response.json() as Promise<T>;
}

function formatTier(tier: string, rank: string) {
  const tierMap: Record<string, string> = {
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

  const rankMap: Record<string, string> = {
    I: "1",
    II: "2",
    III: "3",
    IV: "4",
  };

  const tierLabel = tierMap[tier] ?? tier;
  const rankLabel = rankMap[rank] ?? rank;

  if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)) {
    return tierLabel;
  }

  return `${tierLabel} ${rankLabel}`;
}

function getQueueLabel(queueId: number) {
  const queueMap: Record<number, string> = {
    420: "솔로랭크",
    440: "자유랭크",
    450: "무작위 총력전",
    400: "일반",
    430: "일반",
    490: "일반",
    1700: "아레나",
  };

  return queueMap[queueId] ?? `큐 ${queueId}`;
}

function getPositionLabel(position?: string) {
  const value = position?.toUpperCase() ?? "";

  const positionMap: Record<string, string> = {
    TOP: "탑",
    JUNGLE: "정글",
    MIDDLE: "미드",
    MID: "미드",
    BOTTOM: "원딜",
    ADC: "원딜",
    UTILITY: "서포터",
    SUPPORT: "서포터",
  };

  return positionMap[value] ?? "기타";
}

function calcKda(kills: number, deaths: number, assists: number) {
  if (deaths === 0) {
    return Number((kills + assists).toFixed(2));
  }

  return Number(((kills + assists) / deaths).toFixed(2));
}

function calcWinRate(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Number(((wins / total) * 100).toFixed(1));
}

export async function getRiotPlayerOverview(
  gameName: string,
  tagLine: string,
  count = 20
): Promise<RiotPlayerOverview | null> {
  const safeGameName = encodeURIComponent(gameName.trim());
  const safeTagLine = encodeURIComponent(tagLine.trim());

  if (!safeGameName || !safeTagLine) {
    return null;
  }

  try {
    const account = await riotFetch<RiotAccountDto>(
      `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${safeGameName}/${safeTagLine}`
    );

    const summoner = await riotFetch<RiotSummonerDto>(
      `https://${RIOT_LOL_REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`
    );

    const leagueEntries = await riotFetch<RiotLeagueEntryDto[]>(
      `https://${RIOT_LOL_REGION}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner.id}`
    );

    const soloEntry =
      leagueEntries.find((entry) => entry.queueType === "RANKED_SOLO_5x5") ??
      null;

    const flexEntry =
      leagueEntries.find((entry) => entry.queueType === "RANKED_FLEX_SR") ??
      null;

    const matchIds = await riotFetch<RiotMatchListItem[]>(
      `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${account.puuid}/ids?start=0&count=${count}`
    );

    const matchDetails = await Promise.all(
      matchIds.map((matchId) =>
        riotFetch<RiotMatchDto>(
          `https://${RIOT_ACCOUNT_REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`
        )
      )
    );

    const recentMatches: RiotRecentMatch[] = matchDetails
      .map((match) => {
        const me = match.info.participants.find(
          (participant) => participant.puuid === account.puuid
        );

        if (!me) {
          return null;
        }

        const cs =
          (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0);

        return {
          matchId: match.metadata.matchId,
          championName: me.championName,
          result: me.win ? "승리" : "패배",
          kills: me.kills,
          deaths: me.deaths,
          assists: me.assists,
          kda: calcKda(me.kills, me.deaths, me.assists),
          cs,
          gold: me.goldEarned ?? 0,
          damage: me.totalDamageDealtToChampions ?? 0,
          position: getPositionLabel(
            me.individualPosition || me.teamPosition || ""
          ),
          queueId: match.info.queueId,
          playedAt: new Date(match.info.gameCreation).toISOString(),
          durationSec: match.info.gameDuration,
        };
      })
      .filter((value): value is RiotRecentMatch => value !== null);

    const wins = recentMatches.filter((match) => match.result === "승리").length;
    const losses = recentMatches.length - wins;

    const totalKills = recentMatches.reduce((sum, match) => sum + match.kills, 0);
    const totalDeaths = recentMatches.reduce(
      (sum, match) => sum + match.deaths,
      0
    );
    const totalAssists = recentMatches.reduce(
      (sum, match) => sum + match.assists,
      0
    );
    const totalCs = recentMatches.reduce((sum, match) => sum + match.cs, 0);
    const totalGold = recentMatches.reduce((sum, match) => sum + match.gold, 0);
    const totalDamage = recentMatches.reduce(
      (sum, match) => sum + match.damage,
      0
    );

    return {
      riotId: `${account.gameName}#${account.tagLine}`,
      summonerLevel: summoner.summonerLevel,
      soloRank: soloEntry
        ? {
            tier: formatTier(soloEntry.tier, soloEntry.rank),
            rank: soloEntry.rank,
            leaguePoints: soloEntry.leaguePoints,
            wins: soloEntry.wins,
            losses: soloEntry.losses,
            winRate: calcWinRate(soloEntry.wins, soloEntry.losses),
          }
        : null,
      flexRank: flexEntry
        ? {
            tier: formatTier(flexEntry.tier, flexEntry.rank),
            rank: flexEntry.rank,
            leaguePoints: flexEntry.leaguePoints,
            wins: flexEntry.wins,
            losses: flexEntry.losses,
            winRate: calcWinRate(flexEntry.wins, flexEntry.losses),
          }
        : null,
      recentMatches,
      recentSummary: {
        totalGames: recentMatches.length,
        wins,
        losses,
        winRate: calcWinRate(wins, losses),
        avgKda: calcKda(totalKills, totalDeaths, totalAssists),
        avgCs:
          recentMatches.length > 0
            ? Math.round(totalCs / recentMatches.length)
            : 0,
        avgGold:
          recentMatches.length > 0
            ? Math.round(totalGold / recentMatches.length)
            : 0,
        avgDamage:
          recentMatches.length > 0
            ? Math.round(totalDamage / recentMatches.length)
            : 0,
      },
      opggUrl: `https://www.op.gg/summoners/kr/${encodeURIComponent(
        account.gameName
      )}-${encodeURIComponent(account.tagLine)}`,
    };
  } catch (error) {
    console.error("[RIOT_OVERVIEW_ERROR]", error);
    return null;
  }
}

export { getQueueLabel };