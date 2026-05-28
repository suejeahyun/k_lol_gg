import { prisma } from "@/lib/prisma/client";

type TeamValue = "RED" | "BLUE";
type PositionValue = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type DraftPlayer = {
  id: number;
  playerId: number;
  team: TeamValue;
  position: PositionValue;
  score: number | null;
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    currentTier: string | null;
    peakTier: string | null;
  };
};

type ChampionMastery = {
  championId: number;
  championName: string;
  imageUrl: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  mvpCount: number;
  recentGames: number;
  recentWins: number;
  recentWinRate: number;
  confidence: number;
  masteryScore: number;
  lastPlayedAt: Date | null;
};

type PlayerRecommendation = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  position: PositionValue;
  team: TeamValue;
  score: number | null;
  championPoolScore: number;
  championPoolLabel: string;
  topChampions: ChampionMastery[];
};

type BanRecommendation = ChampionMastery & {
  playerId: number;
  playerName: string;
  nickname: string;
  tag: string;
  position: PositionValue;
  reason: string;
  priorityScore: number;
};

type RolePairRecommendation = {
  pairType: string;
  label: string;
  playerA: string;
  playerB: string;
  positionA: PositionValue;
  positionB: PositionValue;
  games: number;
  wins: number;
  winRate: number | null;
  expectedWinRate: number | null;
  overPerformance: number | null;
  confidence: number;
  synergyScore: number;
  verdict: string;
};

type TeamRecommendation = {
  team: TeamValue;
  pickRecommendations: PlayerRecommendation[];
  banRecommendations: BanRecommendation[];
  rolePairs: RolePairRecommendation[];
  plans: string[];
  notes: string[];
};

