import { recordRiotApiRequestLog } from "@/lib/riot/audit";
import {
  assertRiotFeatureEnabled,
  getRiotPlatformRegion,
  getRiotRegionalRoute,
} from "@/lib/riot/feature";

const ACCOUNT_REGION = getRiotRegionalRoute();
const MATCH_REGION = getRiotRegionalRoute();
const PLATFORM_REGION = getRiotPlatformRegion();

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
  assertRiotFeatureEnabled();

  const riotApiKey = process.env.RIOT_API_KEY?.trim();

  if (!riotApiKey) {
    throw new Error("RIOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  return riotApiKey;
}

function normalizeTagLine(tagLine: string) {
  return tagLine.replace(/^#/, "").trim();
}

function getRiotEndpointName(url: string) {
  try {
    const { pathname } = new URL(url);

    if (pathname.includes("/riot/account/v1/accounts/by-riot-id/")) return "ACCOUNT_BY_RIOT_ID";
    if (pathname.includes("/lol/summoner/v4/summoners/by-puuid/")) return "SUMMONER_BY_PUUID";
    if (pathname.includes("/lol/league/v4/entries/by-summoner/")) return "LEAGUE_BY_SUMMONER_ID";
    if (pathname.includes("/lol/league/v4/entries/by-puuid/")) return "LEAGUE_BY_PUUID";
    if (pathname.includes("/lol/match/v5/matches/by-puuid/")) return "MATCH_IDS_BY_PUUID";
    if (pathname.includes("/lol/match/v5/matches/")) return "MATCH_BY_ID";

    return pathname;
  } catch {
    return "UNKNOWN_RIOT_ENDPOINT";
  }
}

function getRiotRequestTarget(url: string) {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    return parts.at(-1);
  } catch {
    return undefined;
  }
}

function getRiotErrorCode(status: number) {
  if (status === 401) return "RIOT_KEY_INVALID";
  if (status === 403) return "RIOT_KEY_FORBIDDEN_OR_EXPIRED";
  if (status === 404) return "RIOT_NOT_FOUND";
  if (status === 429) return "RIOT_RATE_LIMITED";
  if (status >= 500) return "RIOT_SERVER_ERROR";
  return "RIOT_REQUEST_FAILED";
}

async function riotFetch<T>(url: string): Promise<T> {
  const apiKey = getRiotApiKey();
  const startedAt = Date.now();
  const endpoint = getRiotEndpointName(url);
  const target = getRiotRequestTarget(url);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Riot-Token": apiKey,
      },
      cache: "no-store",
    });
  } catch (error) {
    await recordRiotApiRequestLog({
      endpoint,
      target,
      source: "RIOT_CLIENT",
      durationMs: Date.now() - startedAt,
      errorCode: "RIOT_FETCH_ERROR",
      message: error instanceof Error ? error.message : String(error ?? "UNKNOWN_ERROR"),
    });
    throw error;
  }

  if (!response.ok) {
    let message = `Riot API 요청 실패: ${response.status}`;

    if (response.status === 401) message = "Riot API 키가 올바르지 않습니다.";
    if (response.status === 403) message = "Riot API 키 권한 또는 만료 상태를 확인해야 합니다.";
    if (response.status === 404) message = "Riot ID를 찾을 수 없습니다.";
    if (response.status === 429) message = "Riot API 호출 제한에 도달했습니다.";

    try {
      const data = await response.json();
      message = data?.status?.message ? `${message} (${data.status.message})` : message;
    } catch {
      // Riot API가 JSON이 아닌 응답을 줄 수도 있으므로 무시
    }

    await recordRiotApiRequestLog({
      endpoint,
      target,
      source: "RIOT_CLIENT",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      errorCode: getRiotErrorCode(response.status),
      message,
    });

    throw new RiotApiError(message, response.status, url);
  }

  const data = (await response.json()) as T;

  await recordRiotApiRequestLog({
    endpoint,
    target,
    source: "RIOT_CLIENT",
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
  });

  return data;
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