export type StatisticsPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
export type StatisticsTeam = "BLUE" | "RED";

export type PublishedMatchSource = Readonly<{
  id: string;
  seasonId: string;
  status: "DRAFT" | "PUBLISHED" | "VOIDED";
  games: readonly Readonly<{
    id: string;
    winnerTeam: StatisticsTeam;
    /** The S04 persisted result is authoritative; S05 never reselects an MVP. */
    mvpPlayerId: string;
    participants: readonly Readonly<{
      playerId: string;
      championKey: string;
      team: StatisticsTeam;
      position: StatisticsPosition;
    }>[];
  }>[];
}>;

export type PlayerSeasonStatistic = Readonly<{
  seasonId: string;
  playerId: string;
  generation: number;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  mvpCount: number;
}>;

export type PlayerChampionStatistic = Readonly<{
  seasonId: string;
  playerId: string;
  championKey: string;
  generation: number;
  games: number;
  wins: number;
  losses: number;
  mvpCount: number;
}>;

export type PlayerPositionStatistic = Readonly<{
  seasonId: string;
  playerId: string;
  position: StatisticsPosition;
  generation: number;
  games: number;
  wins: number;
  losses: number;
}>;

export type SeasonStatisticsProjection = Readonly<{
  seasonId: string;
  generation: number;
  sourceMatchCount: number;
  sourceGameCount: number;
  sourceParticipantCount: number;
  playerStats: readonly PlayerSeasonStatistic[];
  championStats: readonly PlayerChampionStatistic[];
  positionStats: readonly PlayerPositionStatistic[];
}>;

type MutablePlayerStatistic = {
  seriesIds: Set<string>;
  totalGames: number;
  wins: number;
  mvpCount: number;
};

type MutableDimensionStatistic = {
  games: number;
  wins: number;
  mvpCount: number;
};

function requireIdentifier(value: string, field: string): void {
  if (!value || value !== value.trim()) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
}

export function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const compared = compareCodeUnits(left[index] ?? "", right[index] ?? "");
    if (compared !== 0) return compared;
  }
  return 0;
}

/**
 * Rebuilds one season only from current PUBLISHED S04 aggregates. Input order has no
 * effect on the rows or their order. Draft/voided and other-season sources are ignored.
 */
export function buildSeasonStatisticsProjection(input: Readonly<{
  seasonId: string;
  generation: number;
  matches: readonly PublishedMatchSource[];
}>): SeasonStatisticsProjection {
  requireIdentifier(input.seasonId, "season_id");
  if (!Number.isSafeInteger(input.generation) || input.generation <= 0) {
    throw new Error("INVALID_GENERATION");
  }

  const playerMap = new Map<string, MutablePlayerStatistic>();
  const championMap = new Map<string, MutableDimensionStatistic>();
  const positionMap = new Map<string, MutableDimensionStatistic>();
  const matchIds = new Set<string>();
  const gameIds = new Set<string>();
  let sourceGameCount = 0;
  let sourceParticipantCount = 0;

  const includedMatches = input.matches.filter(
    (match) => match.status === "PUBLISHED" && match.seasonId === input.seasonId,
  );

  for (const match of includedMatches) {
    requireIdentifier(match.id, "match_id");
    if (matchIds.has(match.id)) throw new Error("DUPLICATE_MATCH_SOURCE");
    matchIds.add(match.id);

    for (const game of match.games) {
      requireIdentifier(game.id, "game_id");
      requireIdentifier(game.mvpPlayerId, "mvp_player_id");
      if (gameIds.has(game.id)) throw new Error("DUPLICATE_GAME_SOURCE");
      gameIds.add(game.id);
      sourceGameCount += 1;

      const gamePlayerIds = new Set<string>();
      let storedMvpSeen = false;
      for (const participant of game.participants) {
        requireIdentifier(participant.playerId, "player_id");
        requireIdentifier(participant.championKey, "champion_key");
        if (gamePlayerIds.has(participant.playerId)) {
          throw new Error("DUPLICATE_GAME_PLAYER_SOURCE");
        }
        gamePlayerIds.add(participant.playerId);
        sourceParticipantCount += 1;

        const won = participant.team === game.winnerTeam;
        const isMvp = participant.playerId === game.mvpPlayerId;
        storedMvpSeen ||= isMvp;

        const player = playerMap.get(participant.playerId) ?? {
          seriesIds: new Set<string>(),
          totalGames: 0,
          wins: 0,
          mvpCount: 0,
        };
        player.seriesIds.add(match.id);
        player.totalGames += 1;
        player.wins += won ? 1 : 0;
        player.mvpCount += isMvp ? 1 : 0;
        playerMap.set(participant.playerId, player);

        const championKey = `${participant.playerId}\u0000${participant.championKey}`;
        const champion = championMap.get(championKey) ?? { games: 0, wins: 0, mvpCount: 0 };
        champion.games += 1;
        champion.wins += won ? 1 : 0;
        champion.mvpCount += isMvp ? 1 : 0;
        championMap.set(championKey, champion);

        const positionKey = `${participant.playerId}\u0000${participant.position}`;
        const position = positionMap.get(positionKey) ?? { games: 0, wins: 0, mvpCount: 0 };
        position.games += 1;
        position.wins += won ? 1 : 0;
        positionMap.set(positionKey, position);
      }

      if (!storedMvpSeen) throw new Error("MVP_NOT_IN_GAME_SOURCE");
    }
  }

  const playerStats = [...playerMap.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([playerId, value]) => ({
      seasonId: input.seasonId,
      playerId,
      generation: input.generation,
      totalGames: value.totalGames,
      participationCount: value.seriesIds.size,
      wins: value.wins,
      losses: value.totalGames - value.wins,
      mvpCount: value.mvpCount,
    }));

  const championStats = [...championMap.entries()]
    .map(([key, value]) => {
      const [playerId, championKey] = key.split("\u0000", 2) as [string, string];
      return {
        seasonId: input.seasonId,
        playerId,
        championKey,
        generation: input.generation,
        games: value.games,
        wins: value.wins,
        losses: value.games - value.wins,
        mvpCount: value.mvpCount,
      };
    })
    .sort((left, right) =>
      compareTuple([left.playerId, left.championKey], [right.playerId, right.championKey]),
    );

  const positionStats = [...positionMap.entries()]
    .map(([key, value]) => {
      const [playerId, position] = key.split("\u0000", 2) as [string, StatisticsPosition];
      return {
        seasonId: input.seasonId,
        playerId,
        position,
        generation: input.generation,
        games: value.games,
        wins: value.wins,
        losses: value.games - value.wins,
      };
    })
    .sort((left, right) =>
      compareTuple([left.playerId, left.position], [right.playerId, right.position]),
    );

  return {
    seasonId: input.seasonId,
    generation: input.generation,
    sourceMatchCount: includedMatches.length,
    sourceGameCount,
    sourceParticipantCount,
    playerStats,
    championStats,
    positionStats,
  };
}

