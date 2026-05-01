const RIOT_API_KEY = process.env.RIOT_API_KEY;

const ACCOUNT_REGION = "asia";
const MATCH_REGION = "asia";
const PLATFORM_REGION = "kr";

const SOLO_RANK_QUEUE_ID = 420;
const SOLO_RANK_QUEUE_TYPE = "RANKED_SOLO_5x5";

type RiotAccountDto = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

type RiotSummonerDto = {
  id?: string;
  accountId?: string;
  puuid: string;
  profileIconId: number;
  revisionDate?: number;
  summonerLevel: number;

  // Riot 응답/환경 차이 대응용
  summonerId?: string;
  encryptedSummonerId?: string;
};

export type RiotLeagueEntryDto = {
  leagueId: string;
  summonerId: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
};

export type RiotMatchDto = {
  metadata: {
    dataVersion: string;
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameId: number;
    gameMode: string;
    gameName: string;
    gameStartTimestamp?: number;
    gameType: string;
    gameVersion: string;
    mapId: number;
    platformId: string;
    queueId: number;
    teams: Array<{
      teamId: number;
      win: boolean;
    }>;
    participants: RiotMatchParticipantDto[];
  };
};

export type RiotMatchParticipantDto = {
  puuid: string;
  summonerId: string;
  summonerName: string;
  riotIdGameName?: string;
  riotIdTagline?: string;

  championId: number;
  championName: string;

  teamPosition: string;
  role: string;

  kills: number;
  deaths: number;
  assists: number;
  win: boolean;

  summoner1Id: number;
  summoner2Id: number;

  perks?: {
    styles?: Array<{
      style: number;
      selections?: Array<{
        perk: number;
      }>;
    }>;
  };

  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;

  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
};

class RiotApiError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "RiotApiError";
    this.status = status;
    this.url = url;
  }
}

function getRiotApiKey() {
  if (!RIOT_API_KEY) {
    throw new Error("RIOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  return RIOT_API_KEY;
}

function normalizeTagLine(tagLine: string) {
  return tagLine.replace(/^#/, "").trim();
}

async function riotFetch<T>(url: string): Promise<T> {
  const apiKey = getRiotApiKey();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Riot-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Riot API 요청 실패: ${response.status}`;

    try {
      const data = await response.json();
      message = data?.status?.message ?? message;
    } catch {
      // Riot API가 JSON이 아닌 응답을 줄 수도 있으므로 무시
    }

    throw new RiotApiError(message, response.status, url);
  }

  return response.json() as Promise<T>;
}

export async function getRiotAccountByRiotId(
  gameName: string,
  tagLine: string
): Promise<RiotAccountDto> {
  const normalizedGameName = encodeURIComponent(gameName.trim());
  const normalizedTagLine = encodeURIComponent(normalizeTagLine(tagLine));

  const url =
    `https://${ACCOUNT_REGION}.api.riotgames.com` +
    `/riot/account/v1/accounts/by-riot-id/${normalizedGameName}/${normalizedTagLine}`;

  return riotFetch<RiotAccountDto>(url);
}

export async function getSummonerByPuuid(
  puuid: string
): Promise<RiotSummonerDto> {
  const encodedPuuid = encodeURIComponent(puuid);

  const url =
    `https://${PLATFORM_REGION}.api.riotgames.com` +
    `/lol/summoner/v4/summoners/by-puuid/${encodedPuuid}`;

  return riotFetch<RiotSummonerDto>(url);
}

export async function getLeagueEntriesBySummonerId(
  summonerId: string
): Promise<RiotLeagueEntryDto[]> {
  const encodedSummonerId = encodeURIComponent(summonerId);

  const url =
    `https://${PLATFORM_REGION}.api.riotgames.com` +
    `/lol/league/v4/entries/by-summoner/${encodedSummonerId}`;

  return riotFetch<RiotLeagueEntryDto[]>(url);
}

export async function getSoloRankEntryBySummonerId(
  summonerId: string
): Promise<RiotLeagueEntryDto | null> {
  const entries = await getLeagueEntriesBySummonerId(summonerId);

  return (
    entries.find((entry) => entry.queueType === SOLO_RANK_QUEUE_TYPE) ?? null
  );
}

export async function getLeagueEntriesByPuuid(
  puuid: string
): Promise<RiotLeagueEntryDto[]> {
  const encodedPuuid = encodeURIComponent(puuid);

  const url =
    `https://${PLATFORM_REGION}.api.riotgames.com` +
    `/lol/league/v4/entries/by-puuid/${encodedPuuid}`;

  return riotFetch<RiotLeagueEntryDto[]>(url);
}

export async function getSoloRankEntryByPuuid(
  puuid: string
): Promise<RiotLeagueEntryDto | null> {
  const entries = await getLeagueEntriesByPuuid(puuid);

  return (
    entries.find((entry) => entry.queueType === SOLO_RANK_QUEUE_TYPE) ?? null
  );
}

export async function getRankedMatchIdsByPuuid(
  puuid: string,
  count = 20,
  start = 0
): Promise<string[]> {
  const encodedPuuid = encodeURIComponent(puuid);

  const url =
    `https://${MATCH_REGION}.api.riotgames.com` +
    `/lol/match/v5/matches/by-puuid/${encodedPuuid}/ids` +
    `?queue=${SOLO_RANK_QUEUE_ID}&type=ranked&start=${start}&count=${count}`;

  return riotFetch<string[]>(url);
}

export async function getRecentRankedMatchIdsByPuuid(
  puuid: string,
  count = 20
): Promise<string[]> {
  return getRankedMatchIdsByPuuid(puuid, count, 0);
}

export async function getMatchById(matchId: string): Promise<RiotMatchDto> {
  const encodedMatchId = encodeURIComponent(matchId);

  const url =
    `https://${MATCH_REGION}.api.riotgames.com` +
    `/lol/match/v5/matches/${encodedMatchId}`;

  return riotFetch<RiotMatchDto>(url);
}

export function findParticipantByPuuid(match: RiotMatchDto, puuid: string) {
  return (
    match.info.participants.find(
      (participant) => participant.puuid === puuid
    ) ?? null
  );
}

export function isSoloRankMatch(match: RiotMatchDto) {
  return match.info.queueId === SOLO_RANK_QUEUE_ID;
}

export function calculateWinRate(wins: number, losses: number) {
  const total = wins + losses;

  if (total <= 0) {
    return 0;
  }

  return Number(((wins / total) * 100).toFixed(1));
}

export function calculateKda(kills: number, deaths: number, assists: number) {
  if (deaths <= 0) {
    return kills + assists;
  }

  return Number(((kills + assists) / deaths).toFixed(2));
}