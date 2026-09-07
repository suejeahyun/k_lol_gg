import {
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_TEAMS,
  type TeamBalancePosition,
  type TeamBalanceTeam,
} from "./team-balance";

export type TeamRecommendationState = "READY" | "NO_SELECTION" | "NO_PROJECTION";

export type TeamRecommendationChampion = Readonly<{
  championKey: string;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  winRateBp: number;
  mvpCount: number;
  scoreBp: number;
}>;

export type TeamRecommendationPick = Readonly<{
  playerId: string;
  displayName: string;
  position: TeamBalancePosition;
  champions: readonly TeamRecommendationChampion[];
}>;

export type TeamRecommendationBan = TeamRecommendationChampion & Readonly<{
  targetPlayerId: string;
  targetDisplayName: string;
  targetPosition: TeamBalancePosition;
  priorityBp: number;
  reasonCode: "HIGH_MASTERY" | "HIGH_SAMPLE" | "LIMITED_SAMPLE";
}>;

export type TeamBalanceRecommendationDto = Readonly<{
  state: TeamRecommendationState;
  draft: Readonly<{
    id: string;
    title: string;
    status: "EVALUATED" | "SAVED" | "ARCHIVED";
    revision: number;
  }>;
  projection: Readonly<{
    seasonId: string;
    seasonName: string;
    generation: number;
    calculatedAt: string;
  }> | null;
  team: TeamBalanceTeam;
  opponentTeam: TeamBalanceTeam;
  picks: readonly TeamRecommendationPick[];
  bans: readonly TeamRecommendationBan[];
  summary: Readonly<{
    selectedPlayerCount: number;
    championStatRowCount: number;
    playersWithChampionData: number;
  }>;
}>;

export type TeamRecommendationAssignment = Readonly<{
  playerId: string;
  displayName: string;
  team: TeamBalanceTeam;
  position: TeamBalancePosition;
}>;

export type TeamRecommendationChampionStat = Readonly<{
  playerId: string;
  championKey: string;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  mvpCount: number;
}>;

export type BuildTeamBalanceRecommendationInput = Readonly<{
  draft: TeamBalanceRecommendationDto["draft"];
  projection: TeamBalanceRecommendationDto["projection"];
  assignments: readonly TeamRecommendationAssignment[] | null;
  championStats: readonly TeamRecommendationChampionStat[];
  team: TeamBalanceTeam;
}>;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRatioDescending(leftWins: number, leftGames: number, rightWins: number, rightGames: number) {
  const left = BigInt(leftWins) * BigInt(rightGames);
  const right = BigInt(rightWins) * BigInt(leftGames);
  return left > right ? -1 : left < right ? 1 : 0;
}

function championRecommendation(row: TeamRecommendationChampionStat): TeamRecommendationChampion {
  if (![row.games, row.wins, row.losses, row.mvpCount].every(Number.isSafeInteger) ||
      row.games <= 0 || row.wins < 0 || row.losses < 0 || row.mvpCount < 0 ||
      row.wins + row.losses !== row.games || row.mvpCount > row.games) {
    throw new Error("INVALID_TEAM_RECOMMENDATION_STAT");
  }
  const winRateBp = Math.floor((row.wins * 10_000) / row.games);
  const mvpRateBp = Math.floor((row.mvpCount * 10_000) / row.games);
  const confidenceBp = Math.min(10_000, row.games * 1_000);
  const scoreBp = Math.floor((winRateBp * 55 + confidenceBp * 30 + mvpRateBp * 15) / 100);
  return {
    championKey: row.championKey,
    championName: row.championName,
    games: row.games,
    wins: row.wins,
    losses: row.losses,
    winRateBp,
    mvpCount: row.mvpCount,
    scoreBp,
  };
}

function compareChampions(
  left: TeamRecommendationChampion,
  right: TeamRecommendationChampion,
) {
  return right.scoreBp - left.scoreBp || right.games - left.games ||
    compareRatioDescending(left.wins, left.games, right.wins, right.games) ||
    right.mvpCount - left.mvpCount || compareText(left.championKey, right.championKey);
}

function emptyResult(
  input: BuildTeamBalanceRecommendationInput,
  state: Exclude<TeamRecommendationState, "READY">,
  picks: readonly TeamRecommendationPick[] = [],
): TeamBalanceRecommendationDto {
  return Object.freeze({
    state,
    draft: input.draft,
    projection: input.projection,
    team: input.team,
    opponentTeam: input.team === "RED" ? "BLUE" : "RED",
    picks: Object.freeze(picks),
    bans: Object.freeze([]),
    summary: Object.freeze({ selectedPlayerCount: picks.length, championStatRowCount: 0, playersWithChampionData: 0 }),
  });
}