export type RankingCandidate = PlayerSeasonStatistic & Readonly<{
  playerStatus: "ACTIVE" | "INACTIVE";
  nickname: string;
  nicknameNormalized: string;
  tagLine: string;
  tagLineNormalized: string;
}>;

export type CanonicalRankingRow = RankingCandidate & Readonly<{ rank: number; winRate: number }>;

/** Descending exact rational comparison without rounded floating-point ranking. */
export function compareWinRateDescending(
  left: Pick<PlayerSeasonStatistic, "wins" | "totalGames">,
  right: Pick<PlayerSeasonStatistic, "wins" | "totalGames">,
): number {
  const leftNumerator = BigInt(left.wins) * BigInt(right.totalGames);
  const rightNumerator = BigInt(right.wins) * BigInt(left.totalGames);
  if (leftNumerator === rightNumerator) return 0;
  return leftNumerator > rightNumerator ? -1 : 1;
}

function canonicalRankingIdentity(candidate: RankingCandidate): readonly string[] {
  // Mutable display identity must never reshuffle an otherwise tied historical rank.
  return [candidate.playerId];
}

export function compareCanonicalRanking(left: RankingCandidate, right: RankingCandidate): number {
  return (
    compareWinRateDescending(left, right) ||
    right.participationCount - left.participationCount ||
    right.mvpCount - left.mvpCount ||
    compareTuple(canonicalRankingIdentity(left), canonicalRankingIdentity(right))
  );
}

export function winRatePercent(wins: number, totalGames: number): number {
  if (totalGames <= 0) return 0;
  return Math.round((wins * 1000) / totalGames) / 10;
}

export function buildCanonicalSeasonRanking(
  candidates: readonly RankingCandidate[],
  minimumParticipation = 10,
): readonly CanonicalRankingRow[] {
  if (!Number.isSafeInteger(minimumParticipation) || minimumParticipation < 0) {
    throw new Error("INVALID_MINIMUM_PARTICIPATION");
  }

  return candidates
    .filter(
      (candidate) =>
        candidate.playerStatus === "ACTIVE" &&
        candidate.totalGames > 0 &&
        candidate.participationCount >= minimumParticipation,
    )
    .sort(compareCanonicalRanking)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      winRate: winRatePercent(candidate.wins, candidate.totalGames),
    }));
}

export type PublicRankingRowDto = Readonly<{
  rank: number;
  playerId: string;
  displayName: string;
  riotId: string;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
}>;

/** Explicit public allowlist: member/account/Discord/override data can never spread through. */
export function toPublicRankingRowDto(row: CanonicalRankingRow): PublicRankingRowDto {
  return {
    rank: row.rank,
    playerId: row.playerId,
    displayName: row.nickname,
    riotId: `${row.nickname}#${row.tagLine}`,
    totalGames: row.totalGames,
    participationCount: row.participationCount,
    wins: row.wins,
    losses: row.losses,
    winRate: row.winRate,
    mvpCount: row.mvpCount,
  };
}