const POSITION_ORDER: PositionValue[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const CORE_ROLE_PAIRS: Array<{
  pairType: string;
  label: string;
  a: PositionValue;
  b: PositionValue;
  max: number;
}> = [
  { pairType: "ADC_SUP", label: "바텀 듀오", a: "ADC", b: "SUP", max: 5 },
  { pairType: "JGL_MID", label: "미드-정글", a: "JGL", b: "MID", max: 5 },
  { pairType: "JGL_TOP", label: "탑-정글", a: "JGL", b: "TOP", max: 4 },
  { pairType: "JGL_SUP", label: "정글-서폿", a: "JGL", b: "SUP", max: 3.5 },
  { pairType: "JGL_ADC", label: "정글-원딜", a: "JGL", b: "ADC", max: 3 },
  { pairType: "MID_SUP", label: "미드-서폿", a: "MID", b: "SUP", max: 3 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getKda(kills: number, deaths: number, assists: number) {
  return (kills + assists) / Math.max(1, deaths);
}

function getConfidence(games: number, required = 10) {
  return clamp(games / required, 0, 1);
}

function getMasteryLabel(score: number, confidence: number) {
  if (confidence < 0.3) return "표본 부족";
  if (score >= 78) return "주력 픽";
  if (score >= 68) return "안정 픽";
  if (score >= 58) return "사용 가능";
  return "주의";
}

function getPoolLabel(score: number) {
  if (score >= 75) return "매우 안정";
  if (score >= 65) return "안정";
  if (score >= 52) return "보통";
  if (score > 0) return "좁음";
  return "데이터 없음";
}

function normalizeWinRate(wins: number, games: number) {
  return games > 0 ? (wins / games) * 100 : 50;
}

function buildChampionMastery(raw: {
  championId: number;
  championName: string;
  imageUrl: string | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  mvpCount: number;
  recentGames: number;
  recentWins: number;
  lastPlayedAt: Date | null;
}): ChampionMastery {
  const winRate = normalizeWinRate(raw.wins, raw.games);
  const recentWinRate = normalizeWinRate(raw.recentWins, raw.recentGames);
  const kda = getKda(raw.kills, raw.deaths, raw.assists);
  const confidence = getConfidence(raw.games);
  const gamesScore = clamp(raw.games * 10, 0, 100);
  const kdaScore = clamp((kda / 4) * 100, 0, 100);
  const mvpScore = raw.games > 0 ? clamp((raw.mvpCount / raw.games) * 500, 0, 100) : 0;
  const rawScore = winRate * 0.3 + kdaScore * 0.25 + gamesScore * 0.2 + recentWinRate * 0.15 + mvpScore * 0.1;
  const masteryScore = rawScore * (0.45 + confidence * 0.55);

  return {
    ...raw,
    losses: Math.max(0, raw.games - raw.wins),
    winRate,
    kda,
    recentWinRate,
    confidence,
    masteryScore,
  };
}

function getPositionWinRates(histories: HistoryRow[]) {
  const map = new Map<string, { games: number; wins: number }>();

  for (const item of histories) {
    const key = `${item.playerId}:${item.position}`;
    const current = map.get(key) ?? { games: 0, wins: 0 };
    current.games += 1;
    if (item.team === item.game.winnerTeam) current.wins += 1;
    map.set(key, current);
  }

  return map;
}

type HistoryRow = Awaited<ReturnType<typeof getHistoryRows>>[number];

async function getHistoryRows(playerIds: number[], seasonId: number | null | undefined) {
  return prisma.matchParticipant.findMany({
    where: {
      playerId: { in: playerIds },
      ...(seasonId
        ? {
            game: {
              series: {
                seasonId,
              },
            },
          }
        : {}),
    },
    include: {
      champion: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
      game: {
        select: {
          id: true,
          winnerTeam: true,
          mvpPlayerId: true,
          series: {
            select: {
              id: true,
              matchDate: true,
            },
          },
        },
      },
    },
  });
}

function buildMasteryMap(histories: HistoryRow[]) {
  const now = Date.now();
  const recentMs = 90 * 24 * 60 * 60 * 1000;
  const map = new Map<string, ReturnType<typeof buildChampionMastery>>();
  const rawMap = new Map<
    string,
    {
      championId: number;
      championName: string;
      imageUrl: string | null;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      mvpCount: number;
      recentGames: number;
      recentWins: number;
      lastPlayedAt: Date | null;
    }
  >();

  for (const item of histories) {
    const key = `${item.playerId}:${item.position}:${item.championId}`;
    const current = rawMap.get(key) ?? {
      championId: item.championId,
      championName: item.champion.name,
      imageUrl: item.champion.imageUrl,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      mvpCount: 0,
      recentGames: 0,
      recentWins: 0,
      lastPlayedAt: null,
    };

    const won = item.team === item.game.winnerTeam;
    const playedAt = item.game.series.matchDate;
    const isRecent = now - playedAt.getTime() <= recentMs;

    current.games += 1;
    if (won) current.wins += 1;
    current.kills += item.kills;
    current.deaths += item.deaths;
    current.assists += item.assists;
    if (item.game.mvpPlayerId === item.playerId) current.mvpCount += 1;
    if (isRecent) {
      current.recentGames += 1;
      if (won) current.recentWins += 1;
    }
    if (!current.lastPlayedAt || playedAt > current.lastPlayedAt) {
      current.lastPlayedAt = playedAt;
    }

    rawMap.set(key, current);
  }

  for (const [key, raw] of rawMap.entries()) {
    map.set(key, buildChampionMastery(raw));
  }

  return map;
}

function getTopChampions(
  masteryMap: Map<string, ChampionMastery>,
  playerId: number,
  position: PositionValue,
  take = 5,
) {
  const prefix = `${playerId}:${position}:`;
  return [...masteryMap.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .sort((a, b) => b.masteryScore - a.masteryScore || b.games - a.games)
    .slice(0, take);
}

function getChampionPoolScore(champions: ChampionMastery[]) {
  if (champions.length === 0) return 0;
  const reliableCount = champions.filter((champion) => champion.games >= 3).length;
  const topAverage = champions.slice(0, 3).reduce((sum, item) => sum + item.masteryScore, 0) / Math.max(1, Math.min(3, champions.length));
  const poolBonus = clamp(reliableCount * 7, 0, 25);
  return clamp(topAverage * 0.75 + poolBonus, 0, 100);
}

function buildPlayerRecommendations(draftPlayers: DraftPlayer[], masteryMap: Map<string, ChampionMastery>) {
  return draftPlayers.map((item) => {
    const topChampions = getTopChampions(masteryMap, item.playerId, item.position, 5);
    const championPoolScore = getChampionPoolScore(topChampions);

    return {
      playerId: item.playerId,
      name: item.player.name,
      nickname: item.player.nickname,
      tag: item.player.tag,
      position: item.position,
      team: item.team,
      score: item.score,
      championPoolScore,
      championPoolLabel: getPoolLabel(championPoolScore),
      topChampions,
    } satisfies PlayerRecommendation;
  });
}

function buildBanRecommendations(opponents: PlayerRecommendation[]) {
  const bans: BanRecommendation[] = [];

  for (const player of opponents) {
    for (const champion of player.topChampions.slice(0, 3)) {
      if (champion.games < 2) continue;
      const priorityScore =
        champion.masteryScore * 0.58 +
        champion.confidence * 22 +
        Math.max(0, (player.score ?? 50) - 50) * 0.2 +
        (champion.recentGames > 0 ? 8 : 0);

      bans.push({
        ...champion,
        playerId: player.playerId,
        playerName: player.name,
        nickname: player.nickname,
        tag: player.tag,
        position: player.position,
        priorityScore,
        reason: `${player.position} ${player.name}의 ${getMasteryLabel(champion.masteryScore, champion.confidence)} · ${champion.games}판 ${champion.winRate.toFixed(1)}%`,
      });
    }
  }

  return bans
    .sort((a, b) => b.priorityScore - a.priorityScore || b.masteryScore - a.masteryScore)
    .slice(0, 7);
}

function groupHistoriesByGame(histories: HistoryRow[]) {
  const map = new Map<number, HistoryRow[]>();
  for (const item of histories) {
    const current = map.get(item.game.id) ?? [];
    current.push(item);
    map.set(item.game.id, current);
  }
  return map;
}

function findByPosition(players: DraftPlayer[], position: PositionValue) {
  return players.find((player) => player.position === position) ?? null;
}

function getPairStat(
  pair: { label: string; pairType: string; a: PositionValue; b: PositionValue; max: number },
  teamPlayers: DraftPlayer[],
  historiesByGame: Map<number, HistoryRow[]>,
  positionWinRates: Map<string, { games: number; wins: number }>,
): RolePairRecommendation | null {
  const playerA = findByPosition(teamPlayers, pair.a);
  const playerB = findByPosition(teamPlayers, pair.b);
  if (!playerA || !playerB) return null;

  let games = 0;
  let wins = 0;

  for (const rows of historiesByGame.values()) {
    const rowA = rows.find((row) => row.playerId === playerA.playerId && row.position === pair.a);
    const rowB = rows.find((row) => row.playerId === playerB.playerId && row.position === pair.b);

    if (!rowA || !rowB) continue;
    if (rowA.team !== rowB.team) continue;

    games += 1;
    if (rowA.team === rowA.game.winnerTeam) wins += 1;
  }

  const winRate = games > 0 ? (wins / games) * 100 : null;
  const statA = positionWinRates.get(`${playerA.playerId}:${pair.a}`);
  const statB = positionWinRates.get(`${playerB.playerId}:${pair.b}`);
  const expectedWinRate = statA && statB ? (normalizeWinRate(statA.wins, statA.games) + normalizeWinRate(statB.wins, statB.games)) / 2 : null;
  const overPerformance = winRate !== null && expectedWinRate !== null ? winRate - expectedWinRate : null;
  const confidence = getConfidence(games, 10);
  const synergyScore =
    overPerformance === null ? 0 : clamp((overPerformance / 100) * 30 * confidence, -pair.max, pair.max);

  let verdict = "데이터 부족";
  if (games >= 3 && synergyScore >= 2) verdict = "좋은 호흡";
  else if (games >= 3 && synergyScore <= -2) verdict = "주의 조합";
  else if (games >= 3) verdict = "보통";

  return {
    pairType: pair.pairType,
    label: pair.label,
    playerA: playerA.player.name,
    playerB: playerB.player.name,
    positionA: pair.a,
    positionB: pair.b,
    games,
    wins,
    winRate,
    expectedWinRate,
    overPerformance,
    confidence,
    synergyScore,
    verdict,
  };
}

function buildRolePairRecommendations(
  teamPlayers: DraftPlayer[],
  historiesByGame: Map<number, HistoryRow[]>,
  positionWinRates: Map<string, { games: number; wins: number }>,
) {
  return CORE_ROLE_PAIRS.map((pair) => getPairStat(pair, teamPlayers, historiesByGame, positionWinRates))
    .filter((item): item is RolePairRecommendation => Boolean(item))
    .sort((a, b) => Math.abs(b.synergyScore) - Math.abs(a.synergyScore) || b.games - a.games);
}

function buildPlans(team: TeamValue, players: PlayerRecommendation[], rolePairs: RolePairRecommendation[]) {
  const teamPlayers = players.filter((item) => item.team === team);
  const byPosition = new Map(teamPlayers.map((item) => [item.position, item]));
  const strongest = [...teamPlayers].sort((a, b) => b.championPoolScore - a.championPoolScore || (b.score ?? 0) - (a.score ?? 0))[0];
  const weakest = [...teamPlayers].sort((a, b) => a.championPoolScore - b.championPoolScore || (a.score ?? 0) - (b.score ?? 0))[0];
  const jglMid = rolePairs.find((item) => item.pairType === "JGL_MID");
  const adcSup = rolePairs.find((item) => item.pairType === "ADC_SUP");
  const jgl = byPosition.get("JGL");
  const mid = byPosition.get("MID");
  const adc = byPosition.get("ADC");
  const sup = byPosition.get("SUP");

  const plans: string[] = [];

  if ((jglMid?.synergyScore ?? 0) >= 1.5 || ((jgl?.championPoolScore ?? 0) + (mid?.championPoolScore ?? 0)) / 2 >= 65) {
    plans.push("1안 · 미드-정글 주도권: 초반 강가 시야, 2:2 교전, 전령/첫 용 설계를 우선합니다.");
  }

  if ((adcSup?.synergyScore ?? 0) >= 1.5 || ((adc?.championPoolScore ?? 0) + (sup?.championPoolScore ?? 0)) / 2 >= 65) {
    plans.push("2안 · 바텀 캐리 보호: 바텀 라인전 안정, 용 시야, 후반 원딜 딜각 보호를 우선합니다.");
  }

  if (strongest) {
    plans.push(`3안 · 강점 라인 활용: ${strongest.position} ${strongest.name}의 챔피언 풀을 중심으로 밴픽 우선권을 줍니다.`);
  }

  if (weakest && weakest.championPoolScore < 45) {
    plans.push(`주의 · ${weakest.position} ${weakest.name}은 기록상 챔피언 풀 표본이 적습니다. 안정 픽 또는 후픽 배정을 권장합니다.`);
  }

  return plans.slice(0, 4);
}

function buildNotes(players: PlayerRecommendation[], rolePairs: RolePairRecommendation[]) {
  const notes: string[] = [];
  const lowData = players.filter((item) => item.topChampions.length === 0 || item.championPoolScore < 35);
  const strongPair = rolePairs.find((item) => item.synergyScore >= 2);
  const weakPair = rolePairs.find((item) => item.synergyScore <= -2);

  if (strongPair) {
    notes.push(`${strongPair.label}(${strongPair.playerA}-${strongPair.playerB})는 기존 내전 기록상 기대치보다 좋은 결과가 있습니다.`);
  }
  if (weakPair) {
    notes.push(`${weakPair.label}(${weakPair.playerA}-${weakPair.playerB})는 기존 기록상 주의 조합입니다. 강한 픽 또는 라인 개입 보정이 필요합니다.`);
  }
  if (lowData.length > 0) {
    notes.push(`챔피언 기록 표본이 부족한 플레이어: ${lowData.map((item) => `${item.position} ${item.name}`).join(", ")}`);
  }
  if (notes.length === 0) {
    notes.push("치명적인 조합 리스크는 낮습니다. 밴픽 단계에서 상대 주력 픽만 우선 차단하면 됩니다.");
  }

  return notes;
}

export async function getTeamBalanceDraftRecommendations(draftId: number) {
  const draft = await prisma.teamBalanceDraft.findUnique({
    where: { id: draftId },
    include: {
      season: { select: { id: true, name: true } },
      players: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              nickname: true,
              tag: true,
              currentTier: true,
              peakTier: true,
            },
          },
        },
      },
    },
  });

  if (!draft) return null;

  const draftPlayers = draft.players as DraftPlayer[];
  const playerIds = draftPlayers.map((item) => item.playerId);
  const histories = await getHistoryRows(playerIds, draft.seasonId);
  const masteryMap = buildMasteryMap(histories);
  const playerRecommendations = buildPlayerRecommendations(draftPlayers, masteryMap);
  const historiesByGame = groupHistoriesByGame(histories);
  const positionWinRates = getPositionWinRates(histories);

  const teams = (["RED", "BLUE"] as const).map((team) => {
    const ownPlayers = playerRecommendations
      .filter((item) => item.team === team)
      .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position));
    const opponentPlayers = playerRecommendations.filter((item) => item.team !== team);
    const rawTeamPlayers = draftPlayers.filter((item) => item.team === team);
    const rolePairs = buildRolePairRecommendations(rawTeamPlayers, historiesByGame, positionWinRates);

    return {
      team,
      pickRecommendations: ownPlayers,
      banRecommendations: buildBanRecommendations(opponentPlayers),
      rolePairs,
      plans: buildPlans(team, playerRecommendations, rolePairs),
      notes: buildNotes(ownPlayers, rolePairs),
    } satisfies TeamRecommendation;
  });

  const allBanTargets = [...teams[0].banRecommendations, ...teams[1].banRecommendations];
  const totalChampionData = playerRecommendations.reduce((sum, item) => sum + item.topChampions.length, 0);
  const averagePoolScore =
    playerRecommendations.reduce((sum, item) => sum + item.championPoolScore, 0) / Math.max(1, playerRecommendations.length);

  return {
    draft: {
      id: draft.id,
      title: draft.title,
      seasonName: draft.season?.name ?? null,
      createdAt: draft.createdAt,
      optionType: draft.optionType,
      redTotal: draft.redTotal,
      blueTotal: draft.blueTotal,
      diff: draft.diff,
    },
    summary: {
      historyRows: histories.length,
      championDataCount: totalChampionData,
      averagePoolScore,
      banCandidateCount: allBanTargets.length,
    },
    teams,
  };
}