function validateAssignments(assignments: readonly TeamRecommendationAssignment[]) {
  if (assignments.length !== 10 || new Set(assignments.map((entry) => entry.playerId)).size !== 10) {
    throw new Error("INVALID_TEAM_RECOMMENDATION_ASSIGNMENTS");
  }
  for (const team of TEAM_BALANCE_TEAMS) {
    const teamAssignments = assignments.filter((entry) => entry.team === team);
    if (teamAssignments.length !== 5 ||
        TEAM_BALANCE_POSITIONS.some((position) => teamAssignments.filter((entry) => entry.position === position).length !== 1)) {
      throw new Error("INVALID_TEAM_RECOMMENDATION_ASSIGNMENTS");
    }
  }
}

export function buildTeamBalanceRecommendation(
  input: BuildTeamBalanceRecommendationInput,
): TeamBalanceRecommendationDto {
  if (!TEAM_BALANCE_TEAMS.includes(input.team)) throw new Error("INVALID_TEAM_RECOMMENDATION_TEAM");
  if (!input.assignments) return emptyResult(input, "NO_SELECTION");
  validateAssignments(input.assignments);

  const ownAssignments = input.assignments
    .filter((entry) => entry.team === input.team)
    .sort((left, right) => TEAM_BALANCE_POSITIONS.indexOf(left.position) - TEAM_BALANCE_POSITIONS.indexOf(right.position));
  const emptyPicks = ownAssignments.map((entry) => Object.freeze({
    playerId: entry.playerId,
    displayName: entry.displayName,
    position: entry.position,
    champions: Object.freeze([]) as readonly TeamRecommendationChampion[],
  }));
  if (!input.projection) return emptyResult(input, "NO_PROJECTION", emptyPicks);

  const assignmentByPlayer = new Map(input.assignments.map((entry) => [entry.playerId, entry]));
  const statsByPlayer = new Map<string, TeamRecommendationChampion[]>();
  for (const row of input.championStats) {
    if (!assignmentByPlayer.has(row.playerId)) continue;
    const rows = statsByPlayer.get(row.playerId) ?? [];
    rows.push(championRecommendation(row));
    statsByPlayer.set(row.playerId, rows);
  }
  for (const rows of statsByPlayer.values()) rows.sort(compareChampions);

  const picks = ownAssignments.map((entry) => Object.freeze({
    playerId: entry.playerId,
    displayName: entry.displayName,
    position: entry.position,
    champions: Object.freeze((statsByPlayer.get(entry.playerId) ?? []).slice(0, 3)),
  }));
  const opponentTeam = input.team === "RED" ? "BLUE" : "RED";
  const bestBanByChampion = new Map<string, TeamRecommendationBan>();
  for (const assignment of input.assignments.filter((entry) => entry.team === opponentTeam)) {
    for (const champion of statsByPlayer.get(assignment.playerId) ?? []) {
      const priorityBp = champion.scoreBp + Math.min(2_000, champion.games * 100);
      const candidate = Object.freeze({
        ...champion,
        targetPlayerId: assignment.playerId,
        targetDisplayName: assignment.displayName,
        targetPosition: assignment.position,
        priorityBp,
        reasonCode: champion.games < 3 ? "LIMITED_SAMPLE" as const
          : champion.scoreBp >= 6_500 ? "HIGH_MASTERY" as const
            : "HIGH_SAMPLE" as const,
      });
      const current = bestBanByChampion.get(champion.championKey);
      if (!current || candidate.priorityBp > current.priorityBp ||
          (candidate.priorityBp === current.priorityBp && compareText(candidate.targetPlayerId, current.targetPlayerId) < 0)) {
        bestBanByChampion.set(champion.championKey, candidate);
      }
    }
  }
  const bans = [...bestBanByChampion.values()].sort((left, right) =>
    right.priorityBp - left.priorityBp || compareChampions(left, right) ||
    compareText(left.targetPlayerId, right.targetPlayerId)).slice(0, 5);

  return Object.freeze({
    state: "READY",
    draft: input.draft,
    projection: input.projection,
    team: input.team,
    opponentTeam,
    picks: Object.freeze(picks),
    bans: Object.freeze(bans),
    summary: Object.freeze({
      selectedPlayerCount: input.assignments.length,
      championStatRowCount: input.championStats.length,
      playersWithChampionData: statsByPlayer.size,
    }),
  });
}
